// Pure link-graph helpers. NO imports on purpose: everything here works on plain arrays/objects so it
// can be unit-tested in node and reused by the store-aware wrappers in link-guards.js.
//
// Record links in this app:
//   customer_sales / rep_sales : relatedSaleId  (partial payment -> parent credit sale)
//   rep_sales                  : usedInCalcId   (rep sale consumed by a calculator record)
//   noman_history              : linkedSalesIds[], linkedRepSalesIds[], transferSaleId, returnEntryId, returnLogId
//   payment_transactions       : expenseId      (payment -> expense record), entityId (payment -> entity)
// Recovering a record from the recycle bin gives it a NEW id (so cloud tombstones on other devices
// cannot re-delete it). Every field above therefore has to be re-pointed at the new id.

export const GROUP_FIELD = '_deletionGroup';

export const REF_FIELDS = {
  customer_sales:       { scalar: ['relatedSaleId'], array: [] },
  rep_sales:            { scalar: ['relatedSaleId', 'usedInCalcId'], array: [] },
  noman_history:        { scalar: ['transferSaleId', 'returnEntryId', 'returnLogId'], array: ['linkedSalesIds', 'linkedRepSalesIds'] },
  payment_transactions: { scalar: ['expenseId', 'entityId', 'materialId'], array: ['materialIds'] },
  factory_inventory_data: { scalar: ['supplierId'], array: [] },
};

// Tombstone collection name -> storage key
export const COLLECTION_TO_KEY = {
  sales: 'customer_sales',
  rep_sales: 'rep_sales',
  calculator_history: 'noman_history',
  transactions: 'payment_transactions',
  payment_transactions: 'payment_transactions',
  expenses: 'expenses',
  production: 'mfg_pro_pkr',
  returns: 'stock_returns',
  sales_customers: 'sales_customers',
  rep_customers: 'rep_customers',
  entities: 'payment_entities',
  inventory: 'factory_inventory_data',
  factory_history: 'factory_production_history',
};

const _n = (v) => Number(v) || 0;
const _r2 = (v) => Math.round((_n(v) + Number.EPSILON) * 100) / 100;

// Follow oldId -> newId chains (a record can be deleted and recovered more than once).
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

// Re-point every reference to oldId at newId. `stores` is { storeKey: record[] }.
// Mutates records in place and returns { storeKey: [changedRecord, ...] } so callers save only what changed.
export function remapReferences(stores, oldId, newId) {
  const changed = {};
  const o = String(oldId);
  const nw = String(newId);
  for (const key of Object.keys(REF_FIELDS)) {
    const arr = stores[key];
    if (!Array.isArray(arr)) continue;
    const { scalar, array } = REF_FIELDS[key];
    for (const rec of arr) {
      if (!rec || typeof rec !== 'object') continue;
      let hit = false;
      for (const f of scalar) if (rec[f] != null && String(rec[f]) === o) { rec[f] = nw; hit = true; }
      for (const f of array) {
        if (!Array.isArray(rec[f])) continue;
        const idx = rec[f].findIndex(x => String(x) === o);
        if (idx !== -1) { rec[f] = rec[f].map(x => String(x) === o ? nw : x); hit = true; }
      }
      if (hit) (changed[key] = changed[key] || []).push(rec);
    }
  }
  return changed;
}

// Re-point a snapshot's OWN outgoing links using the recovered-id map (parent was recovered earlier).
export function resolveOwnLinks(collectionName, snapshot, idMap) {
  const key = COLLECTION_TO_KEY[collectionName];
  const spec = REF_FIELDS[key];
  if (!spec || !snapshot) return snapshot;
  for (const f of spec.scalar) if (snapshot[f]) snapshot[f] = resolveId(snapshot[f], idMap);
  for (const f of spec.array) if (Array.isArray(snapshot[f])) snapshot[f] = snapshot[f].map(x => resolveId(x, idMap));
  return snapshot;
}

// ---- partial payment <-> parent credit sale -------------------------------------------------------

// Delete side: take a child payment's amount back off its parent. Returns the NEW parent state
// (a patch) or null when nothing needs to change. Pure: does not mutate.
export function planChildDetach(parent, child) {
  if (!parent || !child) return null;
  const paid = Math.max(0, _r2(_n(parent.partialPaymentReceived) - _n(child.totalValue)));
  const patch = { partialPaymentReceived: paid };
  if (paid === 0) { patch.creditReceived = false; patch.clearCreditReceivedDate = true; }
  return patch;
}

// Restore side: put the child's amount back on the parent. Returns { patch } or { block }.
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

