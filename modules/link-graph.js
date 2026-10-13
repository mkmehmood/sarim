export const GROUP_FIELD = '_deletionGroup';
import { formulaTypeFor } from './store-keys.js';

export const REF_FIELDS = {
  sales:       { scalar: ['relatedSaleId'], array: [] },
  rep:            { scalar: ['relatedSaleId', 'usedInCalcId'], array: [] },
  calculator:        { scalar: ['transferSaleId', 'returnEntryId', 'returnLogId'], array: ['linkedSalesIds', 'linkedRepSalesIds'] },
  transactions: { scalar: ['expenseId', 'entityId', 'transferPeerEntityId', 'materialId'], array: ['materialIds'], objectArray: ['consumedCredits'] },
  inventory: { scalar: ['supplierId'], array: [] },
};

export const COLLECTION_TO_KEY = {
  sales: 'sales',
  rep: 'rep',
  calculator: 'calculator',
  transactions: 'transactions',
  expenses: 'expenses',
  production: 'production',
  returns: 'returns',
  customers: 'customers',
  clients: 'clients',
  entities: 'entities',
  inventory: 'inventory',
  factory: 'factory',
};

const _n = (v) => Number(v) || 0;
const _r2 = (v) => Math.round((_n(v) + Number.EPSILON) * 100) / 100;

