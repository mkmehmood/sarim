// Pure link-graph helpers. NO imports on purpose: everything here works on plain arrays/objects so it
// can be unit-tested in node and reused by the store-aware wrappers in link-guards.js.
//
// Record links in this app:
//   customer_sales / rep_sales : relatedSaleId  (partial payment -> parent credit sale)
//   rep_sales                  : usedInCalcId   (rep sale consumed by a calculator record)
//   noman_history              : linkedSalesIds[], linkedRepSalesIds[], transferSaleId, returnEntryId, returnLogId
//   payment_transactions       : expenseId      (payment -> expense record)
//                                entityId / transferPeerEntityId (payment -> payment_entities)
//                                materialId / materialIds[]      (supplier payment -> factory_inventory_data)
//   factory_inventory_data     : supplierId     (material -> payment_entities)
// Recovering a record from the recycle bin gives it a NEW id (so cloud tombstones on other devices
// cannot re-delete it). Every field above therefore has to be re-pointed at the new id.

export const GROUP_FIELD = '_deletionGroup';
// Stamped on a deleted supplier entity: the materials that were unlinked from it, so recovery can re-link them.
export const LINKED_MATERIALS_FIELD = '_linkedMaterialIds';

export const REF_FIELDS = {
  customer_sales:       { scalar: ['relatedSaleId'], array: [] },
  rep_sales:            { scalar: ['relatedSaleId', 'usedInCalcId'], array: [] },
  noman_history:        { scalar: ['transferSaleId', 'returnEntryId', 'returnLogId'], array: ['linkedSalesIds', 'linkedRepSalesIds'] },
  payment_transactions: { scalar: ['expenseId', 'entityId', 'transferPeerEntityId', 'materialId'], array: ['materialIds'] },
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

// ---- deletion groups ---------------------------------------------------------------------------

// Stamp a snapshot so the recycle bin knows which tombstones were deleted together.
export function stampGroup(rec, groupId) {
  return rec && groupId ? { ...rec, [GROUP_FIELD]: groupId } : rec;
}

export function newGroupId(prefix = 'grp') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Order tombstones for restore: parents before children, expenses/customers before the rows that point at them.
// containers/owners first (customers, entities, expenses), then materials (they point at entities), then the rest.
const _COLLECTION_RANK = { sales_customers: 0, rep_customers: 0, expenses: 0, entities: 0, inventory: 1 };
const _DEFAULT_RANK = 2;
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
    .map(t => ({ t, rank: (_COLLECTION_RANK[t.collection || t.recordType] ?? _DEFAULT_RANK) * 100 + depth(t) }))
    .sort((a, b) => a.rank - b.rank)
    .map(x => x.t);
}

// All tombstones that belong to the same deletion as `tomb` (including itself).
export function findGroupMembers(tomb, allTombstones) {
  const gid = tomb && tomb.snapshot && tomb.snapshot[GROUP_FIELD];
  if (!gid) return [tomb];
  const members = allTombstones.filter(t => t && t.snapshot && t.snapshot[GROUP_FIELD] === gid);
  return members.length ? members : [tomb];
}

// ---- everything that must be recovered together ---------------------------------------------------

const _isTxCol = (c) => c === 'transactions' || c === 'payment_transactions';
const _tombId = (t) => String(t.recordId || t.id);

// Superset of findGroupMembers. Besides records stamped with the same deletion group it follows the
// links themselves, so tombstones created before groups existed still come back as a unit:
//   * both sides of a payment transfer (same transferPairId)
//   * an expense and the payment transaction that points at it (expenseId)
export function findRecoveryClosure(tomb, allTombstones) {
  if (!tomb) return [];
  const list = (allTombstones || []).filter(Boolean);
  const out = new Map([[_tombId(tomb), tomb]]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const m of Array.from(out.values())) {
      const s = m.snapshot || {};
      const gid = s[GROUP_FIELD];
      const mcol = m.collection || m.recordType;
      for (const t of list) {
        if (out.has(_tombId(t))) continue;
        const ts = t.snapshot || {};
        const tcol = t.collection || t.recordType;
        const linked =
          (gid && ts[GROUP_FIELD] === gid) ||
          (s.transferPairId && ts.transferPairId === s.transferPairId) ||
          (mcol === 'expenses' && _isTxCol(tcol) && ts.expenseId && String(ts.expenseId) === _tombId(m)) ||
          (_isTxCol(mcol) && tcol === 'expenses' && s.expenseId && String(s.expenseId) === _tombId(t));
        if (linked) { out.set(_tombId(t), t); grew = true; }
      }
    }
  }
  return Array.from(out.values());
}