// Save side: an edit must not leave children inconsistent with their parent.
// children = records whose relatedSaleId === original.id
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

// ---- payment transaction <-> expense record --------------------------------------------------------

// Delete side: deleting a payment must also remove the expense record that was created with it, but only
// when no OTHER payment still points at that expense. Pure: returns the expense to remove, or null.
// excludeIds = ids of payments that are being deleted in the same operation.
export function planExpenseCascade(tx, allTxs, expenses, excludeIds) {
  if (!tx || !tx.expenseId) return null;
  const skip = new Set([String(tx.id), ...(excludeIds ? [...excludeIds].map(String) : [])]);
  const stillUsed = (Array.isArray(allTxs) ? allTxs : []).some(t => t && !skip.has(String(t.id)) && String(t.expenseId) === String(tx.expenseId));
  if (stillUsed) return null;
  return (Array.isArray(expenses) ? expenses : []).find(e => e && String(e.id) === String(tx.expenseId)) || null;
}

// ---- deletion groups ---------------------------------------------------------------------------

// Stamp a snapshot so the recycle bin knows which tombstones were deleted together.
export function stampGroup(rec, groupId) {
  return rec && groupId ? { ...rec, [GROUP_FIELD]: groupId } : rec;
}

export function newGroupId(prefix = 'grp') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Order tombstones for restore: parents before children, expenses/customers before the rows that point at them.
const _COLLECTION_RANK = { sales_customers: 0, rep_customers: 0, expenses: 0, entities: 0, inventory: 0 };
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

// All tombstones that belong to the same deletion as `tomb` (including itself).
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

// Every tombstone that must be erased / recovered with the given ones: each record plus the other members of
// its deletion group or transfer pair, de-duplicated by record id. `all` is every tombstone known to the bin.
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

// ---- nested material references (factory batches + formulas point at inventory item ids) -------------

// history: factory_production_history[], formulas: { formulaKey: [{id,...}] }
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

// ---- restoring a factory batch must take its raw materials out of inventory again --------------------
// Deleting a batch ADDED the materials back; restoring it must remove them, or they are counted twice.
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

// ---- restoring something that CONSUMES store stock must not overdraw that store/day -------------------
export function getStockOverdrawIssue(label, qty, availableNow) {
  const q = _n(qty);
  if (q <= 0) return null;
  if (_n(availableNow) - q < -0.0001) {
    return `Recovering this would use ${q} kg of ${label} stock but only ${Math.max(0, _n(availableNow))} kg is available on that date. Recover or add the stock first.`;
  }
  return null;
}

// ---- customer renames: records deleted before a rename must come back under the new name -------------
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

// ---- old-debt edits: changing the amount must not erase payments that were already collected ---------
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

// ---- production returns --------------------------------------------------------------------------------
// A return is TWO records: the production-tab entry (mfg_pro_pkr, isReturn) and the stock_returns log.
// Only the log counts toward store stock, so the pair must always be deleted / restored together.
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

// How many kg of store stock disappear when this return is deleted (0 when no log counts it).
export function getReturnStockDrop(entry, log) {
  return entry && log ? _n(log.quantity) : 0;
}

// ---- factory formula units consumed by a production entry -------------------------------------------
export function getUnitsShortIssue(label, requested, available) {
  const r = _n(requested);
  if (r <= 0) return null;
  if (_n(available) + 1e-9 < r) {
    return `Recovering this would use ${r} formula unit${r === 1 ? '' : 's'} of ${label}, but only ${Math.max(0, _n(available))} ${_n(available) === 1 ? 'is' : 'are'} available in the factory. Add or recover factory batches first.`;
  }
  return null;
}

// ---- supplier payables (Factory raw materials <-> Payment tab) ---------------------------------------------
// A linked material owes its supplier the amount that was INVOICED (the IN payable transaction), not its
// current stock value: batches use stock up, which lowers totalValue, but the debt does not shrink.
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

// inTxs: payable IN transactions of the material's supplier (already excluding any being deleted).
export function materialOriginalPayable(material, inTxs) {
  const direct = findPayableInTxs(inTxs, material && material.id).filter(t => _txMatIds(t).size === 1);
  if (direct.length) return _r2(direct.reduce((s, t) => s + _n(t.amount), 0));
  return _stockValueFallback(material || {});
}

// Pay oldest materials first. Mutates the materials; originalOf(m) gives each one's invoiced amount.
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

// Editing a linked material's stock value by `delta` moves the invoiced amount by the same delta.
export function planPayableAdjustment(currentInvoiced, delta) {
  const next = Math.max(0, _r2(_n(currentInvoiced) + _n(delta)));
  return { next, change: _r2(next - _n(currentInvoiced)) };
}