export function resolveId(id, idMap) {
  if (!id || !idMap) return id;
  let cur = String(id);
  const seen = new Set();
  while (Object.prototype.hasOwnProperty.call(idMap, cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = String(idMap[cur]);
  }
  return cur;
}

export function remapReferences(stores, oldId, newId) {
  const changed = {};
  const o = String(oldId);
  const nw = String(newId);
  for (const key of Object.keys(REF_FIELDS)) {
    const arr = stores[key];
    if (!Array.isArray(arr)) continue;
    const { scalar, array, objectArray = [] } = REF_FIELDS[key];
    for (const rec of arr) {
      if (!rec || typeof rec !== 'object') continue;
      let hit = false;
      for (const f of scalar) if (rec[f] != null && String(rec[f]) === o) { rec[f] = nw; hit = true; }
      for (const f of array) {
        if (!Array.isArray(rec[f])) continue;
        const idx = rec[f].findIndex(x => String(x) === o);
        if (idx !== -1) { rec[f] = rec[f].map(x => String(x) === o ? nw : x); hit = true; }
      }
      for (const f of objectArray) {
        if (!Array.isArray(rec[f])) continue;
        for (const entry of rec[f]) {
          if (entry && entry.id != null && String(entry.id) === o) { entry.id = nw; hit = true; }
        }
      }
      if (hit) (changed[key] = changed[key] || []).push(rec);
    }
  }
  return changed;
}

export function resolveOwnLinks(collectionName, snapshot, idMap) {
  const key = COLLECTION_TO_KEY[collectionName];
  const spec = REF_FIELDS[key];
  if (!spec || !snapshot) return snapshot;
  for (const f of spec.scalar) if (snapshot[f]) snapshot[f] = resolveId(snapshot[f], idMap);
  for (const f of spec.array) if (Array.isArray(snapshot[f])) snapshot[f] = snapshot[f].map(x => resolveId(x, idMap));
  for (const f of spec.objectArray || []) {
    if (!Array.isArray(snapshot[f])) continue;
    snapshot[f].forEach(entry => { if (entry && entry.id != null) entry.id = resolveId(entry.id, idMap); });
  }
  return snapshot;
}

export function planChildDetach(parent, child) {
  if (!parent || !child) return null;
  const paid = Math.max(0, _r2(_n(parent.partialPaymentReceived) - _n(child.totalValue)));
  const patch = { partialPaymentReceived: paid };
  if (paid === 0) { patch.creditReceived = false; patch.clearCreditReceivedDate = true; }
  return patch;
}

export function planChildReattach(parent, child) {
  if (!child || child.paymentType !== 'PARTIAL_PAYMENT' || !child.relatedSaleId) return { patch: null };
  if (!parent) return { block: 'The credit sale this payment belongs to is not in your records. Recover that sale first, then recover the payment.' };
  if (parent.paymentType !== 'CREDIT') return { block: 'The sale this payment belongs to is no longer a credit sale.' };
  const amount = _n(child.totalValue);
  const next = _r2(_n(parent.partialPaymentReceived) + amount);
  const cap = _n(parent.totalValue);
  if (cap > 0 && next > cap + 0.01) {
    return { block: `Recovering this payment would put ${next} against a sale worth ${cap}. The sale was changed after the payment was deleted.` };
  }
  return { patch: { partialPaymentReceived: next } };
}

export function applyPatch(rec, patch) {
  if (!rec || !patch) return rec;
  const { clearCreditReceivedDate, ...rest } = patch;
  Object.assign(rec, rest);
  if (clearCreditReceivedDate) { delete rec.creditReceivedDate; delete rec.creditReceivedTime; delete rec.creditReceivedManually; }
  return rec;
}

export function getEditLinkIssue(original, next, children) {
  if (!original || !next) return null;
  const kids = Array.isArray(children) ? children : [];
  const paid = _n(original.partialPaymentReceived);
  if (kids.length === 0 && paid === 0) return null;
  if (original.customerName && next.customerName && original.customerName !== next.customerName) {
    return `This sale has ${kids.length || 'linked'} payment record${kids.length === 1 ? '' : 's'} under "${original.customerName}". Renaming it would separate them. Delete the payment record${kids.length === 1 ? '' : 's'} first.`;
  }
  if (paid > 0 && _n(next.totalValue) + 0.01 < paid) {
    return `${paid} has already been collected against this sale, so its value cannot be reduced below that.`;
  }
  return null;
}

export function planExpenseCascade(tx, allTxs, expenses, excludeIds) {
  if (!tx || !tx.expenseId) return null;
  const skip = new Set([String(tx.id), ...(excludeIds ? [...excludeIds].map(String) : [])]);
  const stillUsed = (Array.isArray(allTxs) ? allTxs : []).some(t => t && !skip.has(String(t.id)) && String(t.expenseId) === String(tx.expenseId));
  if (stillUsed) return null;
  return (Array.isArray(expenses) ? expenses : []).find(e => e && String(e.id) === String(tx.expenseId)) || null;
}

export function stampGroup(rec, groupId) {
  return rec && groupId ? { ...rec, [GROUP_FIELD]: groupId } : rec;
}

export function newGroupId(prefix = 'grp') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const _COLLECTION_RANK = { customers: 0, clients: 0, expenses: 0, entities: 0, inventory: 0 };

export function orderForRestore(tombstones) {
  const list = tombstones.slice();
  const ids = new Set(list.map(t => String(t.recordId || t.id)));
  const depth = (t, seen = new Set()) => {
    const s = t.snapshot || {};
    const p = s.relatedSaleId && String(s.relatedSaleId);
    if (p && ids.has(p) && !seen.has(p)) {
      seen.add(p);
      const parent = list.find(x => String(x.recordId || x.id) === p);
      return 1 + (parent ? depth(parent, seen) : 0);
    }
    return 0;
  };
  return list
    .map(t => ({ t, rank: (_COLLECTION_RANK[t.collection || t.recordType] ?? 1) * 100 + depth(t) }))
    .sort((a, b) => a.rank - b.rank)
    .map(x => x.t);
}

export function findGroupMembers(tomb, allTombstones) {
  const snap = (tomb && tomb.snapshot) || {};
  const gid = snap[GROUP_FIELD];
  const pairId = snap.transferPairId;
  if (!gid && !pairId) return [tomb];
  const members = (allTombstones || []).filter(t => {
    const s = t && t.snapshot;
    if (!s) return false;
    return (gid && s[GROUP_FIELD] === gid) || (pairId && s.transferPairId === pairId);
  });
  if (!members.some(t => t === tomb)) members.push(tomb);
  return members;
}

export function expandGroups(recs, all) {
  const out = new Map();
  for (const r of recs || []) {
    if (!r) continue;
    for (const m of findGroupMembers(r, all)) {
      const k = String(m.recordId || m.id);
      if (!out.has(k)) out.set(k, m);
    }
  }
  return Array.from(out.values());
}

export function remapMaterialRefs(history, formulas, oldId, newId) {
  const o = String(oldId), nw = String(newId);
  const historyChanged = [];
  for (const h of Array.isArray(history) ? history : []) {
    let hit = false;
    for (const m of Array.isArray(h && h.materialsUsed) ? h.materialsUsed : []) {
      if (m && m.id != null && String(m.id) === o) { m.id = nw; hit = true; }
    }
    if (hit) historyChanged.push(h);
  }
  let formulasChanged = false;
  if (formulas && typeof formulas === 'object') {
    for (const k of Object.keys(formulas)) {
      for (const f of Array.isArray(formulas[k]) ? formulas[k] : []) {
        if (f && f.id != null && String(f.id) === o) { f.id = nw; formulasChanged = true; }
      }
    }
  }
  return { historyChanged, formulasChanged };
}

export function planMaterialDeduction(entry, inventory, formulas, formulaKey) {
  if (!entry) return { updates: [] };
  const used = (Array.isArray(entry.materialsUsed) && entry.materialsUsed.length > 0)
    ? entry.materialsUsed.map(m => ({ id: m.id, name: m.name, quantity: _n(m.quantity) }))
    : ((formulas && (formulas[formulaKey] || formulas[entry.store])) || []).map(f => ({ id: f.id, name: f.name, quantity: _n(f.quantity) * _n(entry.units) }));
  const updates = [];
  for (const u of used) {
    if (!(u.quantity > 0)) continue;
    let item = (inventory || []).find(i => i && u.id != null && String(i.id) === String(u.id));
    if (!item && u.name) item = (inventory || []).find(i => i && i.name && i.name.trim().toLowerCase() === String(u.name).trim().toLowerCase());
    if (!item) return { block: `"${u.name || 'A raw material'}" used in this batch is no longer in your inventory. Recover that material first, then recover the batch.` };
    const have = _n(item.quantity);
    if (have + 1e-9 < u.quantity) {
      return { block: `Not enough ${item.name || u.name} in inventory to recover this batch: it used ${u.quantity} kg and only ${have} kg is in stock.` };
    }
    updates.push({ id: item.id, quantity: parseFloat((have - u.quantity).toFixed(6)) });
  }
  return { updates };
}

export function getStockOverdrawIssue(label, qty, availableNow) {
  const q = _n(qty);
  if (q <= 0) return null;
  if (_n(availableNow) - q < -0.0001) {
    return `Recovering this would use ${q} kg of ${label} stock but only ${Math.max(0, _n(availableNow))} kg is available on that date. Recover or add the stock first.`;
  }
  return null;
}

export function recordRename(map, kind, from, to) {
  const m = map && typeof map === 'object' ? map : {};
  const f = String(from || '').trim().toLowerCase();
  const t = String(to || '').trim();
  if (!f || !t || f === t.toLowerCase()) return m;
  m[`${kind}:${f}`] = t;
  return m;
}

export function resolveRename(map, kind, name) {
  if (!map || !name) return name;
  let cur = String(name);
  const seen = new Set();
  while (Object.prototype.hasOwnProperty.call(map, `${kind}:${cur.trim().toLowerCase()}`) && !seen.has(cur.trim().toLowerCase())) {
    seen.add(cur.trim().toLowerCase());
    cur = map[`${kind}:${cur.trim().toLowerCase()}`];
  }
  return cur;
}

export function getOldDebtEditIssue(newAmount, children) {
  const paid = (Array.isArray(children) ? children : []).reduce((s, c) => s + _n(c && c.totalValue), 0);
  if (paid > 0 && _n(newAmount) + 0.01 < paid) {
    return `${_r2(paid)} has already been collected against this old balance, so it cannot be set below that. Delete those payment records first.`;
  }
  return null;
}

export function sumChildPayments(children) {
  return _r2((Array.isArray(children) ? children : []).reduce((s, c) => s + _n(c && c.totalValue), 0));
}

export const DELETE_ORIGIN_FIELD = '_deleteOrigin';

export function findReturnLogFor(entry, logs) {
  if (!entry) return null;
  const cands = (Array.isArray(logs) ? logs : []).filter(l => l && !l.deletedAt &&
    l.store === entry.store && l.date === entry.date && _n(l.quantity) === _n(entry.net));
  if (!cands.length) return null;
  return cands.find(l => entry.createdAt != null && l.createdAt === entry.createdAt)
    || cands.find(l => entry.returnedBy && l.seller === entry.returnedBy)
    || cands[0];
}

export function getReturnStockDrop(entry, log) {
  return entry && log ? _n(log.quantity) : 0;
}

export function getUnitsShortIssue(label, requested, available) {
  const r = _n(requested);
  if (r <= 0) return null;
  if (_n(available) + 1e-9 < r) {
    return `Recovering this would use ${r} formula unit${r === 1 ? '' : 's'} of ${label}, but only ${Math.max(0, _n(available))} ${_n(available) === 1 ? 'is' : 'are'} available in the factory. Add or recover factory batches first.`;
  }
  return null;
}

const _txMatIds = (t) => {
  const ids = new Set();
  if (t && t.materialId) ids.add(String(t.materialId));
  if (t && Array.isArray(t.materialIds)) t.materialIds.forEach(i => { if (i) ids.add(String(i)); });
  return ids;
};

const _stockValueFallback = (m) => _r2(m.totalValue || (m.purchaseCost && m.purchaseQuantity ? m.purchaseCost * m.purchaseQuantity : _n(m.quantity) * _n(m.cost)) || 0);

export function findPayableInTxs(txs, materialId, supplierId) {
  return (Array.isArray(txs) ? txs : []).filter(t => t && !t.deletedAt && t.isPayable === true && t.type === 'IN' &&
    (supplierId == null || String(t.entityId) === String(supplierId)) && _txMatIds(t).has(String(materialId)));
}

export function isOrphanSupplierTx(t, inventory) {
  if (!t || t.isPayable !== true) return false;
  const ids = _txMatIds(t);
  if (ids.size === 0) return false;
  const inv = Array.isArray(inventory) ? inventory : [];
  return !inv.some(m => m && !m.deletedAt && ids.has(String(m.id)) && m.supplierId && String(m.supplierId) === String(t.entityId));
}

export function hasLiveSupplierInvoice(material, txs) {
  return !!(material && material.supplierId && findPayableInTxs(txs, material.id, material.supplierId).length > 0);
}

export function materialOriginalPayable(material, inTxs) {
  const direct = findPayableInTxs(inTxs, material && material.id).filter(t => _txMatIds(t).size === 1);
  if (direct.length) return _r2(direct.reduce((s, t) => s + _n(t.amount), 0));
  return _stockValueFallback(material || {});
}

export function allocatePayments(mats, payments, originalOf) {
  mats.forEach(m => { m.totalPayable = originalOf(m); m.paymentStatus = 'pending'; delete m.paidDate; });
  payments.forEach(pay => {
    let remaining = parseFloat(pay.amount) || 0;
    for (const m of mats) {
      if (remaining <= 0) break;
      if (m.totalPayable <= 0) continue;
      if (remaining >= m.totalPayable) {
        remaining -= m.totalPayable;
        m.totalPayable = 0;
        m.paymentStatus = 'paid';
        m.paidDate = pay.date;
      } else {
        m.totalPayable = parseFloat((m.totalPayable - remaining).toFixed(2));
        remaining = 0;
      }
    }
  });
  return mats;
}

export function planPayableAdjustment(currentInvoiced, delta) {
  const next = Math.max(0, _r2(_n(currentInvoiced) + _n(delta)));
  return { next, change: _r2(next - _n(currentInvoiced)) };
}

export function planSupplierCreditConsumption(txs, entityId, amount) {
  let remaining = _r2(Math.max(0, _n(amount)));
  const consumptions = [];
  if (!(remaining > 0) || entityId == null) return { consumptions, remaining };
  const sid = String(entityId);
  const open = (Array.isArray(txs) ? txs : [])
    .filter(t => t && !t.deletedAt && t.isPayable === true && t.type === 'IN' && String(t.entityId) === sid && _n(t.supplierCreditAmount) > 0)
    .sort((a, b) => new Date(a.date || a.createdAt || 0) - new Date(b.date || b.createdAt || 0));
  for (const ct of open) {
    if (remaining <= 0) break;
    const take = Math.min(_n(ct.supplierCreditAmount), remaining);
    consumptions.push({ id: ct.id, amount: _r2(take) });
    remaining = _r2(Math.max(0, remaining - take));
  }
  return { consumptions, remaining };
}

export function planSupplierCreditRestore(tx, liveTxs) {
  const restores = [];
  const list = Array.isArray(tx && tx.consumedCredits) ? tx.consumedCredits : [];
  if (!list.length) return restores;
  const txs = Array.isArray(liveTxs) ? liveTxs : [];
  for (const c of list) {
    if (!c || c.id == null) continue;
    const ct = txs.find(t => t && !t.deletedAt && String(t.id) === String(c.id));
    if (!ct) continue;
    const give = _n(c.amount);
    if (give <= 0) continue;
    const cap = Math.max(0, _r2(_n(ct.amount) - _n(ct.supplierCreditAmount)));
    const back = Math.min(give, cap);
    if (back > 0) restores.push({ id: ct.id, amount: _r2(back) });
  }
  return restores;
}

export function getSupplierCreditReconsumeIssue(snapshot, liveTxs, resolve) {
  const list = Array.isArray(snapshot && snapshot.consumedCredits) ? snapshot.consumedCredits : [];
  if (!list.length) return null;
  const txs = Array.isArray(liveTxs) ? liveTxs : [];
  const res = typeof resolve === 'function' ? resolve : (x) => x;
  let short = 0;
  for (const c of list) {
    if (!c || c.id == null) continue;
    const ct = txs.find(t => t && !t.deletedAt && String(t.id) === String(res(c.id)));
    if (!ct) continue;
    if (_n(ct.supplierCreditAmount) + 0.01 < _n(c.amount)) short++;
  }
  return short > 0
    ? 'The supplier credit this payment used has since been consumed by another payment, so recovering it would count that money twice. Delete the newer payment first.'
    : null;
}

const _SLOTS = ['standard', 'asaan'];
const _SLOT_LABEL = { standard: 'Standard', asaan: 'Asaan' };

export function resolveSelectedFormula(data, storeKey) {
  const list = (Array.isArray(data.list) ? data.list : []).filter(f => f && f.id);
  const slots = data.slots || {};
  const st = (Array.isArray(data.stores) ? data.stores : []).find(s => s && s.key === storeKey);
  const type = _SLOTS.includes(storeKey) ? storeKey : ((st && st.formulaType) || formulaTypeFor(storeKey));
  const formulaId = (st && st.formulaId) || slots[type] || null;
  const f = formulaId ? list.find(x => String(x.id) === String(formulaId)) : null;
  const inv = (Array.isArray(data.inventory) ? data.inventory : []).filter(i => i && !i.deletedAt);
  const resolve = (i) => {
    let live = inv.find(x => String(x.id) === String(i.id));
    if (!live && i.name) live = inv.find(x => x.name && x.name.trim().toLowerCase() === String(i.name).trim().toLowerCase());
    const liveCost = live ? Number(live.cost) : NaN;
    return {
      id: i.id,
      name: (live && live.name) || i.name || 'Material',
      quantity: _n(i.quantity),
      cost: Number.isFinite(liveCost) && liveCost > 0 ? liveCost : _n(i.cost),
      missing: !live,
      stock: live ? _n(live.quantity) : 0,
    };
  };
  if (f) {
    return { source: 'store', type, formulaId: f.id, name: f.name || _SLOT_LABEL[type], additionalCost: _n(f.additionalCost), ingredients: (Array.isArray(f.ingredients) ? f.ingredients : []).map(resolve) };
  }
  const feed = data.feed || {};
  const costs = data.costs || {};
  return { source: 'feed', type, formulaId: null, name: _SLOT_LABEL[type] || 'Formula', additionalCost: _n(costs[type] != null ? costs[type] : costs[storeKey]), ingredients: (Array.isArray(feed[type] || feed[storeKey]) ? (feed[type] || feed[storeKey]) : []).map(resolve) };
}

const _SETTLE_FIELDS = ['creditReceivedDate', 'creditReceivedTime', 'creditReceivedManually'];

export function isSettleableSale(rec) {
  return !!rec && (rec.paymentType === 'CREDIT' || rec.transactionType === 'OLD_DEBT');
}

export function planCreditToggle(rec, today, nowTime) {
  const next = !rec.creditReceived;
  return next
    ? { set: { creditReceived: true, creditReceivedManually: true, creditReceivedDate: today, creditReceivedTime: nowTime }, clear: [] }
    : { set: { creditReceived: false }, clear: _SETTLE_FIELDS.slice() };
}

export function planEditSettlement(original, newPaymentType) {
  if (newPaymentType === 'CASH') return { set: { creditReceived: true }, clear: _SETTLE_FIELDS.slice() };
  if (original && original.paymentType === 'CREDIT' && newPaymentType === 'CREDIT') {
    const set = { creditReceived: !!original.creditReceived };
    _SETTLE_FIELDS.forEach(f => { if (original[f] !== undefined) set[f] = original[f]; });
    return { set, clear: original.creditReceived ? [] : _SETTLE_FIELDS.slice() };
  }
  return { set: { creditReceived: false }, clear: _SETTLE_FIELDS.slice() };
}

export function applySettlement(rec, plan) {
  if (!rec || !plan) return rec;
  Object.assign(rec, plan.set);
  (plan.clear || []).forEach(f => { delete rec[f]; });
  return rec;
}

const _tid = (t) => String((t && (t.recordId || t.id)) || '');
const _tcol = (t) => (t && (t.collection || t.recordType)) || '';
const _lc = (v) => String(v || '').trim().toLowerCase();

function _returnPairMatches(entry, log) {
  if (!entry || !log) return false;
  return entry.store === log.store && entry.date === log.date && _n(log.quantity) === _n(entry.net) &&
    ((entry.createdAt != null && log.createdAt === entry.createdAt) || (entry.returnedBy && log.seller === entry.returnedBy));
}

export function findParentTombstones(tomb, allTombs, live) {
  const all = Array.isArray(allTombs) ? allTombs : [];
  const snap = (tomb && tomb.snapshot) || {};
  const col = _tcol(tomb);
  const liveIds = (live && live.ids) || new Set();
  const out = [];
  if (col === 'expenses') {
    all.forEach(t => { if (t && ['transactions'].includes(_tcol(t)) && t.snapshot && t.snapshot.expenseId && String(t.snapshot.expenseId) === _tid(tomb)) out.push(t); });
  }
  const byId = (id, cols) => all.find(t => t && _tid(t) === String(id) && cols.includes(_tcol(t)));
  const need = (id, cols) => { if (id && !liveIds.has(String(id))) { const p = byId(id, cols); if (p) out.push(p); } };
  need(snap.relatedSaleId, ['sales', 'rep']);
  need(snap.expenseId, ['expenses']);
  need(snap.entityId, ['entities']);
  if (snap.isTransfer) need(snap.transferPeerEntityId, ['entities']);
  if (col === 'inventory') need(snap.supplierId, ['entities']);
  if ((col === 'sales' || col === 'rep') && snap.customerName && !snap.isRepTransfer && !(col === 'sales' && snap.salesRep && snap.salesRep !== 'NONE')) {
    const kind = col === 'sales' ? 'sales' : 'rep';
    const names = (live && live.contacts && live.contacts[kind]) || new Set();
    if (!names.has(_lc(snap.customerName))) {
      const ccol = kind === 'sales' ? 'customers' : 'clients';
      const c = all.find(t => t && _tcol(t) === ccol && t.snapshot && _lc(t.snapshot.name) === _lc(snap.customerName));
      if (c) out.push(c);
    }
  }
  if (col === 'production' && snap.isReturn) {
    const l = all.find(t => t && _tcol(t) === 'returns' && _returnPairMatches(snap, t.snapshot));
    if (l) out.push(l);
  }
  if (col === 'returns') {
    const e = all.find(t => t && _tcol(t) === 'production' && t.snapshot && t.snapshot.isReturn && _returnPairMatches(t.snapshot, snap));
    if (e) out.push(e);
  }
  return out;
}

export function expandRecoveryMembers(tomb, allTombs, live) {
  if (!tomb) return [];
  const seen = new Map();
  const queue = [tomb];
  while (queue.length) {
    const t = queue.pop();
    const id = _tid(t);
    if (!id || seen.has(id)) continue;
    seen.set(id, t);
    findGroupMembers(t, allTombs).forEach(m => { if (m) queue.push(m); });
    findParentTombstones(t, allTombs, live).forEach(p => queue.push(p));
  }
  return Array.from(seen.values());
}

export function planGroupRecovery(members, blocked, requestedId) {
  const list = (members || []).filter(Boolean);
  const byId = new Map(list.map(t => [_tid(t), t]));
  const skip = new Map();
  for (const t of list) if (blocked && blocked.has(_tid(t))) skip.set(_tid(t), blocked.get(_tid(t)));
  const label = (t) => (t.snapshot && (t.snapshot.name || t.snapshot.customerName || t.snapshot.id)) || _tid(t);
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of list) {
      const id = _tid(t);
      if (skip.has(id)) continue;
      const s = t.snapshot || {};
      let why = null;
      for (const pid of [s.relatedSaleId, s.expenseId, s.entityId, _tcol(t) === 'inventory' ? s.supplierId : null]) {
        if (pid && skip.has(String(pid)) && byId.has(String(pid))) { why = `it depends on "${label(byId.get(String(pid)))}", which cannot be recovered yet`; break; }
      }
      if (!why && s.transferPairId) {
        const partner = list.find(x => x !== t && x.snapshot && x.snapshot.transferPairId === s.transferPairId && skip.has(_tid(x)));
        if (partner) why = 'the other side of this transfer cannot be recovered yet';
      }
      if (!why && (_tcol(t) === 'returns' || (_tcol(t) === 'production' && s.isReturn))) {
        const partner = list.find(x => x !== t && skip.has(_tid(x)) && (
          (_tcol(t) === 'production' && _tcol(x) === 'returns' && _returnPairMatches(s, x.snapshot)) ||
          (_tcol(t) === 'returns' && _tcol(x) === 'production' && x.snapshot && x.snapshot.isReturn && _returnPairMatches(x.snapshot, s))));
        if (partner) why = 'its matching return record cannot be recovered yet';
      }
      if (!why && (_tcol(t) === 'sales' || _tcol(t) === 'rep') && s.customerName) {
        const cc = _tcol(t) === 'sales' ? 'customers' : 'clients';
        const contact = list.find(x => skip.has(_tid(x)) && _tcol(x) === cc && x.snapshot && _lc(x.snapshot.name) === _lc(s.customerName));
        if (contact) why = `its customer "${s.customerName}" cannot be recovered yet`;
      }
      if (why) { skip.set(id, why); changed = true; }
    }
  }
  const restore = orderForRestore(list.filter(t => !skip.has(_tid(t))));
  const skipped = list.filter(t => skip.has(_tid(t))).map(t => ({ tomb: t, reason: skip.get(_tid(t)) }));
  const requestedSkipped = requestedId != null && skip.has(String(requestedId)) ? skip.get(String(requestedId)) : null;
  return { restore, skipped, requestedSkipped };
}

