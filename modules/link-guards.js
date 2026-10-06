import { sqliteStore, ensureArray, getTimestamp, ensureRecordIntegrity } from './business.js';
import { unifiedSave, unifiedDelete } from './sync.js';
import {
  COLLECTION_TO_KEY, REF_FIELDS, resolveId, remapReferences, resolveOwnLinks,
  planChildDetach, planChildReattach, applyPatch, getEditLinkIssue,
 fix/link-aware-save-delete-restore
  planGroupRecovery, applyEntityRename, factoryEntryMaterialUsage, findUsageItem,

  planExpenseCascade, newGroupId, stampGroup,
 main
} from './link-graph.js';

// Calculator history entries (noman_history) link to other records through these real fields:
//   linkedSalesIds     -> customer_sales settled by the calculator
//   linkedRepSalesIds  -> rep_sales consumed by the calculator (rep_sales.usedInCalcId points back)
//   transferSaleId     -> customer_sales allocation created by a rep-to-rep transfer
//   returnEntryId      -> mfg_pro_pkr stock-return record created by a product return
//   returnLogId        -> stock_returns log record created by a product return
// Partial payments point at their parent sale through relatedSaleId.

async function _calcHistory() {
  return ensureArray(await sqliteStore.get('noman_history')).filter(h => h && !h.deletedAt);
}

function _calcLabel(h) {
  return `${h.seller || 'a seller'}'s calculator record of ${h.date || 'unknown date'}`;
}

export async function findCalcLinkForSale(saleId) {
  if (!saleId) return null;
  const hist = await _calcHistory();
  const settled = hist.find(h => Array.isArray(h.linkedSalesIds) && h.linkedSalesIds.includes(saleId));
  if (settled) return { entry: settled, via: 'settled' };
  const transfer = hist.find(h => h.transferSaleId === saleId);
  if (transfer) return { entry: transfer, via: 'transfer' };
  return null;
}

export async function findCalcLinkForRepSale(repSaleId) {
  if (!repSaleId) return null;
  const hist = await _calcHistory();
  const entry = hist.find(h => Array.isArray(h.linkedRepSalesIds) && h.linkedRepSalesIds.includes(repSaleId));
  return entry ? { entry, via: 'rep' } : null;
}

export async function findCalcLinkForReturn(rec) {
  if (!rec || rec.isReturn !== true) return null;
  const hist = await _calcHistory();
  const byId = hist.find(h => h.returnEntryId === rec.id);
  if (byId) return { entry: byId, via: 'return' };
  const legacy = hist.find(h => !h.returnEntryId && h.returnStore && h.returnStore === rec.store &&
    Number(h.returned) === Number(rec.net) && h.date === rec.date && (!rec.returnedBy || rec.returnedBy === h.seller));
  return legacy ? { entry: legacy, via: 'return' } : null;
}

// kind: 'customer' (customer_sales) or 'rep' (rep_sales)
// opts.forEdit      -> only calculator links block (children do not)
// opts.ignoreChildren -> used when a whole customer is being removed together with its payments
export async function getSaleBlockReason(id, kind = 'customer', opts = {}) {
  const key = kind === 'rep' ? 'rep_sales' : 'customer_sales';
  const all = ensureArray(await sqliteStore.get(key));
  const rec = all.find(s => s && s.id === id);
  if (!rec) return null;
  const link = kind === 'rep' ? await findCalcLinkForRepSale(id) : await findCalcLinkForSale(id);
  if (link) {
    if (link.via === 'transfer') {
      return `This is a stock transfer from ${link.entry.seller} created by ${_calcLabel(link.entry)}. Delete that calculator record to remove it.`;
    }
    return `This record is already settled in ${_calcLabel(link.entry)}. Delete that calculator record first.`;
  }
  if (!opts.forEdit && !opts.ignoreChildren) {
    const children = all.filter(s => s && s.id !== id && s.relatedSaleId === id);
    if (children.length > 0) {
      return `This sale has ${children.length} linked payment record${children.length !== 1 ? 's' : ''}. Delete the payment record${children.length !== 1 ? 's' : ''} first.`;
    }
  }
  return null;
}

