import { createHash, createPrivateKey, randomBytes, sign, timingSafeEqual } from 'node:crypto';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});
const project = 'houseswipe-b390e';
const idPattern = /^v2_[a-f0-9]{40}$/;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
const legacyPattern = /^[a-f0-9]{40}$/;
let credentials;
let accessToken;

function reply(statusCode, body) {
  return { statusCode, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }, body: JSON.stringify(body) };
}

async function serviceAccount() {
  if (!credentials) {
    const result = await ssm.send(new GetParameterCommand({ Name: process.env.FIREBASE_ADMIN_PARAMETER, WithDecryption: true }));
    credentials = JSON.parse(result.Parameter.Value);
    if (credentials.project_id !== project) throw new Error('Unexpected Firebase project');
  }
  return credentials;
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

async function token() {
  if (accessToken && accessToken.expires > Date.now() + 60_000) return accessToken.value;
  const account = await serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: account.token_uri, iat: now, exp: now + 3600 }));
  const signed = `${header}.${payload}`;
  const assertion = `${signed}.${sign('RSA-SHA256', Buffer.from(signed), createPrivateKey(account.private_key)).toString('base64url')}`;
  const response = await fetch(account.token_uri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`Google token request failed: ${response.status}`);
  const data = await response.json();
  accessToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return accessToken.value;
}

const documents = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;

async function firestore(path, options = {}) {
  const response = await fetch(`${documents}/${path}`, {
    ...options,
    headers: { authorization: `Bearer ${await token()}`, ...(options.body ? { 'content-type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(12000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore ${options.method ?? 'GET'} failed: ${response.status}`);
  return response.status === 204 ? {} : response.json();
}

async function createBoard() {
  const id = `v2_${randomBytes(20).toString('hex')}`;
  const ownerToken = randomBytes(32).toString('base64url');
  await firestore(`boards?documentId=${id}`, {
    method: 'POST',
    body: JSON.stringify({ fields: { active: { booleanValue: true }, ownerHash: { stringValue: createHash('sha256').update(ownerToken).digest('hex') } } }),
  });
  return reply(201, { boardId: id, ownerToken });
}

async function deleteBoard(id, authorization) {
  if (!idPattern.test(id)) return reply(410, { error: 'List not found' });
  const provided = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(authorization ?? '')?.[1];
  if (!provided) return reply(401, { error: 'Management key required' });
  const board = await firestore(`boards/${id}`);
  if (!board) return reply(410, { error: 'List not found' });
  const expected = Buffer.from(board.fields?.ownerHash?.stringValue ?? '', 'hex');
  const actual = createHash('sha256').update(provided).digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return reply(401, { error: 'Invalid management key' });

  // Tombstone first. Rules block clients from recreating items during the purge.
  if (board.fields.active?.booleanValue !== false) {
    await firestore(`boards/${id}?updateMask.fieldPaths=active`, { method: 'PATCH', body: JSON.stringify({ fields: { active: { booleanValue: false } } }) });
  }
  for (;;) {
    const page = await firestore(`boards/${id}/items?pageSize=100`);
    const items = page?.documents ?? [];
    if (!items.length) break;
    await Promise.all(items.map((item) => firestore(item.name.replace(`projects/${project}/databases/(default)/documents/`, ''), { method: 'DELETE' })));
  }
  return reply(200, { deleted: true });
}

// ---- Private usage statistics (/stats page). The Firestore rules forbid clients from reading the counters, so this route reads them
// with the admin key, behind a password kept in SSM (never in the repo or the page).
let statsPassword;
async function expectedPassword() {
  if (statsPassword === undefined) {
    const result = await ssm.send(new GetParameterCommand({ Name: process.env.STATS_PASSWORD_PARAMETER, WithDecryption: true }));
    statsPassword = createHash('sha256').update(result.Parameter.Value.trim()).digest();
  }
  return statsPassword;
}

export function passwordMatches(provided, expectedDigest) {
  const actual = createHash('sha256').update(String(provided ?? '')).digest();
  return actual.length === expectedDigest.length && timingSafeEqual(actual, expectedDigest);
}

function numberFields(doc) {
  const out = {};
  for (const [key, value] of Object.entries(doc.fields ?? {})) out[key] = Number(value.integerValue ?? 0);
  return out;
}

async function listAll(collection, keep) {
  const out = [];
  let pageToken = '';
  do {
    const page = await firestore(`${collection}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
    for (const doc of page?.documents ?? []) {
      const id = doc.name.split('/').pop();
      if (keep(id)) out.push({ id, counters: numberFields(doc) });
    }
    pageToken = page?.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

async function statsReport(event) {
  const provided = event.headers?.['x-stats-password'];
  if (!passwordMatches(provided, await expectedPassword())) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // slow down guessing
    return reply(401, { error: 'Wrong password' });
  }
  const days = Math.min(365, Math.max(1, Number(event.queryStringParameters?.days) || 30));
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const daily = (await listAll('stats', (id) => dayPattern.test(id) && id >= cutoff)).map((d) => ({ day: d.id, ...d.counters }));
  const sources = (await listAll('src_stats', (id) => id.slice(0, 10) >= cutoff)).map((d) => {
    const [day, source, campaign] = d.id.split('~');
    return { day, source, campaign: campaign ?? '', ...d.counters };
  });
  daily.sort((a, b) => a.day.localeCompare(b.day));
  return reply(200, { days, daily, sources });
}

export async function handler(event) {
  try {
    const method = event.requestContext?.http?.method;
    const id = event.pathParameters?.id;
    if (method === 'GET' && event.rawPath === '/api/stats') return await statsReport(event);
    if (method === 'POST' && !id) return await createBoard();
    if (method === 'GET' && id) {
      if (legacyPattern.test(id)) return reply(200, { active: true, legacy: true });
      if (!idPattern.test(id)) return reply(410, { error: 'List not found' });
      const board = await firestore(`boards/${id}`);
      return board ? reply(200, { active: board.fields.active?.booleanValue === true, legacy: false }) : reply(410, { error: 'List not found' });
    }
    if (method === 'DELETE' && id) return await deleteBoard(id, event.headers?.authorization);
    return reply(410, { error: 'Not found' });
  } catch (error) {
    console.error('Board API failed', error);
    return reply(503, { error: 'Shared lists are temporarily unavailable' });
  }
}