export function getTransferPairRestoreIssue(snapshot, liveTxs, tombstones, opts = {}) {
  if (!snapshot || snapshot.isTransfer !== true || !snapshot.transferPairId) return null;
  if (opts && opts.pairInSet) return null;
  const pid = snapshot.transferPairId;
  const selfId = String(snapshot.id || '');
  const live = (Array.isArray(liveTxs) ? liveTxs : []).some(t => t && !t.deletedAt && t.transferPairId === pid && String(t.id) !== selfId);
  if (live) return null;
  const tombed = (Array.isArray(tombstones) ? tombstones : []).some(t => t && t.snapshot && t.snapshot.transferPairId === pid && String(t.recordId || t.id) !== selfId);
  if (tombed) return null;
  return 'The other side of this transfer was permanently deleted. Restoring only one side would unbalance your cash, so this record cannot be recovered.';
}

export function getPartialPaidIssue(childTotal) {
  const c = _n(childTotal);
  return c > 0
    ? `${_r2(c)} was already collected through separate payment records on this sale. Marking it paid would count that money twice. Delete those payment records first.`
    : null;
}

export function planCalcRestore(entry, ctx) {
  const e = entry || {};
  const c = ctx || {};
  const sales = Array.isArray(c.sales) ? c.sales : [];
  const rep = Array.isArray(c.rep) ? c.rep : [];
  const history = Array.isArray(c.history) ? c.history : [];
  const claimed = new Set();
  const claimedRep = new Set();
  history.forEach(h => {
    if (!h || h.deletedAt || String(h.id) === String(e.id)) return;
    (Array.isArray(h.linkedSalesIds) ? h.linkedSalesIds : []).forEach(i => claimed.add(String(i)));
    (Array.isArray(h.linkedRepSalesIds) ? h.linkedRepSalesIds : []).forEach(i => claimedRep.add(String(i)));
  });
  const problems = [];
  const ids = Array.isArray(e.linkedSalesIds) ? e.linkedSalesIds : [];
  let missing = 0, paid = 0, other = 0;
  ids.forEach(id => {
    const sale = sales.find(x => x && String(x.id) === String(id) && !x.deletedAt);
    if (!sale) missing++;
    else if (claimed.has(String(id))) other++;
    else if (sale.paymentType !== 'CREDIT' || sale.creditReceived) paid++;
  });
  if (missing || paid || other) {
    const parts = [];
    if (missing) parts.push(`${missing} deleted`);
    if (paid) parts.push(`${paid} already paid or changed`);
    if (other) parts.push(`${other} settled by another calculator record`);
    problems.push(`${missing + paid + other} of the ${ids.length} credit sale${ids.length !== 1 ? 's' : ''} this record settled can no longer be settled again (${parts.join(', ')})`);
  }
  const repIds = Array.isArray(e.linkedRepSalesIds) ? e.linkedRepSalesIds : [];
  let repBad = 0;
  repIds.forEach(id => {
    const sale = rep.find(x => x && String(x.id) === String(id) && !x.deletedAt);
    if (!sale || sale.usedInCalcId || claimedRep.has(String(id))) repBad++;
  });
  if (repBad) problems.push(`${repBad} of the ${repIds.length} rep sale${repIds.length !== 1 ? 's' : ''} it used ${repBad !== 1 ? 'are' : 'is'} deleted or already used by another record`);
  if (_n(e.returned) > 0 && e.returnStore && Array.isArray(c.storeKeys) && !c.storeKeys.includes(e.returnStore)) {
    problems.push('the store it returned stock to no longer exists');
  }
  if (e.transferSaleId && !c.transferSnapshot && !c.repPriceOk) {
    problems.push(`no sale price is set for ${e.returnRep || 'the rep'} to re-create the stock transfer`);
  }
  return { block: problems.length ? `This calculator record cannot be recovered because ${problems.join('; ')}. Enter the calculation again.` : null };
}

