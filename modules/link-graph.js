// Pure link-graph helpers. NO imports on purpose: everything here works on plain arrays/objects so it
// can be unit-tested in node and reused by the store-aware wrappers in link-guards.js.
//
// Record links in this app:
//   customer_sales / rep_sales : relatedSaleId  (partial payment -> parent credit sale)
//   rep_sales                  : usedInCalcId   (rep sale consumed by a calculator record)
//   noman_history              : linkedSalesIds[], linkedRepSalesIds[], transferSaleId, returnEntryId, returnLogId
//   payment_transactions       : expenseId      (payment -> expense record)
// Recovering a record from the recycle bin gives it a NEW id (so cloud tombstones on other devices
// cannot re-delete it). Every field above therefore has to be re-pointed at the new id.

export const GROUP_FIELD = '_deletionGroup';

export const REF_FIELDS = {
  customer_sales:       { scalar: ['relatedSaleId'], array: [] },
  rep_sales:            { scalar: ['relatedSaleId', 'usedInCalcId'], array: [] },
  noman_history:        { scalar: ['transferSaleId', 'returnEntryId', 'returnLogId'], array: ['linkedSalesIds', 'linkedRepSalesIds'] },
  payment_transactions: { scalar: ['expenseId'], array: [] },
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
  const gid = tomb && tomb.snapshot && tomb.snapshot[GROUP_FIELD];
  if (!gid) return [tomb];
  const members = allTombstones.filter(t => t && t.snapshot && t.snapshot[GROUP_FIELD] === gid);
  return members.length ? members : [tomb];
}