export async function getTransferDeleteBlockReason(entry) {
  if (!entry || !entry.transferSaleId) return null;
  const sales = ensureArray(await sqliteStore.get('customer_sales'));
  const sale = sales.find(s => s && s.id === entry.transferSaleId);
  if (!sale) return null;
  const hist = await _calcHistory();
  const settledIn = hist.find(h => h.id !== entry.id && Array.isArray(h.linkedSalesIds) && h.linkedSalesIds.includes(sale.id));
  if (settledIn) return `The transferred stock was already settled in ${_calcLabel(settledIn)}. Delete that record first.`;
  const children = sales.filter(s => s && s.id !== sale.id && s.relatedSaleId === sale.id);
  if (children.length > 0 || sale.creditReceived || (sale.partialPaymentReceived || 0) > 0) {
    return `${entry.returnRep || 'The receiving rep'} already has payments recorded against this transfer. Remove those payment records first.`;
  }
  return null;
}

export async function getExpiredDeleteBlockReason(entry) {
  if (!entry || !(entry.expired > 0) || entry.expiredApplied === false) return null;
  const inv = ensureArray(await sqliteStore.get('factory_inventory_data'));
  const chora = inv.find(m => m && m.name && m.name.toUpperCase() === 'CHORA');
  if (!chora) return null;
  if ((chora.quantity || 0) + 0.0001 < entry.expired) {
    return `Only ${chora.quantity || 0} kg of CHORA is left, but this record added ${entry.expired} kg. Part of it has already been used, so it cannot be removed.`;
  }
  return null;
}

// Records whose creation had side effects (stock, CHORA, settled sales) cannot be brought back from the
// recycle bin on their own, because deleting the calculator record already reversed those side effects.
export function getRecoverBlockReason(collectionName, snapshot) {
  const s = snapshot || {};
  if (collectionName === 'calculator_history') {
    return 'Calculator records cannot be recovered: deleting one already reversed its settled sales, returns, transfers and expired stock. Please enter the calculation again.';
  }
  if (collectionName === 'sales' && (s.isRepTransfer || (s.isTransfer && s.transferFrom))) {
    return 'This is a rep stock transfer created by a calculator record. Recover is not allowed; enter the calculation again.';
  }
  if (collectionName === 'production' && s.isReturn === true && s.returnedBy) {
    return 'This stock return was created by a calculator record. Recover is not allowed; enter the calculation again.';
  }
  if (collectionName === 'returns' && s.seller) {
    return 'This return log was created by a calculator record. Recover is not allowed; enter the calculation again.';
  }
  return null;
}

// Sales still allocated to a rep (unsettled credit) – the rep should not be removed while these exist.
export async function getPendingAllocationCount(repName) {
  const sales = ensureArray(await sqliteStore.get('customer_sales'));
  const hist = await _calcHistory();
  const settled = new Set();
  hist.forEach(h => { if (Array.isArray(h.linkedSalesIds)) h.linkedSalesIds.forEach(i => settled.add(i)); });
  return sales.filter(s => s && !s.deletedAt && s.customerName === repName && s.currentRepProfile === 'admin' &&
    s.paymentType === 'CREDIT' && !s.creditReceived && s.transactionType !== 'OLD_DEBT' && !settled.has(s.id)).length;
}


// ---------------------------------------------------------------------------------------------------
// Smart link handling shared by every save / delete / recover path
// ---------------------------------------------------------------------------------------------------

const _ID_MAP_KEY = 'recovered_id_map';

async function _loadIdMap() {
  const m = await sqliteStore.get(_ID_MAP_KEY, {});
  return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
}

// DELETE: a partial payment is being deleted -> take its amount back off the parent credit sale and
// persist the parent on its own (so the cloud and other devices see the parent change too).
// kind: 'customer' | 'rep'.  `all` is the in-memory array the caller already loaded.
export async function detachChildPayment(kind, child, all) {
  if (!child || child.paymentType !== 'PARTIAL_PAYMENT' || !child.relatedSaleId) return null;
  const key = kind === 'rep' ? 'rep_sales' : 'customer_sales';
  const arr = Array.isArray(all) ? all : ensureArray(await sqliteStore.get(key));
  const parent = arr.find(s => s && s.id === child.relatedSaleId);
  if (!parent) return null;
  const patch = planChildDetach(parent, child);
  if (!patch) return null;
  applyPatch(parent, patch);
  parent.updatedAt = getTimestamp();
  ensureRecordIntegrity(parent, true);
  await unifiedSave(key, arr, parent);
  return parent;
}