export function findPartialConflicts(sales) {
  const list = (Array.isArray(sales) ? sales : []).filter(s => s && !s.deletedAt);
  const kids = new Map();
  list.forEach(s => {
    if (s.paymentType === 'PARTIAL_PAYMENT' && s.relatedSaleId) {
      const k = String(s.relatedSaleId);
      if (!kids.has(k)) kids.set(k, []);
      kids.get(k).push(s);
    }
  });
  const out = [];
  list.forEach(p => {
    const c = kids.get(String(p.id));
    if (!c || p.paymentType !== 'CREDIT') return;
    const childSum = _r2(c.reduce((t, x) => t + _n(x.totalValue), 0));
    if (childSum <= 0) return;
    const parentPaid = _n(p.partialPaymentReceived);
    if (p.creditReceived) {
      out.push({ id: p.id, customerName: p.customerName, kind: 'cash-counted-twice', amount: childSum, children: c.length });
    } else if (parentPaid > 0) {
      out.push({ id: p.id, customerName: p.customerName, kind: 'debt-reduced-twice', amount: _r2(Math.min(parentPaid, childSum)), children: c.length });
    }
  });
  return out;
}

export function collectionCollected(rec) {
  if (!rec) return 0;
  return rec.collectedAmount != null ? _n(rec.collectedAmount) : _n(rec.totalValue);
}

