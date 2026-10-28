import { txDeviceDate, txDeviceCompare } from './tx-date.js';

const EPS = 0.0001;
const num = v => Number(v) || 0;

export const REP_RETURN_RELINK_FLAG = 'repReturnRelink.v1';

export function isLiveRepReturn(r) {
  return !!r && r.isRepReturn === true && !r.deletedAt && r.currentRepProfile === 'admin';
}

export function pickReturnsCovered(pending, ret, exp) {
  const sorted = [...(pending || [])].sort(txDeviceCompare);
  let usedRet = 0, usedExp = 0;
  const picked = [];
  for (const r of sorted) {
    const nr = usedRet + num(r.returnedQty), ne = usedExp + num(r.expiredQty);
    if (nr > num(ret) + EPS || ne > num(exp) + EPS) break;
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
    for (const r of cands) {
      const nr = usedRet + num(r.returnedQty), ne = usedExp + num(r.expiredQty);
      if (nr > num(e.returned) + EPS || ne > num(e.expired) + EPS) break;
      usedRet = nr; usedExp = ne;
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

export const CREDIT_DEVICE_DATE_FLAG = 'repCreditDeviceDate.v1';

export function isRepCreditSale(s) {
  return !!s && !s.deletedAt && s.currentRepProfile === 'admin' && s.paymentType === 'CREDIT' && s.transactionType !== 'OLD_DEBT';
}

function creditSaleMoment(e, now) {
  const d = new Date(e.syncedAt || e.createdAt || e.timestamp);
  return isNaN(d.getTime()) ? new Date(now) : d;
}

export function planCreditDeviceDateRelink(calcs, sales) {
  const live = (Array.isArray(calcs) ? calcs : []).filter(h => h && !h.deletedAt && h.seller);
  const all = Array.isArray(sales) ? sales : [];
  const credit = all.filter(isRepCreditSale);
  const byId = new Map(credit.map(s => [s.id, s]));
  const ordered = [...live].sort((a, b) => num(a.createdAt || a.timestamp) - num(b.createdAt || b.timestamp));

  const owner = new Map();
  const released = new Set();
  const next = new Map();
  const report = { reversed: [], paid: [] };

  for (const e of ordered) {
    const kept = [];
    for (const id of Array.isArray(e.linkedSalesIds) ? e.linkedSalesIds : []) {
      const s = byId.get(id);
      if (!s) { kept.push(id); continue; }
      const d = txDeviceDate(s);
      if (owner.has(id) || (d && d > e.date)) { released.add(id); continue; }
      owner.set(id, e.id);
      kept.push(id);
    }
    next.set(e.id, kept);
  }

  for (const e of ordered) {
    const ids = next.get(e.id);
    const born = num(e.createdAt || e.timestamp);
    const cands = credit
      .filter(s => s.customerName === e.seller && !owner.has(s.id) && (!s.creditReceived || released.has(s.id)) &&
        txDeviceDate(s) && txDeviceDate(s) <= e.date && num(s.createdAt || s.timestamp) <= born)
      .sort(txDeviceCompare);
    for (const s of cands) { owner.set(s.id, e.id); ids.push(s.id); }
  }

  const entryById = new Map(ordered.map(e => [e.id, e]));
  const saleChanges = [];
  for (const s of credit) {
    const own = owner.get(s.id);
    const wasLinked = ordered.some(e => (e.linkedSalesIds || []).includes(s.id));
    if (own && !s.creditReceived) { saleChanges.push({ sale: s, action: 'pay', entry: entryById.get(own) }); report.paid.push(s.id); }
    else if (!own && wasLinked && s.creditReceived) { saleChanges.push({ sale: s, action: 'reverse' }); report.reversed.push(s.id); }
  }

  const entryChanges = [];
  for (const e of ordered) {
    const before = Array.isArray(e.linkedSalesIds) ? e.linkedSalesIds : [];
    const after = next.get(e.id);
    if (before.length !== after.length || before.some((id, i) => id !== after[i])) entryChanges.push({ entry: e, ids: after });
  }
  return { entryChanges, saleChanges, report };
}

export async function runCreditDeviceDateMigration({ store, save, now = () => Date.now(), localDateStr, timeStr }) {
  const done = await store.get(CREDIT_DEVICE_DATE_FLAG, null);
  if (done && done.ok) return { skipped: true };
  const calcs = await store.get('calculator', []);
  const sales = await store.get('sales', []);
  if (!Array.isArray(calcs) || !calcs.length || !Array.isArray(sales)) return { skipped: true, empty: true };
  const { entryChanges, saleChanges, report } = planCreditDeviceDateRelink(calcs, sales);
  const stamp = now();
  const dstr = localDateStr || (d => txDeviceDate({ date: d.getTime() }));
  const tstr = timeStr || (d => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }));
  const touched = [];
  for (const { sale, action, entry } of saleChanges) {
    if (action === 'pay') {
      const m = creditSaleMoment(entry, stamp);
      sale.creditReceived = true;
      sale.creditReceivedManually = true;
      sale.creditReceivedDate = dstr(m);
      sale.creditReceivedTime = tstr(m);
    } else {
      sale.creditReceived = false;
      delete sale.creditReceivedDate;
      delete sale.creditReceivedTime;
      delete sale.creditReceivedManually;
    }
    sale.updatedAt = stamp;
    touched.push(sale.id);
  }
  if (touched.length) await save('sales', sales, null, touched);
  for (const { entry, ids } of entryChanges) {
    const fresh = { ...entry, linkedSalesIds: ids, updatedAt: stamp };
    const idx = calcs.findIndex(h => h && h.id === entry.id);
    if (idx >= 0) calcs[idx] = fresh;
    await save('calculator', calcs, fresh);
  }
  await store.set(CREDIT_DEVICE_DATE_FLAG, { ok: true, at: stamp, sales: touched.length, entries: entryChanges.length, report });
  return { skipped: false, sales: touched.length, entries: entryChanges.length, report };
}