// SAVE (edit): refuse edits that would leave payment records out of step with the sale.
export async function getSaleEditLinkIssue(kind, original, next) {
  if (!original || !original.id) return null;
  const key = kind === 'rep' ? 'rep_sales' : 'customer_sales';
  const all = ensureArray(await sqliteStore.get(key));
  const children = all.filter(s => s && s.id !== original.id && s.relatedSaleId === original.id);
  return getEditLinkIssue(original, next, children);
}

// RECOVER (check): what is live right now, as the plain arrays planGroupRecovery works on.
async function _liveForRecovery() {
  const get = async (k) => ensureArray(await sqliteStore.get(k)).filter(r => r && !r.deletedAt);
  return {
    customer_sales: await get('customer_sales'),
    rep_sales: await get('rep_sales'),
    payment_entities: await get('payment_entities'),
    expenses: await get('expenses'),
    factory_inventory_data: await get('factory_inventory_data'),
  };
}

// RECOVER (check): can this ONE tombstone be brought back without corrupting a link?
export async function getRecoverLinkBlockReason(collectionName, snapshot) {
  if (!snapshot) return null;
  const { block } = planGroupRecovery([{ id: snapshot.id, recordId: snapshot.id, collection: collectionName, snapshot }], await _liveForRecovery(), await _loadIdMap());
  return block || await getFactoryRecoverBlockReason(collectionName, snapshot);
}

// RECOVER (check): can this WHOLE set of tombstones come back? Run before anything is written so a
// block never leaves a half-restored group behind.
// Returns { block: string|null, skipReattach: Set<tombstoneId> }
export async function planRecoverySet(members) {
  const plan = planGroupRecovery(members, await _liveForRecovery(), await _loadIdMap());
  if (plan.block) return plan;
  for (const m of members) {
    const b = await getFactoryRecoverBlockReason(m.collection || m.recordType, m.snapshot);
    if (b) return { block: b, skipReattach: plan.skipReattach };
  }
  return plan;
}

// RECOVER (apply): the record came back under newId. Keep every link alive:
//  1. remember oldId -> newId so siblings recovered later can find it
//  2. re-point live records that still reference oldId (payments, calculator entries, rep sales ...)
//  3. re-point the recovered record's own outgoing links (its parent may have been recovered earlier)
//  4. a recovered partial payment is added back to its parent sale, unless the parent came back in the
//     same recovery (opts.skipReattach): then the parent's snapshot already contains that amount
// Returns the (possibly adjusted) record to store.
export async function applyRecoveryLinks(collectionName, oldId, newId, cleanRecord, opts = {}) {
  const idMap = await _loadIdMap();
  idMap[String(oldId)] = String(newId);
  await sqliteStore.set(_ID_MAP_KEY, idMap);

  if (cleanRecord) resolveOwnLinks(collectionName, cleanRecord, idMap);

  const keys = Object.keys(REF_FIELDS);
  const stores = {};
  for (const k of keys) stores[k] = ensureArray(await sqliteStore.get(k));
  const changed = remapReferences(stores, oldId, newId);
  for (const k of Object.keys(changed)) {
    const now = getTimestamp();
    changed[k].forEach(r => { r.updatedAt = now; });
    await unifiedSave(k, stores[k], null, changed[k].map(r => r.id));
  }

  if (!opts.skipReattach && cleanRecord && (collectionName === 'sales' || collectionName === 'rep_sales') &&
      cleanRecord.paymentType === 'PARTIAL_PAYMENT' && cleanRecord.relatedSaleId) {
    const key = COLLECTION_TO_KEY[collectionName];
    const arr = ensureArray(await sqliteStore.get(key));
    const parent = arr.find(s => s && s.id === cleanRecord.relatedSaleId);
    const { patch } = planChildReattach(parent, cleanRecord);
    if (parent && patch) {
      applyPatch(parent, patch);
      parent.updatedAt = getTimestamp();
      ensureRecordIntegrity(parent, true);
      await unifiedSave(key, arr, parent);
    }
  }
  return cleanRecord;
}

