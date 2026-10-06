import { sqliteStore, ensureArray, getTimestamp, ensureRecordIntegrity } from './business.js';
import { unifiedSave } from './sync.js';
import {
  COLLECTION_TO_KEY, REF_FIELDS, resolveId, remapReferences, resolveOwnLinks,
  planChildDetach, planChildReattach, applyPatch, getEditLinkIssue,
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

// RECOVER (check): can this tombstone be brought back without corrupting a link?
export async function getRecoverLinkBlockReason(collectionName, snapshot) {
  if (!snapshot) return null;
  if ((collectionName === 'sales' || collectionName === 'rep_sales') && snapshot.paymentType === 'PARTIAL_PAYMENT' && snapshot.relatedSaleId) {
    const key = COLLECTION_TO_KEY[collectionName];
    const idMap = await _loadIdMap();
    const parentId = resolveId(snapshot.relatedSaleId, idMap);
    const parent = ensureArray(await sqliteStore.get(key)).find(s => s && !s.deletedAt && s.id === parentId);
    const { block } = planChildReattach(parent, snapshot);
    return block || null;
  }
  if ((collectionName === 'transactions' || collectionName === 'payment_transactions') && snapshot.expenseId && !snapshot.isTransfer) {
    // The payment points at an expense record. Either it still exists, or it is being recovered with
    // this payment as part of the same deletion group (handled by the caller).
    return null;
  }
  return null;
}

// RECOVER (apply): the record came back under newId. Keep every link alive:
//  1. remember oldId -> newId so siblings recovered later can find it
//  2. re-point live records that still reference oldId (payments, calculator entries, rep sales ...)
//  3. re-point the recovered record's own outgoing links (its parent may have been recovered earlier)
//  4. a recovered partial payment is added back to its parent sale
// Returns the (possibly adjusted) record to store.
export async function applyRecoveryLinks(collectionName, oldId, newId, cleanRecord) {
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

  if (cleanRecord && (collectionName === 'sales' || collectionName === 'rep_sales') &&
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

// RECOVER (pre-upload): re-point the snapshot's own links at records that were recovered earlier.
export async function resolveSnapshotLinks(collectionName, cleanRecord) {
  if (!cleanRecord) return cleanRecord;
  return resolveOwnLinks(collectionName, cleanRecord, await _loadIdMap());
}
