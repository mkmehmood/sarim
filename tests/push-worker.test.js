import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import worker, { verifyIdToken, resetState, decodeFields, isActiveAdmin, cleanName } from '../worker/src/index.js';

const PROJECT = 'calculator-fabd3';
const b64 = (bytes) => Buffer.from(bytes).toString('base64url');
const enc = new TextEncoder();
const algo = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

function toFields(obj) {
  const val = (v) => {
    if (typeof v === 'string') return { stringValue: v };
    if (typeof v === 'boolean') return { booleanValue: v };
    if (typeof v === 'number') return { integerValue: String(v) };
    if (Array.isArray(v)) return { arrayValue: { values: v.map(val) } };
    return { mapValue: { fields: toFields(v) } };
  };
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, val(v)]));
}

async function makeIdp() {
  const pair = await crypto.subtle.generateKey(algo, true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  const sign = async (claims, kid = 'k1', key = pair.privateKey) => {
    const head = b64(enc.encode(JSON.stringify({ alg: 'RS256', kid, typ: 'JWT' })));
    const body = b64(enc.encode(JSON.stringify(claims)));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${body}`));
    return `${head}.${body}.${b64(sig)}`;
  };
  return { jwk, sign, pair };
}

const now = () => Math.floor(Date.now() / 1000);
const claims = (over = {}) => ({ aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: 'rep1', iat: now() - 10, exp: now() + 3000, auth_time: now() - 10, ...over });

let realFetch;
beforeEach(() => { realFetch = globalThis.fetch; resetState(); });
afterEach(() => { globalThis.fetch = realFetch; });

describe('verifyIdToken', () => {
  it('accepts a genuine token and rejects forged or mismatched ones', async () => {
    const idp = await makeIdp();
    globalThis.fetch = async () => new Response(JSON.stringify({ keys: [idp.jwk] }));
    assert.deepEqual(await verifyIdToken(await idp.sign(claims()), PROJECT), { uid: 'rep1', email: '' });
    assert.equal(await verifyIdToken(await idp.sign(claims({ aud: 'other' })), PROJECT), null);
    assert.equal(await verifyIdToken(await idp.sign(claims({ iss: 'https://securetoken.google.com/other' })), PROJECT), null);
    assert.equal(await verifyIdToken(await idp.sign(claims({ exp: now() - 5 })), PROJECT), null);
    assert.equal(await verifyIdToken(await idp.sign(claims({ sub: '' })), PROJECT), null);
    assert.equal(await verifyIdToken(await idp.sign(claims(), 'unknown'), PROJECT), null);
    const other = await crypto.subtle.generateKey(algo, true, ['sign', 'verify']);
    assert.equal(await verifyIdToken(await idp.sign(claims(), 'k1', other.privateKey), PROJECT), null);
    assert.equal(await verifyIdToken('not.a.token', PROJECT), null);
    assert.equal(await verifyIdToken('', PROJECT), null);
  });
});

describe('helpers', () => {
  it('decodes Firestore values and recognises active admins', () => {
    const d = decodeFields(toFields({ a: 'x', b: true, c: 3, roles: ['admin'], m: { n: 'y' } }));
    assert.deepEqual(d, { a: 'x', b: true, c: 3, roles: ['admin'], m: { n: 'y' } });
    assert.equal(isActiveAdmin({ roles: ['admin'] }), true);
    assert.equal(isActiveAdmin({ role: 'admin' }), true);
    assert.equal(isActiveAdmin({ roles: ['admin'], approved: false }), false);
    assert.equal(isActiveAdmin({ roles: ['rep'] }), false);
    assert.equal(isActiveAdmin(null), false);
    assert.equal(cleanName('Sara <script>"x"'), 'Sara scriptx');
    assert.equal(cleanName('a'.repeat(100)).length, 40);
  });
});

async function makeWorld({ docs, tokenClaims, kv = true }) {
  resetState();
  const idp = await makeIdp();
  const sa = await crypto.subtle.generateKey(algo, true, ['sign', 'verify']);
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', sa.privateKey)).toString('base64');
  const env = {
    PROJECT_ID: PROJECT,
    ALLOWED_ORIGIN: 'https://mkmehmood.github.io',
    SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'push@x.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${pkcs8}\n-----END PRIVATE KEY-----\n` }),
  };
  const store = new Map();
  if (kv) env.RATE = { get: async (k) => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } };
  const sent = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('securetoken@system')) return new Response(JSON.stringify({ keys: [idp.jwk] }));
    if (u === 'https://oauth2.googleapis.com/token') return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }));
    if (u.includes('messages:send')) { sent.push(JSON.parse(init.body).message); return new Response('{}'); }
    const path = decodeURIComponent(u.split('/documents/')[1] || '').split('?')[0];
    if (u.includes('?pageSize')) {
      const docsHere = Object.entries(docs).filter(([p]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'));
      return new Response(JSON.stringify({ documents: docsHere.map(([, f]) => ({ fields: toFields(f) })) }));
    }
    return docs[path] ? new Response(JSON.stringify({ fields: toFields(docs[path]) })) : new Response('{}', { status: 404 });
  };
  const call = async (pendingId, over = {}) => {
    const token = await idp.sign(claims(tokenClaims || {}));
    return worker.fetch(new Request('https://w.example/notify', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, origin: 'https://mkmehmood.github.io', 'content-type': 'application/json', ...over },
      body: JSON.stringify({ pendingId }),
    }), env);
  };
  return { call, sent, env, store, idp };
}