const _SUPPLIER_FIELDS = ['supplierId', 'supplierName', 'supplierContact', 'supplierType', 'totalPayable', 'paidDate'];

// RECOVER (pre-upload): re-point the snapshot's own links at records that were recovered earlier, and
// drop links whose target no longer exists anywhere (never leave a dangling id in a stored record).
export async function resolveSnapshotLinks(collectionName, cleanRecord) {
  if (!cleanRecord) return cleanRecord;
  resolveOwnLinks(collectionName, cleanRecord, await _loadIdMap());
  if ((collectionName === 'transactions' || collectionName === 'payment_transactions') && cleanRecord.expenseId) {
    const exp = ensureArray(await sqliteStore.get('expenses')).find(e => e && !e.deletedAt && String(e.id) === String(cleanRecord.expenseId));
    if (!exp) delete cleanRecord.expenseId;
  }
  if (collectionName === 'inventory' && cleanRecord.supplierId) {
    const ent = ensureArray(await sqliteStore.get('payment_entities')).find(e => e && !e.deletedAt && String(e.id) === String(cleanRecord.supplierId));
    if (!ent) {
      _SUPPLIER_FIELDS.forEach(f => { delete cleanRecord[f]; });
      cleanRecord.paymentStatus = 'pending';
    } else if (ent.name && cleanRecord.supplierName !== ent.name) {
      cleanRecord.supplierName = ent.name;
    }
  }
  return cleanRecord;
}

// ---------------------------------------------------------------------------------------------------
// Factory batches: deleting one hands its raw materials back to inventory, so bringing one back has to
// take them out again (and must not go through when the stock is no longer there).
// ---------------------------------------------------------------------------------------------------

async function _factoryUsage(entry) {
  const formulas = (await sqliteStore.get('factory_default_formulas')) || {};
  let key = entry.formulaType || entry.store;
  if (!entry.formulaType && typeof window !== 'undefined' && typeof window.getStoreFormulaType === 'function') {
    try { key = (await window.getStoreFormulaType(entry.store)) || key; } catch (_) {}
  }
  return factoryEntryMaterialUsage(entry, formulas, key);
}

export async function getFactoryRecoverBlockReason(collectionName, snapshot) {
  if (collectionName !== 'factory_history' || !snapshot || snapshot.isMerged) return null;
  const inv = ensureArray(await sqliteStore.get('factory_inventory_data'));
  for (const u of await _factoryUsage(snapshot)) {
    const item = findUsageItem(inv, u);
    if (item && (item.quantity || 0) + 1e-6 < u.quantity) {
      return `Not enough ${item.name || u.name || 'raw material'} in stock to bring this batch back: it used ${u.quantity} kg and only ${item.quantity || 0} kg is left. Add stock first, then recover.`;
    }
  }
  return null;
}

export async function applyFactoryRecovery(collectionName, cleanRecord) {
  if (collectionName !== 'factory_history' || !cleanRecord || cleanRecord.isMerged) return [];
  const inv = ensureArray(await sqliteStore.get('factory_inventory_data'));
  const touched = [];
  for (const u of await _factoryUsage(cleanRecord)) {
    const item = findUsageItem(inv, u);
    if (!item) continue;
    item.quantity = Math.max(0, parseFloat(((item.quantity || 0) - u.quantity).toFixed(6)));
    item.totalValue = item.quantity * (item.cost || 0);
    if (item.conversionFactor && item.conversionFactor !== 1) item.purchaseQuantity = item.quantity / item.conversionFactor;
    item.updatedAt = getTimestamp();
    ensureRecordIntegrity(item, true);
    touched.push(item);
  }
  if (touched.length) await unifiedSave('factory_inventory_data', inv, null, touched.map(i => i.id));
  return touched;
}

// ---------------------------------------------------------------------------------------------------
// SAVE: rename an entity -> every stored copy of its name follows
// ---------------------------------------------------------------------------------------------------

export async function cascadeEntityRename(entity, oldName, newName) {
  if (!entity || !oldName || oldName === newName) return {};
  const stores = {
    payment_transactions: ensureArray(await sqliteStore.get('payment_transactions')),
    factory_inventory_data: ensureArray(await sqliteStore.get('factory_inventory_data')),
    expenses: ensureArray(await sqliteStore.get('expenses')),
  };
  const changed = applyEntityRename(stores, entity, oldName, newName);
  const now = getTimestamp();
  for (const k of Object.keys(changed)) {
    changed[k].forEach(r => { r.updatedAt = now; ensureRecordIntegrity(r, true); });
    await unifiedSave(k, stores[k], null, changed[k].map(r => r.id));
  }
  return changed;
}

