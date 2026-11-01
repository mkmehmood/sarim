const JWK_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging';
const MAX_BODY = 2048;
const PER_USER_PER_MINUTE = 20;
const ALL_PER_MINUTE = 120;
const MAX_DEVICES = 20;

const enc = new TextEncoder();
const state = { jwks: null, jwksAt: 0, access: null, accessUntil: 0 };

export function resetState() {
  state.jwks = null; state.jwksAt = 0; state.access = null; state.accessUntil = 0;
}

function b64urlToBytes(s) {
  const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(s).length / 4) * 4, '='));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function bytesToB64url(bytes) {
  let s = '';
  new Uint8Array(bytes).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...extra } });
}

function corsHeaders(env, origin) {
  const allowed = String(env.ALLOWED_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '600',
    vary: 'origin',
  };
}

async function loadJwks(force) {
  const now = Date.now();
  if (!force && state.jwks && now - state.jwksAt < 3600000) return state.jwks;
  if (force && state.jwks && now - state.jwksAt < 60000) return state.jwks;
  const res = await fetch(JWK_URL);
  if (!res.ok) throw new Error('jwks');
  const data = await res.json();
  state.jwks = Array.isArray(data.keys) ? data.keys : [];
  state.jwksAt = now;
  return state.jwks;
}

export async function verifyIdToken(token, projectId, nowSec = Math.floor(Date.now() / 1000)) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  let header; let claims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));
  } catch (_) { return null; }
  if (header.alg !== 'RS256' || !header.kid) return null;
  let jwk = (await loadJwks(false)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await loadJwks(true)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  let ok = false;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(parts[2]), enc.encode(`${parts[0]}.${parts[1]}`));
  } catch (_) { return null; }
  if (!ok) return null;
  if (claims.aud !== projectId) return null;
  if (claims.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 128) return null;
  if (!(claims.exp > nowSec)) return null;
  if (!(claims.iat <= nowSec + 60)) return null;
  if (claims.auth_time != null && claims.auth_time > nowSec + 60) return null;
  return { uid: claims.sub, email: claims.email || '' };
}

async function accessToken(env) {
  const now = Date.now();
  if (state.access && now < state.accessUntil) return state.access;
  const sa = JSON.parse(env.SERVICE_ACCOUNT_JSON);
  const iat = Math.floor(now / 1000);
  const head = bytesToB64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const body = bytesToB64url(enc.encode(JSON.stringify({ iss: sa.client_email, scope: SCOPES, aud: TOKEN_URL, iat, exp: iat + 3600 })));
  const pem = String(sa.private_key).replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', b64urlToBytes(pem.replace(/\+/g, '-').replace(/\//g, '_')), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(`${head}.${body}`));
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${bytesToB64url(sig)}` }),
  });
  if (!res.ok) throw new Error('oauth');
  const data = await res.json();
  state.access = data.access_token;
  state.accessUntil = now + Math.max(60, (data.expires_in || 3600) - 120) * 1000;
  return state.access;
}

export function decodeFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields || {})) out[k] = decodeValue(v);
  return out;
}

function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return decodeFields(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  if ('timestampValue' in v) return v.timestampValue;
  return null;
}

function docUrl(env, path) {
  return `https://firestore.googleapis.com/v1/projects/${env.PROJECT_ID}/databases/(default)/documents/${path}`;
}