const baseDocs = () => ({
  'users/owner': { roles: ['admin'] },
  'users/rep1': { ownerUid: 'owner', roles: ['rep'] },
  'users/rep2': { ownerUid: 'owner', roles: ['rep'] },
  'users/admin2': { ownerUid: 'owner', roles: ['admin'] },
  'users/gone': { ownerUid: 'owner', roles: ['rep'] },
  'users/stranger': { ownerUid: 'elsewhere', roles: ['admin'] },
  'users/owner/pending/p123456': { status: 'pending', submittedBy: { uid: 'rep1', name: 'Sara <b>' }, amount: 99999 },
  'users/owner/pending/p777777': { status: 'pending', submittedBy: { uid: 'rep2', name: 'Imran' } },
  'users/owner/fcm_tokens/a': { uid: 'owner', token: 'tok-owner' },
  'users/owner/fcm_tokens/b': { uid: 'admin2', token: 'tok-admin2' },
  'users/owner/fcm_tokens/c': { uid: 'gone', token: 'tok-demoted' },
  'users/owner/fcm_tokens/d': { uid: 'stranger', token: 'tok-stranger' },
});

describe('/notify', () => {
  it('sends a generic alert only to active admins in the same workspace', async () => {
    const w = await makeWorld({ docs: baseDocs() });
    const res = await w.call('p123456');
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { sent: 2, failed: 0 });
    assert.deepEqual(w.sent.map((m) => m.token).sort(), ['tok-admin2', 'tok-owner']);
    const m = w.sent[0];
    assert.equal(m.notification.title, 'Approval needed');
    assert.equal(m.notification.body, 'Sara b sent something for approval');
    assert.equal(JSON.stringify(m).includes('99999'), false);
    assert.deepEqual(m.data, { type: 'approval', pendingId: 'p123456' });
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://mkmehmood.github.io');
  });
  it('refuses requests without a login, with bad input, or from the wrong origin for CORS', async () => {
    const w = await makeWorld({ docs: baseDocs() });
    assert.equal((await w.call('p123456', { authorization: '' })).status, 401);
    assert.equal((await w.call('../etc')).status, 400);
    const res = await w.call('p123456', { origin: 'https://evil.example' });
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    const get = await worker.fetch(new Request('https://w.example/notify'), w.env);
    assert.equal(get.status, 405);
    const lost = await worker.fetch(new Request('https://w.example/other', { method: 'POST' }), w.env);
    assert.equal(lost.status, 404);
  });
  it('refuses someone who did not submit that pending item, or a missing or suspended account', async () => {
    const w = await makeWorld({ docs: baseDocs() });
    assert.equal((await w.call('p777777')).status, 403);
    assert.equal((await w.call('p999999')).status, 403);
    const s = await makeWorld({ docs: { ...baseDocs(), 'users/rep1': { ownerUid: 'owner', approved: false } } });
    assert.equal((await s.call('p123456')).status, 403);
    const n = await makeWorld({ docs: { ...baseDocs(), 'users/owner/pending/p123456': { status: 'approved', submittedBy: { uid: 'rep1' } } } });
    assert.equal((await n.call('p123456')).status, 403);
    assert.equal(n.sent.length, 0);
  });
  it('does not send twice for the same pending item', async () => {
    const w = await makeWorld({ docs: baseDocs() });
    assert.equal((await (await w.call('p123456')).json()).sent, 2);
    assert.deepEqual(await (await w.call('p123456')).json(), { sent: 0, duplicate: true });
    assert.equal(w.sent.length, 2);
  });
  it('rate-limits a single user', async () => {
    const w = await makeWorld({ docs: baseDocs() });
    let last = 200;
    for (let i = 0; i < 25; i++) last = (await w.call('p123456')).status;
    assert.equal(last, 429);
  });
  it('answers CORS preflight only for the allowed origin', async () => {
    const w = await makeWorld({ docs: baseDocs() });
    const ok = await worker.fetch(new Request('https://w.example/notify', { method: 'OPTIONS', headers: { origin: 'https://mkmehmood.github.io' } }), w.env);
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get('access-control-allow-origin'), 'https://mkmehmood.github.io');
    const bad = await worker.fetch(new Request('https://w.example/notify', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } }), w.env);
    assert.equal(bad.headers.get('access-control-allow-origin'), null);
  });
});