export function sortForCollection(list) {
  const day = (s) => String(s.supplyDate || s.date || '');
  return list.slice().sort((a, b) => {
    const ao = a.transactionType === 'OLD_DEBT' ? 0 : 1, bo = b.transactionType === 'OLD_DEBT' ? 0 : 1;
    if (ao !== bo) return ao - bo;
    if (day(a) !== day(b)) return day(a) < day(b) ? -1 : 1;
    return _n(a.timestamp) - _n(b.timestamp);
  });
}

export function planCollectionAllocation(amount, dues) {
  let left = _r2(Math.max(0, _n(amount)));
  const allocs = [];
  for (const d of dues || []) {
    if (left <= 0.004) break;
    const due = _r2(_n(d.due));
    if (due <= 0.004) continue;
    if (left >= due - 0.004) { allocs.push({ saleId: d.id, amount: due, full: true }); left = _r2(Math.max(0, left - due)); }
    else { allocs.push({ saleId: d.id, amount: left, full: false }); left = 0; }
  }
  return { allocs, leftover: _r2(Math.max(0, left)) };
}

export function applyCollectionAlloc(sale, alloc, cid, when) {
  if (!sale || !alloc) return sale;
  if (!Array.isArray(sale.collectionAllocs)) sale.collectionAllocs = [];
  sale.collectionAllocs.push({ cid, amount: _r2(alloc.amount), full: !!alloc.full });
  if (alloc.full) {
    sale.creditReceived = true;
    sale.creditReceivedManually = true;
    if (sale.transactionType === 'OLD_DEBT') sale.partialPaymentReceived = _r2(_n(sale.partialPaymentReceived) + _n(alloc.amount));
  } else {
    sale.partialPaymentReceived = _r2(_n(sale.partialPaymentReceived) + _n(alloc.amount));
  }
  return sale;
}