// Pre-flight for a whole recovery. Walks the members in restore order against what is live right now
// plus what the earlier members will have brought back, and reports the FIRST thing that would leave
// a dangling link. Nothing is written, so a block leaves every record exactly as it was.
//   live: { customer_sales, rep_sales, payment_entities, expenses, factory_inventory_data } (arrays)
// Returns { block: string|null, skipReattach: Set<tombstoneId> }
//   skipReattach = partial payments whose parent credit sale is recovered in the same go; the parent's
//   snapshot already contains their amount, so it must not be added a second time.
export function planGroupRecovery(members, live, idMap = {}) {
  const L = live || {};
  const ids = (arr) => new Set((Array.isArray(arr) ? arr : []).filter(r => r && !r.deletedAt).map(r => String(r.id)));
  const liveIds = {
    sales: ids(L.customer_sales), rep_sales: ids(L.rep_sales), entities: ids(L.payment_entities),
    expenses: ids(L.expenses), inventory: ids(L.factory_inventory_data),
  };
  const liveParents = {
    sales: new Map((L.customer_sales || []).filter(Boolean).map(r => [String(r.id), r])),
    rep_sales: new Map((L.rep_sales || []).filter(Boolean).map(r => [String(r.id), r])),
  };
  const coming = { sales: new Set(), rep_sales: new Set(), entities: new Set(), expenses: new Set(), inventory: new Set() };
  const virtualPaid = new Map();
  const skipReattach = new Set();
  const has = (col, id) => {
    if (!id) return false;
    const resolved = String(resolveId(id, idMap));
    return liveIds[col].has(String(id)) || liveIds[col].has(resolved) || coming[col].has(String(id)) || coming[col].has(resolved);
  };

  for (const m of orderForRestore(members || [])) {
    const col = m.collection || m.recordType;
    const s = m.snapshot || {};

    if ((col === 'sales' || col === 'rep_sales') && s.paymentType === 'PARTIAL_PAYMENT' && s.relatedSaleId) {
      const parentKey = String(s.relatedSaleId);
      if (coming[col].has(parentKey)) {
        skipReattach.add(_tombId(m));
      } else {
        const resolved = String(resolveId(parentKey, idMap));
        const parent = liveParents[col].get(resolved) || liveParents[col].get(parentKey);
        const base = parent ? { ...parent, partialPaymentReceived: virtualPaid.has(resolved) ? virtualPaid.get(resolved) : parent.partialPaymentReceived } : null;
        const { patch, block } = planChildReattach(base, s);
        if (block) return { block, skipReattach };
        if (patch && parent) virtualPaid.set(resolved, patch.partialPaymentReceived);
      }
    }

    if (_isTxCol(col)) {
      if (s.entityId && !has('entities', s.entityId)) {
        return { block: `The ${s.entityName ? `"${s.entityName}"` : 'entity'} this payment belongs to is in the recycle bin or no longer exists. Recover that entity first, then recover the payment.`, skipReattach };
      }
      if (s.isTransfer === true && s.transferPeerEntityId && !has('entities', s.transferPeerEntityId)) {
        return { block: `The ${s.transferPeerEntityName ? `"${s.transferPeerEntityName}"` : 'other entity'} on the other side of this transfer is in the recycle bin or no longer exists. Recover that entity first.`, skipReattach };
      }
    }

    const key = col === 'entities' ? 'entities' : col === 'expenses' ? 'expenses' : col === 'inventory' ? 'inventory' : col;
    if (coming[key]) coming[key].add(_tombId(m));
  }
  return { block: null, skipReattach };
}

// ---- deleting payments: what has to go with them ---------------------------------------------------

