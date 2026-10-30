import { txDeviceDate, txDeviceCompare } from './tx-date.js';

const EPS = 0.0001;
const num = v => Number(v) || 0;
const round = v => Math.max(0, Math.round(v * 100) / 100);

export const REP_RETURN_RELINK_FLAG = 'repReturnRelink.v2';

export function isLiveRepReturn(r) {
  return !!r && r.isRepReturn === true && !r.deletedAt && r.currentRepProfile === 'admin';
}

const cents = v => Math.round(num(v) * 100);
const MAX_EXACT = 24;

function findExactCover(sorted, ret, exp) {
  if (!sorted.length || sorted.length > MAX_EXACT) return null;
  const tr = cents(ret), te = cents(exp);
  const r = sorted.map(x => cents(x.returnedQty)), e = sorted.map(x => cents(x.expiredQty));
  const sufR = new Array(sorted.length + 1).fill(0), sufE = new Array(sorted.length + 1).fill(0);
  for (let i = sorted.length - 1; i >= 0; i--) { sufR[i] = sufR[i + 1] + r[i]; sufE[i] = sufE[i + 1] + e[i]; }
  const pick = [];
  let steps = 0;
  const go = (i, needR, needE) => {
    if (needR === 0 && needE === 0) return true;
    if (i >= sorted.length || ++steps > 200000) return false;
    if (needR > sufR[i] || needE > sufE[i]) return false;
    if (r[i] <= needR && e[i] <= needE && (r[i] > 0 || e[i] > 0)) {
      pick.push(i);
      if (go(i + 1, needR - r[i], needE - e[i])) return true;
      pick.pop();
    }
    return go(i + 1, needR, needE);
  };
  return go(0, tr, te) ? pick.map(i => sorted[i]) : null;
}

export function pickReturnsCovered(pending, ret, exp) {
  const sorted = [...(pending || [])].sort(txDeviceCompare);
  const exact = findExactCover(sorted, ret, exp);
  if (exact) return exact;
  let usedRet = 0, usedExp = 0;
  const picked = [];
  for (const r of sorted) {
    const nr = usedRet + num(r.returnedQty), ne = usedExp + num(r.expiredQty);
    if (nr > num(ret) + EPS || ne > num(exp) + EPS) continue;
    usedRet = nr; usedExp = ne;
    picked.push(r);
  }
  return picked;
}

function entryWindowEnd(entry, salesById) {
  let end = txDeviceDate({ date: entry.date });
  for (const id of entry.linkedSalesIds || []) {
    const d = txDeviceDate(salesById.get(id));
    if (d && d > end) end = d;
  }
  return end;
}

export function planRepReturnRelink(calcs, sales) {
  const live = (Array.isArray(calcs) ? calcs : []).filter(h => h && !h.deletedAt && h.seller);
  const all = Array.isArray(sales) ? sales : [];
  const salesById = new Map(all.filter(Boolean).map(s => [s.id, s]));
  const returns = all.filter(isLiveRepReturn);
  const retById = new Map(returns.map(r => [r.id, r]));
  const ordered = [...live].sort((a, b) => (num(a.createdAt || a.timestamp) - num(b.createdAt || b.timestamp)));

  const claimed = new Set();
  const next = new Map();
  const report = { dropped: [], added: [], entriesChanged: 0 };

  for (const e of ordered) {
    const kept = [];
    for (const id of Array.isArray(e.linkedRepReturnIds) ? e.linkedRepReturnIds : []) {
      const r = retById.get(id);
      if (!r || claimed.has(id)) { report.dropped.push({ entry: e.id, id }); continue; }
      claimed.add(id);
      kept.push(id);
    }
    next.set(e.id, kept);
  }

  for (const e of ordered) {
    const ids = next.get(e.id);
    let usedRet = 0, usedExp = 0;
    for (const id of ids) { const r = retById.get(id); usedRet += num(r.returnedQty); usedExp += num(r.expiredQty); }
    const end = entryWindowEnd(e, salesById);
    const born = num(e.createdAt || e.timestamp);
    const cands = returns
      .filter(r => r.customerName === e.seller && !claimed.has(r.id) &&
        txDeviceDate(r) && txDeviceDate(r) <= end &&
        num(r.createdAt || r.timestamp) <= born)
      .sort(txDeviceCompare);
    const picked = pickReturnsCovered(cands, round(num(e.returned) - usedRet), round(num(e.expired) - usedExp));
    for (const r of picked) {
      claimed.add(r.id); ids.push(r.id);
      report.added.push({ entry: e.id, id: r.id });
    }
  }

  const changes = [];
  for (const e of ordered) {
    const before = Array.isArray(e.linkedRepReturnIds) ? e.linkedRepReturnIds : [];
    const after = next.get(e.id);
    if (before.length !== after.length || before.some((id, i) => id !== after[i])) changes.push({ entry: e, ids: after });
  }
  report.entriesChanged = changes.length;
  return { changes, report };
}

export async function runRepReturnRelinkMigration({ store, save, now = () => Date.now() }) {
  const done = await store.get(REP_RETURN_RELINK_FLAG, null);
  if (done && done.ok) return { skipped: true };
  const calcs = await store.get('calculator', []);
  const sales = await store.get('sales', []);
  if (!Array.isArray(calcs) || !calcs.length) return { skipped: true, empty: true };
  const { changes, report } = planRepReturnRelink(calcs, sales);
  for (const { entry, ids } of changes) {
    const stamp = now();
    const fresh = { ...entry, linkedRepReturnIds: ids, updatedAt: stamp };
    const idx = calcs.findIndex(h => h && h.id === entry.id);
    if (idx >= 0) calcs[idx] = fresh;
    await save('calculator', calcs, fresh);
  }
  await store.set(REP_RETURN_RELINK_FLAG, { ok: true, at: now(), changed: changes.length, report });
  return { skipped: false, changed: changes.length, report };
}