export function revertCollectionAlloc(sale, cid) {
  if (!sale || !Array.isArray(sale.collectionAllocs)) return false;
  const i = sale.collectionAllocs.findIndex(a => a && a.cid === cid);
  if (i < 0) return false;
  const [a] = sale.collectionAllocs.splice(i, 1);
  if (a.full) {
    sale.creditReceived = false;
    delete sale.creditReceivedManually;
    if (sale.transactionType === 'OLD_DEBT') sale.partialPaymentReceived = _r2(Math.max(0, _n(sale.partialPaymentReceived) - _n(a.amount)));
  } else {
    sale.partialPaymentReceived = _r2(Math.max(0, _n(sale.partialPaymentReceived) - _n(a.amount)));
  }
  if (!sale.collectionAllocs.length) delete sale.collectionAllocs;
  return true;
}

export function collectionPartialCash(sale) {
  if (!sale || sale.creditReceived || !Array.isArray(sale.collectionAllocs)) return 0;
  return _r2(sale.collectionAllocs.reduce((t, a) => t + (a && !a.full ? _n(a.amount) : 0), 0));
}

export function getCollectionRevertIssue(collection, sales) {
  const list = Array.isArray(collection && collection.allocations) ? collection.allocations : [];
  for (const a of list) {
    const sale = (sales || []).find(s => s && s.id === a.saleId);
    if (!sale || !Array.isArray(sale.collectionAllocs)) continue;
    const i = sale.collectionAllocs.findIndex(x => x && x.cid === collection.id);
    if (i >= 0 && i < sale.collectionAllocs.length - 1) {
      return 'A newer collection was applied to the same sale(s) after this one. Delete or edit the newer collection first.';
    }
  }
  return null;
}

export function getCollectionReapplyIssue(collection, sales) {
  const list = Array.isArray(collection && collection.allocations) ? collection.allocations : [];
  for (const a of list) {
    const sale = (sales || []).find(s => s && !s.deletedAt && s.id === a.saleId);
    if (!sale) return 'A sale this collection paid is no longer in your records. Recover that sale first, then recover the collection.';
    if (sale.creditReceived) return 'A sale this collection paid has since been settled another way, so the collection cannot be recovered.';
  }
  return null;
}

const _held = new Set();

export function runExclusive(key, fn) {
  if (_held.has(key)) return Promise.resolve(undefined);
  _held.add(key);
  return Promise.resolve().then(fn).finally(() => _held.delete(key));
}

const _cashRelevant = (tx) => !!tx && !tx.isTransfer && !tx.isMerged && !(tx.isPayable && tx.type === 'IN');

export function getDeleteCashDrop(tx) {
  return _cashRelevant(tx) && tx.type === 'IN' ? _n(tx.amount) : 0;
}

export function getRestoreCashNeed(tx) {
  return _cashRelevant(tx) && tx.type === 'OUT' && !tx.isPayable ? _n(tx.amount) : 0;
}

export function getCashShortIssue(need, available, what) {
  const n = _n(need);
  if (n <= 0 || _n(available) - n >= -0.0001) return null;
  return `${what} would take ${_r2(n)} out of cash in hand, but only ${_r2(Math.max(0, _n(available)))} is available. Record the money in first.`;
}

// ===== Intelligent save/delete planners for payment transactions =====
// These pure functions are the single source of truth for "what does saving or
// deleting this transaction mean" so every entry point (payment tab, entity
// overlay, expense cascade, entity delete) classifies and blocks consistently.

export function planTransferPairDelete(entries) {
  const list = (Array.isArray(entries) ? entries : []).filter(Boolean);
  if (!list.length) return { pairs: [], orphans: [], amount: 0, fromName: '?', toName: '?', block: 'Transfer not found — it may have already been removed.' };
  const outSide = list.find(t => t.type === 'OUT') || null;
  const inSide = list.find(t => t.type === 'IN') || null;
  const pairs = [outSide, inSide].filter(Boolean);
  const orphans = list.filter(t => t !== outSide && t !== inSide);
  return {
    pairs,
    orphans,
    complete: !!(outSide && inSide) && orphans.length === 0,
    amount: _n((outSide && outSide.amount) || (inSide && inSide.amount)),
    fromName: outSide ? outSide.entityName : (inSide && inSide.transferPeerEntityName) || '?',
    toName: inSide ? inSide.entityName : (outSide && outSide.transferPeerEntityName) || '?',
    block: null
  };
}

export function planPaymentTxDeletion(tx, allTxs, expenses, opts = {}) {
  if (!tx || !tx.id) return { kind: 'missing', block: 'Transaction not found — it may have already been removed.' };
  if (tx.isMerged) return { kind: 'merged', block: 'Merged opening balance records cannot be deleted' };
  if (tx.isTransfer === true) {
    const pairId = tx.transferPairId;
    const entries = (Array.isArray(allTxs) ? allTxs : []).filter(t => t && t.transferPairId === pairId);
    return { kind: 'transfer', pairId, pair: planTransferPairDelete(entries), cashDrop: 0, cascadeExpense: null, block: null };
  }
  const kind = tx.isPayable ? 'payable' : (tx.expenseId ? 'expense' : 'plain');
  return {
    kind,
    cashDrop: getDeleteCashDrop(tx),
    cascadeExpense: planExpenseCascade(tx, allTxs, expenses, opts.excludeIds),
    block: null
  };
}