// ---- which formula will a store actually use? (pure; callers pass freshly-read data) -------------------------
const _SLOTS = ['standard', 'asaan'];
const _SLOT_LABEL = { standard: 'Standard', asaan: 'Asaan' };
export function resolveSelectedFormula(data, storeKey) {
  const list = (Array.isArray(data.list) ? data.list : []).filter(f => f && f.id);
  const slots = data.slots || {};
  const st = (Array.isArray(data.stores) ? data.stores : []).find(s => s && s.key === storeKey);
  const type = _SLOTS.includes(storeKey) ? storeKey : ((st && st.formulaType) || (storeKey === 'STORE_C' ? 'asaan' : 'standard'));
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

// ---- credit settlement (Sales tab) ------------------------------------------------------------------------
// The customer statement shows creditReceivedDate as the "settled on" date and sorts by it, so every path
// that flips creditReceived has to set or clear it together with the flag.
const _SETTLE_FIELDS = ['creditReceivedDate', 'creditReceivedTime', 'creditReceivedManually'];

export function isSettleableSale(rec) {
  return !!rec && (rec.paymentType === 'CREDIT' || rec.transactionType === 'OLD_DEBT');
}

// Manual "mark paid / mark unpaid" toggle. Returns the fields to apply (and the ones to clear).
export function planCreditToggle(rec, today, nowTime) {
  const next = !rec.creditReceived;
  return next
    ? { set: { creditReceived: true, creditReceivedManually: true, creditReceivedDate: today, creditReceivedTime: nowTime }, clear: [] }
    : { set: { creditReceived: false }, clear: _SETTLE_FIELDS.slice() };
}

// Editing a sale must not silently un-pay it. CREDIT -> CREDIT keeps the settlement, anything else follows the new type.
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

// ---- recovery planning -----------------------------------------------------------------------------------
// Records deleted before deletion groups existed have no group id, but they still point at what they depend
// on. Recovering a record therefore also brings back the PARENT it needs (never the other way round, so
// recovering one payment does not drag back every other payment of that supplier).
const _tid = (t) => String((t && (t.recordId || t.id)) || '');
const _tcol = (t) => (t && (t.collection || t.recordType)) || '';
const _lc = (v) => String(v || '').trim().toLowerCase();

function _returnPairMatches(entry, log) {
  if (!entry || !log) return false;
  return entry.store === log.store && entry.date === log.date && _n(log.quantity) === _n(entry.net) &&
    ((entry.createdAt != null && log.createdAt === entry.createdAt) || (entry.returnedBy && log.seller === entry.returnedBy));
}

// live = { ids: Set<string> of live record ids, contacts: { sales: Set<lowercase name>, rep: Set<lowercase name> } }
export function findParentTombstones(tomb, allTombs, live) {
  const all = Array.isArray(allTombs) ? allTombs : [];
  const snap = (tomb && tomb.snapshot) || {};
  const col = _tcol(tomb);
  const liveIds = (live && live.ids) || new Set();
  const out = [];
  const byId = (id, cols) => all.find(t => t && _tid(t) === String(id) && cols.includes(_tcol(t)));
  const need = (id, cols) => { if (id && !liveIds.has(String(id))) { const p = byId(id, cols); if (p) out.push(p); } };
  need(snap.relatedSaleId, ['sales', 'rep_sales']);
  need(snap.expenseId, ['expenses']);
  need(snap.entityId, ['entities']);
  if (col === 'inventory') need(snap.supplierId, ['entities']);
  if ((col === 'sales' || col === 'rep_sales') && snap.customerName && !snap.isRepTransfer && !(col === 'sales' && snap.salesRep && snap.salesRep !== 'NONE')) {
    const kind = col === 'sales' ? 'sales' : 'rep';
    const names = (live && live.contacts && live.contacts[kind]) || new Set();
    if (!names.has(_lc(snap.customerName))) {
      const ccol = kind === 'sales' ? 'sales_customers' : 'rep_customers';
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

// Everything that has to come back together with `tomb`: its deletion group, its transfer / return partner,
// and any parent it needs that is still sitting in the bin.
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

// Decide what can be recovered now. blocked: Map<recordId, reason>. A blocked record is skipped, and so is
// everything that depends on it (its payments, its customer's sales...) or must travel with it (pairs).
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
      if (!why && (_tcol(t) === 'sales' || _tcol(t) === 'rep_sales') && s.customerName) {
        const cc = _tcol(t) === 'sales' ? 'sales_customers' : 'rep_customers';
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

// Marking a sale paid while payment records exist against it would count that money twice.
export function getPartialPaidIssue(childTotal) {
  const c = _n(childTotal);
  return c > 0
    ? `${_r2(c)} was already collected through separate payment records on this sale. Marking it paid would count that money twice. Delete those payment records first.`
    : null;
}

// ---- calculator entry restore ----------------------------------------------------------------------------
// A calculator record settles credit sales, claims rep sales, and may create a return, a rep transfer and
// CHORA stock. Deleting it reverses all of that, so restoring it has to re-apply ALL of it - and only when
// every record it touched is still exactly as the delete left it. Otherwise nothing is restored.
export function planCalcRestore(entry, ctx) {
  const e = entry || {};
  const c = ctx || {};
  const sales = Array.isArray(c.sales) ? c.sales : [];
  const repSales = Array.isArray(c.repSales) ? c.repSales : [];
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
    const sale = repSales.find(x => x && String(x.id) === String(id) && !x.deletedAt);
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

// ---- legacy partly-paid sales -----------------------------------------------------------------------------
// Old versions saved a partial payment twice: a PARTIAL_PAYMENT record AND a running total on the credit sale.
// Statements and trackers apply both, so such a sale is counted twice. This finds exactly those sales.
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
      // Marked paid: its full value is already counted as received, and the payment records add it again.
      out.push({ id: p.id, customerName: p.customerName, kind: 'cash-counted-twice', amount: childSum, children: c.length });
    } else if (parentPaid > 0) {
      // Unpaid: the running total and the payment records both reduce what the customer owes.
      out.push({ id: p.id, customerName: p.customerName, kind: 'debt-reduced-twice', amount: _r2(Math.min(parentPaid, childSum)), children: c.length });
    }
  });
  return out;
}

// ---- bulk / partial collections -> credit sales ------------------------------------------------------------
// A collection used to be a lone record that lowered the customer's balance while every credit sale kept
// showing UNPAID. Now the money is applied to the customer's unpaid credit sales, oldest first: a sale the money
// fully covers is marked PAID, the next one is marked partly paid (partialPaymentReceived).
// To keep every balance and cash figure exact, the sales carry the money they absorbed and the collection record
// keeps only what no sale could absorb (`totalValue` = leftover / advance). The amount the person actually handed
// over stays on the collection as `collectedAmount`, and what it did is listed in `allocations`.
// Each sale remembers the collections that touched it in `collectionAllocs` so a delete or edit can undo it.

export function collectionCollected(rec) {
  if (!rec) return 0;
  return rec.collectedAmount != null ? _n(rec.collectedAmount) : _n(rec.totalValue);
}

// Oldest first; opening balances (old debt) before everything else.
export function sortForCollection(list) {
  const day = (s) => String(s.supplyDate || s.date || '');
  return list.slice().sort((a, b) => {
    const ao = a.transactionType === 'OLD_DEBT' ? 0 : 1, bo = b.transactionType === 'OLD_DEBT' ? 0 : 1;
    if (ao !== bo) return ao - bo;
    if (day(a) !== day(b)) return day(a) < day(b) ? -1 : 1;
    return _n(a.timestamp) - _n(b.timestamp);
  });
}

// dues: [{ id, due }] already in payment order. Returns what to apply to each and what is left over.
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
  // The sale's own dates are never touched: it keeps the date it was made on (no creditReceivedDate is set).
  // An opening balance (old debt) is shown as debit = total, credit = partialPaymentReceived, so when it becomes
  // PAID its received amount must reach the full total or statements would still show a balance.
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

// Money a sale took in through collections but could not show as PAID yet. The cash tracker counts it.
export function collectionPartialCash(sale) {
  if (!sale || sale.creditReceived || !Array.isArray(sale.collectionAllocs)) return 0;
  return _r2(sale.collectionAllocs.reduce((t, a) => t + (a && !a.full ? _n(a.amount) : 0), 0));
}

// Undo is last-in-first-out per sale: a newer collection may sit on top of this one.
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

// Recover side: can this collection's effect be put back on the sales it settled?
export function getCollectionReapplyIssue(collection, sales) {
  const list = Array.isArray(collection && collection.allocations) ? collection.allocations : [];
  for (const a of list) {
    const sale = (sales || []).find(s => s && !s.deletedAt && s.id === a.saleId);
    if (!sale) return 'A sale this collection paid is no longer in your records. Recover that sale first, then recover the collection.';
    if (sale.creditReceived) return 'A sale this collection paid has since been settled another way, so the collection cannot be recovered.';
  }
  return null;
}
