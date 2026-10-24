import { createHash, createPrivateKey, randomBytes, sign, timingSafeEqual } from 'node:crypto';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const ssm = new SSMClient({});
const project = 'houseswipe-b390e';
const idPattern = /^v2_[a-f0-9]{40}$/;
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

export async function handler(event) {
  try {
    const method = event.requestContext?.http?.method;
    const id = event.pathParameters?.id;
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