// ---------------------------------------------------------------------------------------------------
// SAVE: multi-record saves put back what they touched when a later step fails
// ---------------------------------------------------------------------------------------------------

export function createRollback() {
  const saved = new Map();
  return {
    // call BEFORE mutating a record that already exists
    remember(storeKey, rec) {
      if (!rec || !rec.id) return;
      const k = storeKey + '::' + rec.id;
      if (!saved.has(k)) saved.set(k, { storeKey, id: rec.id, copy: JSON.parse(JSON.stringify(rec)) });
    },
    get size() { return saved.size; },
    // put every remembered record back and persist it (so the cloud copy is corrected too)
    async undo() {
      const byStore = new Map();
      for (const e of saved.values()) { if (!byStore.has(e.storeKey)) byStore.set(e.storeKey, []); byStore.get(e.storeKey).push(e); }
      for (const [storeKey, entries] of byStore) {
        try {
          const arr = ensureArray(await sqliteStore.get(storeKey));
          const restored = [];
          for (const e of entries) {
            const rec = arr.find(r => r && r.id === e.id);
            if (!rec || JSON.stringify(rec) === JSON.stringify(e.copy)) continue;
            Object.keys(rec).forEach(f => { delete rec[f]; });
            Object.assign(rec, e.copy);
            restored.push(e.id);
          }
          if (restored.length) await unifiedSave(storeKey, arr, null, restored);
        } catch (err) { console.warn('[rollback] could not restore', storeKey, err); }
      }
      saved.clear();
    },
  };
}


// ---------------------------------------------------------------------------------------------------
// Payment <-> expense record: one shared delete path
// ---------------------------------------------------------------------------------------------------

async function _dropExpensePhoto(expenseId) {
  if (!expenseId) return;
  try {
    const key = 'expense:' + expenseId;
    const photos = (await sqliteStore.get('person_photos')) || {};
    if (photos[key] === undefined) return;
    delete photos[key];
    await sqliteStore.set('person_photos', photos);
    const ts = (await sqliteStore.get('person_photos_timestamps')) || {};
    delete ts[key];
    await sqliteStore.set('person_photos_timestamps', ts);
    const dk = (await sqliteStore.get('person_photos_dirty_keys')) || [];
    if (!dk.includes(key)) dk.push(key);
    await sqliteStore.set('person_photos_dirty_keys', dk);
  } catch (e) { console.warn('[deletePaymentTxWithLinks] photo cleanup failed', e); }
}

// DELETE: remove one payment transaction together with the expense record that was created with it
// (unless another payment still uses that expense). Both tombstones carry the same deletion group, so
// recovering either one from the recycle bin brings back both, with the link re-pointed at the new ids.
// opts.groupId     reuse a group created by the caller (entity delete, bulk expense delete ...)
// opts.excludeIds  other payments deleted in the same operation (they do not keep the expense alive)
// Returns { tx, expense } (expense is null when nothing else was removed).
export async function deletePaymentTxWithLinks(tx, opts = {}) {
  if (!tx || !tx.id) return { tx: null, expense: null };
  const allTxs = ensureArray(await sqliteStore.get('payment_transactions'));
  const expenses = ensureArray(await sqliteStore.get('expenses'));
  const expense = planExpenseCascade(tx, allTxs, expenses, opts.excludeIds);
  const groupId = opts.groupId || (expense ? newGroupId('pay') : null);
  const remaining = allTxs.filter(t => t && String(t.id) !== String(tx.id));
  await unifiedDelete('payment_transactions', remaining, tx.id, { strict: true }, groupId ? stampGroup(tx, groupId) : tx);
  if (expense) {
    const remainingExp = expenses.filter(e => e && String(e.id) !== String(expense.id));
    await unifiedDelete('expenses', remainingExp, expense.id, { strict: true }, stampGroup(expense, groupId));
  }
  await _dropExpensePhoto(tx.expenseId);
  return { tx, expense };
}