async function getDoc(env, token, path) {
  const res = await fetch(docUrl(env, path), { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('firestore');
  const d = await res.json();
  return decodeFields(d.fields);
}

async function listDocs(env, token, path) {
  const res = await fetch(`${docUrl(env, path)}?pageSize=100`, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error('firestore');
  const d = await res.json();
  return (d.documents || []).map((x) => decodeFields(x.fields));
}

export function isActiveAdmin(user) {
  if (!user || user.approved === false) return false;
  const roles = Array.isArray(user.roles) ? user.roles : [];
  return roles.includes('admin') || user.role === 'admin';
}

export function cleanName(name) {
  return String(name || '').replace(/[^\p{L}\p{N} .'-]/gu, '').trim().slice(0, 40);
}

async function rateLimited(env, uid) {
  if (!env.RATE) return false;
  const bucket = Math.floor(Date.now() / 60000);
  const bump = async (key, max) => {
    const n = Number(await env.RATE.get(key)) || 0;
    if (n >= max) return true;
    await env.RATE.put(key, String(n + 1), { expirationTtl: 120 });
    return false;
  };
  if (await bump(`rl:all:${bucket}`, ALL_PER_MINUTE)) return true;
  return bump(`rl:${uid}:${bucket}`, PER_USER_PER_MINUTE);
}

async function sendPush(env, token, device, pendingId, submitter) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${env.PROJECT_ID}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      message: {
        token: device,
        notification: { title: 'Approval needed', body: submitter ? `${submitter} sent something for approval` : 'Something is waiting for your approval' },
        data: { type: 'approval', pendingId },
        android: { priority: 'HIGH', ttl: '3600s', notification: { tag: `approval-${pendingId}` } },
      },
    }),
  });
  return res.ok;
}

export async function handleNotify(request, env) {
  const origin = request.headers.get('origin') || '';
  const cors = corsHeaders(env, origin);
  const reply = (status, body) => json(status, body, cors);
  const auth = request.headers.get('authorization') || '';
  if (!auth.startsWith('Bearer ')) return reply(401, { error: 'unauthorized' });
  const text = await request.text();
  if (text.length > MAX_BODY) return reply(413, { error: 'too_large' });
  let pendingId;
  try { pendingId = JSON.parse(text).pendingId; } catch (_) { return reply(400, { error: 'bad_request' }); }
  if (typeof pendingId !== 'string' || !/^[\w.-]{6,100}$/.test(pendingId)) return reply(400, { error: 'bad_request' });
  let me;
  try { me = await verifyIdToken(auth.slice(7), env.PROJECT_ID); } catch (_) { return reply(503, { error: 'try_again' }); }
  if (!me) return reply(401, { error: 'unauthorized' });
  try {
    if (await rateLimited(env, me.uid)) return reply(429, { error: 'slow_down' });
    const token = await accessToken(env);
    const user = await getDoc(env, token, `users/${me.uid}`);
    if (!user || user.approved === false) return reply(403, { error: 'forbidden' });
    const owner = user.ownerUid || me.uid;
    const pending = await getDoc(env, token, `users/${owner}/pending/${pendingId}`);
    if (!pending || pending.status !== 'pending' || !pending.submittedBy || pending.submittedBy.uid !== me.uid) return reply(403, { error: 'forbidden' });
    if (env.RATE) {
      const seen = `nf:${owner}:${pendingId}`;
      if (await env.RATE.get(seen)) return reply(200, { sent: 0, duplicate: true });
      await env.RATE.put(seen, '1', { expirationTtl: 3600 });
    }
    const devices = await listDocs(env, token, `users/${owner}/fcm_tokens`);
    const admins = new Map();
    for (const uid of [...new Set(devices.map((d) => d.uid).filter(Boolean))].slice(0, MAX_DEVICES)) {
      const doc = uid === me.uid ? user : await getDoc(env, token, `users/${uid}`);
      const inWs = doc && (uid === owner || doc.ownerUid === owner);
      admins.set(uid, !!inWs && isActiveAdmin(doc));
    }
    const targets = devices.filter((d) => d.token && typeof d.token === 'string' && admins.get(d.uid) && d.uid !== me.uid).slice(0, MAX_DEVICES);
    const name = cleanName((pending.submittedBy && pending.submittedBy.name) || '');
    const results = await Promise.all(targets.map((d) => sendPush(env, token, d.token, pendingId, name).catch(() => false)));
    return reply(200, { sent: results.filter(Boolean).length, failed: results.filter((r) => !r).length });
  } catch (_) {
    return reply(502, { error: 'try_again' });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(env, request.headers.get('origin') || '');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname !== '/notify') return json(404, { error: 'not_found' }, cors);
    if (request.method !== 'POST') return json(405, { error: 'method_not_allowed' }, cors);
    return handleNotify(request, env);
  },
};