export function planEntityTxDeletion(txs) {
  const merged = [], normal = [], pairMap = new Map();
  for (const t of (Array.isArray(txs) ? txs : [])) {
    if (!t) continue;
    if (t.isMerged) { merged.push(t); continue; }
    if (t.isTransfer === true && t.transferPairId) {
      if (!pairMap.has(t.transferPairId)) pairMap.set(t.transferPairId, []);
      pairMap.get(t.transferPairId).push(t);
      continue;
    }
    normal.push(t);
  }
  const transferPairs = [...pairMap.entries()].map(([pairId, entries]) => ({ pairId, ...planTransferPairDelete(entries) }));
  const cashDrop = normal.reduce((sum, t) => sum + getDeleteCashDrop(t), 0);
  return { merged, normal, transferPairs, cashDrop };
}

export function getBatchCashIssue(txs, available, what) {
  const need = (Array.isArray(txs) ? txs : []).reduce((sum, t) => sum + getDeleteCashDrop(t), 0);
  return getCashShortIssue(need, available, what);
}

export function getTxLinkIssue(tx, ctx = {}) {
  if (!tx || !tx.id) return 'Missing transaction record.';
  if (tx.type !== 'IN' && tx.type !== 'OUT') return 'Transaction type must be IN or OUT — save it again as a proper payment.';
  const entities = Array.isArray(ctx.entities) ? ctx.entities : null;
  const expenses = Array.isArray(ctx.expenses) ? ctx.expenses : null;
  const inventory = Array.isArray(ctx.inventory) ? ctx.inventory : null;
  const liveEnt = (id) => !entities || (id && entities.some(e => e && !e.deletedAt && String(e.id) === String(id)));
  if (tx.isTransfer === true) {
    if (!tx.transferPairId) return 'Transfer is missing its pair id — save it again as a proper transfer.';
    if (!tx.transferPeerEntityId) return 'Transfer is missing the entity on the other side.';
    if (String(tx.entityId) === String(tx.transferPeerEntityId)) return 'A transfer cannot have the same entity on both sides.';
    if (!liveEnt(tx.entityId)) return `The ${tx.entityName ? `"${tx.entityName}"` : 'entity'} on this transfer no longer exists.`;
    if (!liveEnt(tx.transferPeerEntityId)) return `The ${tx.transferPeerEntityName ? `"${tx.transferPeerEntityName}"` : 'other entity'} on this transfer no longer exists.`;
    return null;
  }
  if (tx.entityId && !liveEnt(tx.entityId)) return `The ${tx.entityName ? `"${tx.entityName}"` : 'entity'} this payment belongs to no longer exists.`;
  if (tx.expenseId && expenses && !expenses.some(e => e && !e.deletedAt && String(e.id) === String(tx.expenseId))) {
    return 'The expense this payment is linked to no longer exists.';
  }
  if (tx.isPayable && inventory && Array.isArray(tx.materialIds) && tx.materialIds.length) {
    const missing = tx.materialIds.filter(mid => !inventory.some(m => m && !m.deletedAt && String(m.id) === String(mid)));
    if (missing.length === tx.materialIds.length) return 'None of the materials this supplier payment settles exist anymore.';
  }
  return null;
}

// Price per kg a customer (or rep) is charged, from their own unpaid credit sales:
// total value / total kg. Returns 0 when there is nothing to base it on.
export function weightedUnitPrice(items) {
  let qty = 0, val = 0;
  for (const it of Array.isArray(items) ? items : []) {
    const q = _n(it && it.quantity), v = _n(it && it.value);
    if (q > 0 && v > 0) { qty += q; val += v; }
  }
  return qty > 0 ? Math.round((val / qty) * 10000) / 10000 : 0;
}

// Value of goods handed back, never more than what is still owed (a credit cannot
// push the balance below zero). `outstanding` < 0 means "unknown": no cap is applied.
export function planGoodsCredit(qty, unitPrice, outstanding) {
  const raw = _r2(Math.max(0, _n(qty)) * Math.max(0, _n(unitPrice)));
  if (outstanding == null || _n(outstanding) < 0) return { value: raw, raw, capped: false };
  const cap = _r2(Math.max(0, _n(outstanding)));
  return raw > cap ? { value: cap, raw, capped: true } : { value: raw, raw, capped: false };
}

export function planBulkCashDrop(txs) {
  return _r2((Array.isArray(txs) ? txs : [txs]).reduce((t, x) => t + getDeleteCashDrop(x), 0));
}

export function planEntityRename(entityId, newName, txs, materials) {
  const id = String(entityId);
  const tx = [], mat = [];
  (Array.isArray(txs) ? txs : []).forEach(t => {
    if (!t) return;
    let hit = false;
    if (String(t.entityId) === id && t.entityName !== newName) { hit = true; }
    if (String(t.transferPeerEntityId) === id && t.transferPeerEntityName !== newName) { hit = true; }
    if (hit) tx.push(t.id);
  });
  (Array.isArray(materials) ? materials : []).forEach(m => {
    if (m && String(m.supplierId) === id && m.supplierName !== newName) mat.push(m.id);
  });
  return { txIds: tx, materialIds: mat };
}

export function applyEntityRename(entityId, newName, txs, materials, plan) {
  const id = String(entityId);
  const T = new Set(plan.txIds.map(String)), M = new Set(plan.materialIds.map(String));
  (txs || []).forEach(t => { if (t && T.has(String(t.id))) {
    if (String(t.entityId) === id) t.entityName = newName;
    if (String(t.transferPeerEntityId) === id) t.transferPeerEntityName = newName;
  } });
  (materials || []).forEach(m => { if (m && M.has(String(m.id))) m.supplierName = newName; });
}

export function sortInventoryItems(items, sort) {
const amt = (m) => (Number(m.quantity) * Number(m.cost)) || 0;
const dir = sort.dir === 'desc' ? -1 : 1;
return items.slice().sort((a, b) => {
const r = sort.key === 'amount'
? amt(a) - amt(b)
: String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base', numeric: true });
return dir * (r || String(a.name || '').localeCompare(String(b.name || '')));
});
}

export function shouldSkipReattach(childTomb, parentTomb) {
  if (!childTomb || !parentTomb) return false;
  const cs = childTomb.snapshot || {}, ps = parentTomb.snapshot || {};
  const cg = cs[GROUP_FIELD], pg = ps[GROUP_FIELD];
  if (cg || pg) return !!cg && cg === pg;
  const ct = _n(childTomb.deletedAt || childTomb.tombstoned_at), pt = _n(parentTomb.deletedAt || parentTomb.tombstoned_at);
  return ct > 0 && pt > 0 && Math.abs(ct - pt) <= 3000;
}