// A payment and its expense record are one logical entry (the expense row is what the Expense manager
// lists, the payment row is what moves cash and entity balances). Deleting either side takes the
// other, together with both sides of a transfer. Pure: returns what to delete, mutates nothing.
export function collectPaymentDeletionSet(rootTxs, transactions, expenses) {
  const txs = new Map();
  const exps = new Map();
  const allTx = Array.isArray(transactions) ? transactions : [];
  const allExp = Array.isArray(expenses) ? expenses : [];
  const addTx = (t) => { if (t && t.id && !txs.has(String(t.id))) { txs.set(String(t.id), t); return true; } return false; };
  const queue = (Array.isArray(rootTxs) ? rootTxs : [rootTxs]).filter(Boolean);
  queue.forEach(addTx);
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];
    if (t.isTransfer === true && t.transferPairId) {
      allTx.filter(x => x && x.transferPairId === t.transferPairId).forEach(x => { if (addTx(x)) queue.push(x); });
    }
    if (t.expenseId) {
      const e = allExp.find(x => x && String(x.id) === String(t.expenseId));
      if (e) exps.set(String(e.id), e);
      allTx.filter(x => x && x.id !== t.id && String(x.expenseId || '') === String(t.expenseId)).forEach(x => { if (addTx(x)) queue.push(x); });
    }
  }
  return { txs: Array.from(txs.values()), expenses: Array.from(exps.values()) };
}

// ---- saving: renames must reach every copy of the name -------------------------------------------

// Entity names are copied onto payments, transfer peers, supplier materials and (for expense-only
// entities) the expense records themselves. Mutates in place; returns { storeKey: [changed...] }
// so the caller persists only what changed.
export function applyEntityRename(stores, entity, oldName, newName) {
  const changed = {};
  if (!entity || !entity.id || oldName === newName) return changed;
  const id = String(entity.id);
  const mark = (key, rec) => { (changed[key] = changed[key] || []); if (!changed[key].includes(rec)) changed[key].push(rec); };
  for (const t of stores.payment_transactions || []) {
    if (!t) continue;
    if (String(t.entityId) === id && t.entityName !== newName) { t.entityName = newName; mark('payment_transactions', t); }
    if (t.transferPeerEntityId != null && String(t.transferPeerEntityId) === id && t.transferPeerEntityName !== newName) { t.transferPeerEntityName = newName; mark('payment_transactions', t); }
  }
  for (const m of stores.factory_inventory_data || []) {
    if (m && m.supplierId != null && String(m.supplierId) === id && m.supplierName !== newName) { m.supplierName = newName; mark('factory_inventory_data', m); }
  }
  if (entity.isExpenseEntity === true && oldName) {
    const lo = String(oldName).toLowerCase();
    for (const e of stores.expenses || []) {
      if (e && e.category === 'operating' && String(e.name || '').toLowerCase() === lo && e.name !== newName) { e.name = newName; mark('expenses', e); }
    }
  }
  return changed;
}

// ---- deleting a material: which supplier payments belong to it alone ------------------------------

export function materialIdsOfTx(t) {
  const ids = new Set();
  if (t && t.materialId) ids.add(String(t.materialId));
  if (t && Array.isArray(t.materialIds)) t.materialIds.forEach(i => { if (i) ids.add(String(i)); });
  return ids;
}

// Payments that exist only because of this one material (credit purchase of it, or a payment that
// settled nothing else). Payments that also settled other materials stay; the supplier is recomputed.
export function paymentsExclusiveToMaterial(material, transactions) {
  if (!material || !material.id || !material.supplierId) return [];
  const mid = String(material.id);
  return (Array.isArray(transactions) ? transactions : []).filter(t => {
    if (!t || t.isPayable !== true || String(t.entityId) !== String(material.supplierId)) return false;
    const ids = materialIdsOfTx(t);
    return ids.size === 1 && ids.has(mid);
  });
}

// ---- factory batches: the raw materials a batch consumed -----------------------------------------

// What deleting a batch hands back to inventory and what recovering it must take out again.
// Prefers the exact materials recorded on the batch; older batches fall back to the formula x units.
export function factoryEntryMaterialUsage(entry, formulas, formulaKey) {
  if (!entry) return [];
  if (Array.isArray(entry.materialsUsed) && entry.materialsUsed.length > 0) {
    return entry.materialsUsed.map(m => ({ id: m.id, name: m.name, quantity: Number(m.quantity) || 0 }));
  }
  const f = formulas || {};
  const list = f[formulaKey] || f[entry.formulaType] || f[entry.store] || [];
  return list.map(x => ({ id: x.id, name: x.name, quantity: (Number(x.quantity) || 0) * (Number(entry.units) || 0) }));
}

export function findUsageItem(inventory, usage) {
  const inv = Array.isArray(inventory) ? inventory : [];
  let item = usage.id != null ? inv.find(i => i && String(i.id) === String(usage.id)) : null;
  if (!item && usage.name) item = inv.find(i => i && i.name && i.name.trim().toLowerCase() === String(usage.name).trim().toLowerCase());
  return item || null;
}
