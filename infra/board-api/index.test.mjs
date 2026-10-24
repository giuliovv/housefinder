import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { SSMClient } from '@aws-sdk/client-ssm';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
SSMClient.prototype.send = async () => ({ Parameter: { Value: JSON.stringify({
  project_id: 'houseswipe-b390e', client_email: 'test@example.com', token_uri: 'https://oauth.test/token',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
}) } });

const boards = new Map();
const items = new Map();
globalThis.fetch = async (input, options = {}) => {
  const url = new URL(input);
  if (url.hostname === 'oauth.test') return Response.json({ access_token: 'test-token', expires_in: 3600 });
  assert.equal(options.headers.authorization, 'Bearer test-token');
  const path = decodeURIComponent(url.pathname.split('/documents/')[1]);
  if (options.method === 'POST' && path === 'boards') {
    const id = url.searchParams.get('documentId');
    boards.set(id, JSON.parse(options.body));
    return Response.json({ name: `boards/${id}` });
  }
  const match = /^boards\/([^/]+)(?:\/items(?:\/([^/]+))?)?$/.exec(path);
  assert.ok(match, path);
  const [, id, item] = match;
  if (options.method === 'PATCH') {
    boards.set(id, { fields: { ...boards.get(id).fields, active: { booleanValue: false } } });
    return Response.json(boards.get(id));
  }
  if (options.method === 'DELETE') {
    items.delete(`${id}/${item}`);
    return Response.json({});
  }
  if (path.endsWith('/items')) {
    return Response.json({ documents: [...items.keys()].filter((key) => key.startsWith(`${id}/`)).map((key) => ({ name: `projects/houseswipe-b390e/databases/(default)/documents/boards/${id}/items/${key.slice(id.length + 1)}` })) });
  }
  return boards.has(id) ? Response.json(boards.get(id)) : new Response('', { status: 404 });
};

process.env.FIREBASE_ADMIN_PARAMETER = '/housefinder/firebase-admin';
const { handler } = await import('./index.mjs');
const event = (method, id, token) => ({ requestContext: { http: { method } }, pathParameters: id ? { id } : undefined, headers: token ? { authorization: `Bearer ${token}` } : {} });

test('new lists require the owner key for whole-list deletion', async () => {
  const created = await handler(event('POST'));
  assert.equal(created.statusCode, 201);
  const { boardId, ownerToken } = JSON.parse(created.body);
  assert.match(boardId, /^v2_[a-f0-9]{40}$/);
  assert.equal(ownerToken.length, 43);
  assert.equal(JSON.parse((await handler(event('GET', boardId))).body).active, true);
  items.set(`${boardId}/home`, {});
  assert.equal((await handler(event('DELETE', boardId, 'a'.repeat(43)))).statusCode, 401);
  assert.equal(items.size, 1);
  assert.equal((await handler(event('DELETE', boardId, ownerToken))).statusCode, 200);
  assert.equal(items.size, 0);
  assert.equal(JSON.parse((await handler(event('GET', boardId))).body).active, false);
  assert.equal((await handler(event('DELETE', boardId, ownerToken))).statusCode, 200);
});

test('legacy lists remain readable but cannot be owner-deleted', async () => {
  const id = 'a'.repeat(40);
  assert.deepEqual(JSON.parse((await handler(event('GET', id))).body), { active: true, legacy: true });
  assert.equal((await handler(event('DELETE', id, 'b'.repeat(43)))).statusCode, 410);
});