export function planSkipReattach(members) {
  const list = (Array.isArray(members) ? members : []).filter(Boolean);
  const byId = new Map(list.map(t => [String(t.recordId || t.id), t]));
  const skip = new Set();
  list.forEach(t => {
    const s = t.snapshot || {};
    if (s.paymentType === 'PARTIAL_PAYMENT' && s.relatedSaleId) {
      const parent = byId.get(String(s.relatedSaleId));
      if (parent && shouldSkipReattach(t, parent)) skip.add(String(t.recordId || t.id));
    }
  });
  return skip;
}

export function planExpenseNameRename(entity, oldName, newName, expenses) {
  if (!entity || !entity.isExpenseEntity || !oldName || oldName === newName) return [];
  const o = String(oldName).trim().toLowerCase();
  return (Array.isArray(expenses) ? expenses : []).filter(e => e && !e.deletedAt && e.name && String(e.name).trim().toLowerCase() === o).map(e => e.id);
}

const rec = (key, label, tab, desc) => ({ key, sqlite: key, collection: key, jsVar: key, label, tab, desc });

export const RECORD_STORES = Object.freeze([
  rec('production',   'Production',           'production', 'Factory production batches'),
  rec('sales',        'Customer Sales',       'sales',      'Direct customer sales'),
  rec('calculator',   'Calculator History',   'calculator', 'Daily calculator / ledger entries'),
  rec('rep',          'Rep Sales',            'rep',        'Rep sales to customers'),
  rec('clients',      'Rep Customers',        'rep',        'Rep customer contact registry'),
  rec('customers',    'Sales Customers',      'sales',      'Sales tab customer contacts'),
  rec('transactions', 'Payment Transactions', 'payments',   'Cash & entity payment transactions'),
  rec('entities',     'Payment Entities',     'payments',   'Payment entity accounts'),
  rec('inventory',    'Factory Inventory',    'factory',    'Raw material inventory'),
  rec('factory',      'Factory History',      'factory',    'Factory batch production history'),
  rec('expenses',     'Expenses',             'payments',   'Expense entries'),
  rec('returns',      'Stock Returns',        'production', 'Stock return records'),
].map(Object.freeze));

export const DATASET_BY_KEY = Object.freeze(Object.fromEntries(RECORD_STORES.map(s => [s.key, s])));
export const RECORD_KEYS = Object.freeze(RECORD_STORES.map(s => s.key));

export const AUX_STATE = Object.freeze([
  {
    sqlite: 'categories',
    tsKey: 'categories_timestamp',
    firestore: { doc: 'categories/list', field: 'categories', tsField: 'categories_timestamp' },
    kind: 'list',
  },
  {
    sqlite: 'formulas',
    tsKey: 'formulas_timestamp',
    firestore: { doc: 'formulas/config', field: 'formulas', tsField: 'formulas_timestamp' },
    kind: 'idList',
  },
  {
    sqlite: 'slots',
    tsKey: 'slots_timestamp',
    firestore: { doc: 'formulas/config', field: 'slots', tsField: 'slots_timestamp' },
    kind: 'slots',
  },
]);

export function isSupportedBackup(data) {
  return !!data && typeof data === 'object' && !Array.isArray(data) && RECORD_KEYS.some(k => Array.isArray(data[k]));
}

export function mergeStringLists(local, incoming) {
  const out = [];
  const seen = new Set();
  for (const v of [...(Array.isArray(local) ? local : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    if (typeof v !== 'string') continue;
    const t = v.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function mergeById(local, incoming) {
  const out = Array.isArray(local) ? local.filter(r => r && r.id) : [];
  const ids = new Set(out.map(r => String(r.id)));
  for (const r of Array.isArray(incoming) ? incoming : []) {
    if (r && r.id && !ids.has(String(r.id))) { ids.add(String(r.id)); out.push(r); }
  }
  return out;
}

export function mergeSlots(local, incoming) {
  const l = local && typeof local === 'object' ? local : {};
  const i = incoming && typeof incoming === 'object' ? incoming : {};
  return { standard: l.standard || i.standard || null, asaan: l.asaan || i.asaan || null };
}

export function resolveExpenseCategories(local, cloud, localTs = 0, cloudTs = 0) {
  const l = Array.isArray(local) ? local : [];
  const c = Array.isArray(cloud) ? cloud : [];
  if (cloudTs && cloudTs > (localTs || 0)) return { value: mergeStringLists(c, []), ts: cloudTs, changed: true };
  if (!cloudTs) {
    const union = mergeStringLists(l, c);
    return { value: union, ts: localTs || 0, changed: union.length !== l.length };
  }
  return { value: l, ts: localTs, changed: false };
}

export async function collectAuxBackupFields(store) {
  const out = {};
  for (const s of AUX_STATE) {
    const v = await store.get(s.sqlite);
    if (s.kind === 'list')   out[s.sqlite] = Array.isArray(v) ? v : [];
    if (s.kind === 'idList') out[s.sqlite] = Array.isArray(v) ? v : [];
    if (s.kind === 'slots')  out[s.sqlite] = v && typeof v === 'object' ? v : { standard: null, asaan: null };
  }
  out.photos = (await store.get('photos')) || {};
  out.photostamps = (await store.get('photostamps')) || {};
  return out;
}

export async function applyAuxBackupFields(data, store, ts = Date.now(), mode = 'merge') {
  const written = [];
  if (!data || typeof data !== 'object') return written;
  for (const s of AUX_STATE) {
    const incoming = data[s.sqlite];
    if (incoming === undefined || incoming === null) continue;
    const local = await store.get(s.sqlite);
    let next;
    if (s.kind === 'list') {
      if (!Array.isArray(incoming)) continue;
      next = mode === 'replace' ? mergeStringLists(incoming, []) : mergeStringLists(local, incoming);
      if (JSON.stringify(next) === JSON.stringify(Array.isArray(local) ? local : [])) continue;
    } else if (s.kind === 'idList') {
      if (!Array.isArray(incoming)) continue;
      next = mode === 'replace' ? incoming.filter(r => r && r.id) : mergeById(local, incoming);
      if (JSON.stringify(next) === JSON.stringify(Array.isArray(local) ? local : [])) continue;
    } else {
      if (typeof incoming !== 'object' || !(incoming.standard || incoming.asaan)) continue;
      next = mode === 'replace'
        ? { standard: incoming.standard || null, asaan: incoming.asaan || null }
        : mergeSlots(local, incoming);
      if (JSON.stringify(next) === JSON.stringify(local || null)) continue;
    }
    await store.set(s.sqlite, next);
    await store.set(s.tsKey, ts);
    written.push(s.sqlite);
  }
  return written;
}
