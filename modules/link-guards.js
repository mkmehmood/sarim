import { sqliteStore, ensureArray, getTimestamp, ensureRecordIntegrity, debtDelta, debtNeedsGross } from './business.js';
import { unifiedSave, unifiedDelete } from './sync.js';
import {
  COLLECTION_TO_KEY, REF_FIELDS, resolveId, remapReferences, resolveOwnLinks,
  planChildDetach, planChildReattach, applyPatch, getEditLinkIssue,
  planExpenseCascade, newGroupId, stampGroup,
  findPartialConflicts, planCalcRestore, isSettleableSale, getPartialPaidIssue, remapMaterialRefs, planMaterialDeduction, getStockOverdrawIssue, getUnitsShortIssue, DELETE_ORIGIN_FIELD,
  recordRename, resolveRename, getOldDebtEditIssue, sumChildPayments,
  planCollectionAllocation, applyCollectionAlloc, revertCollectionAlloc, getCollectionRevertIssue, getCollectionReapplyIssue, sortForCollection,
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
  if (!opts.ignoreChildren && Array.isArray(rec.collectionAllocs) && rec.collectionAllocs.length) {
    return 'This sale was paid through a bulk/partial collection. Delete or edit that collection first.';
  }
  if (!opts.ignoreChildren && rec.paymentType === 'COLLECTION') {
    const stacked = getCollectionRevertIssue(rec, all);
    if (stacked) return stacked;
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
  // Calculator records CAN be recovered: getCalcRestoreBlockReason checks that every record they touched is
  // still as the delete left it, and the recover re-applies all of their effects together.
  if (collectionName === 'sales' && (s.isRepTransfer || (s.isTransfer && s.transferFrom))) {
    return 'This is a rep stock transfer created by a calculator record. Recover is not allowed; enter the calculation again.';
  }
  // A return deleted straight from the Production tab (orphan, no calculator record) can come back as a pair.
  const _fromProdTab = s[DELETE_ORIGIN_FIELD] === 'prod-tab';
  if (collectionName === 'production' && s.isReturn === true && s.returnedBy && !_fromProdTab) {
    return 'This stock return was created by a calculator record. Recover is not allowed; enter the calculation again.';
  }
  if (collectionName === 'returns' && s.seller && !_fromProdTab) {
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
  if (child && child.paymentType === 'COLLECTION' && Array.isArray(child.allocations) && child.allocations.length) {
    return await revertCollectionToSales(kind, child, all);
  }
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
export async function getRecoverLinkBlockReason(collectionName, snapshot, ctx) {
  if (!snapshot) return null;
  if ((collectionName === 'sales' || collectionName === 'rep_sales') && snapshot.paymentType === 'PARTIAL_PAYMENT' && snapshot.relatedSaleId) {
    const key = COLLECTION_TO_KEY[collectionName];
    const idMap = await _loadIdMap();
    const parentId = resolveId(snapshot.relatedSaleId, idMap);
    const parent = ensureArray(await sqliteStore.get(key)).find(s => s && !s.deletedAt && s.id === parentId);
    const { block } = planChildReattach(parent, snapshot);
    return block || null;
  }
  if ((collectionName === 'sales' || collectionName === 'rep_sales') && snapshot.paymentType === 'COLLECTION' && Array.isArray(snapshot.allocations) && snapshot.allocations.length) {
    const key = COLLECTION_TO_KEY[collectionName];
    const idMap = await _loadIdMap();
    const live = ensureArray(await sqliteStore.get(key)).filter(r => r && !r.deletedAt);
    const mapped = { ...snapshot, allocations: snapshot.allocations.map(a => ({ ...a, saleId: resolveId(a.saleId, idMap) })) };
    return getCollectionReapplyIssue(mapped, live);
  }
  if (collectionName === 'calculator_history') return await getCalcRestoreBlockReason(snapshot);
  // Stock consumers: a recovered sale or transfer-out must not overdraw that store on that day.
  if (collectionName === 'sales' && Number(snapshot.quantity) > 0 && snapshot.supplyStore &&
      !['COLLECTION', 'PARTIAL_PAYMENT'].includes(snapshot.paymentType) && snapshot.transactionType !== 'OLD_DEBT' &&
      typeof window !== 'undefined' && typeof window.computeStoreStockSnapshot === 'function') {
    const day = snapshot.supplyDate || snapshot.date;
    const snap = await window.computeStoreStockSnapshot(snapshot.supplyStore, day);
    const label = typeof window.getStoreLabel === 'function' ? (window.getStoreLabel(snapshot.supplyStore) || snapshot.supplyStore) : snapshot.supplyStore;
    // ctx = records recovered together in one go: earlier ones already use up part of the stock.
    const k = `${snapshot.supplyStore}|${day}`;
    const used = ctx && ctx.stockUsed ? (ctx.stockUsed.get(k) || 0) : 0;
    const issue = getStockOverdrawIssue(label, Number(snapshot.quantity) + used, snap.available);
    if (!issue && ctx && ctx.stockUsed) ctx.stockUsed.set(k, used + Number(snapshot.quantity));
    return issue;
  }
  if (collectionName === 'production' && snapshot.isTransfer === true && snapshot.transferDirection === 'out' &&
      typeof window !== 'undefined' && typeof window.computeStoreStockSnapshot === 'function') {
    const snap = await window.computeStoreStockSnapshot(snapshot.store, snapshot.date);
    const label = typeof window.getStoreLabel === 'function' ? (window.getStoreLabel(snapshot.store) || snapshot.store) : snapshot.store;
    const q = Math.abs(Number(snapshot.net) || 0);
    const k = `${snapshot.store}|${snapshot.date}`;
    const used = ctx && ctx.stockUsed ? (ctx.stockUsed.get(k) || 0) : 0;
    const issue = getStockOverdrawIssue(label, q + used, snap.available);
    if (!issue && ctx && ctx.stockUsed) ctx.stockUsed.set(k, used + q);
    return issue;
  }
  // Production entry: it uses up factory formula units again, so the factory must still have them.
  if (collectionName === 'production' && !snapshot.isReturn && !snapshot.isTransfer && !snapshot.isMerged && Number(snapshot.formulaUnits) > 0) {
    const ft = snapshot.formulaStore || 'standard';
    const tracking = (await sqliteStore.get('factory_unit_tracking')) || {};
    const used = ctx && ctx.unitsUsed ? (ctx.unitsUsed.get(ft) || 0) : 0;
    const issue = getUnitsShortIssue(snapshot.formulaName || ft, Number(snapshot.formulaUnits) + used, (tracking[ft] && tracking[ft].available) || 0);
    if (!issue && ctx && ctx.unitsUsed) ctx.unitsUsed.set(ft, used + Number(snapshot.formulaUnits));
    return issue;
  }
  // Raw material that was linked to a supplier: the supplier has to exist, or the link points at nothing.
  if (collectionName === 'inventory' && snapshot.supplierId) {
    const idMap = await _loadIdMap();
    const sid = resolveId(snapshot.supplierId, idMap);
    const ents = ensureArray(await sqliteStore.get('payment_entities'));
    if (!ents.some(e => e && !e.deletedAt && String(e.id) === String(sid))) {
      return `This material was linked to ${snapshot.supplierName || 'a supplier'} who is no longer in your payments. Recover that supplier first, then recover the material.`;
    }
  }
  // Factory batch: its raw materials have to come back OUT of inventory.
  if (collectionName === 'factory_history') {
    if (ctx && !ctx.inv) ctx.inv = JSON.parse(JSON.stringify(ensureArray(await sqliteStore.get('factory_inventory_data'))));
    const inv = ctx && ctx.inv ? ctx.inv : ensureArray(await sqliteStore.get('factory_inventory_data'));
    const formulas = (await sqliteStore.get('factory_default_formulas')) || {};
    const idMap = await _loadIdMap();
    const entry = { ...snapshot, materialsUsed: (snapshot.materialsUsed || []).map(m => ({ ...m, id: resolveId(m.id, idMap) })) };
    const { block, updates } = planMaterialDeduction(entry, inv, formulas, snapshot.formulaType || snapshot.store);
    if (block) return block;
    // Earlier batches in the same recovery already took their share of each material.
    if (ctx && updates) updates.forEach(u => { const it = inv.find(i => i && i.id === u.id); if (it) it.quantity = u.quantity; });
    return null;
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

  if (collectionName === 'inventory') {
    const hist = ensureArray(await sqliteStore.get('factory_production_history'));
    const formulas = (await sqliteStore.get('factory_default_formulas')) || {};
    const r = remapMaterialRefs(hist, formulas, oldId, newId);
    if (r.historyChanged.length) {
      const now = getTimestamp();
      r.historyChanged.forEach(h => { h.updatedAt = now; });
      await unifiedSave('factory_production_history', hist, null, r.historyChanged.map(h => h.id));
    }
    if (r.formulasChanged) {
      await sqliteStore.set('factory_default_formulas', formulas);
      await sqliteStore.set('factory_default_formulas_timestamp', Date.now());
    }
  }

  if (collectionName === 'factory_history' && cleanRecord) {
    const inv = ensureArray(await sqliteStore.get('factory_inventory_data'));
    const formulas = (await sqliteStore.get('factory_default_formulas')) || {};
    const { updates } = planMaterialDeduction(cleanRecord, inv, formulas, cleanRecord.formulaType || cleanRecord.store);
    if (updates && updates.length) {
      const now = getTimestamp();
      for (const u of updates) {
        const item = inv.find(i => i && i.id === u.id);
        if (!item) continue;
        item.quantity = u.quantity;
        item.totalValue = item.quantity * (item.cost || 0);
        if (item.conversionFactor && item.conversionFactor !== 1) item.purchaseQuantity = item.quantity / item.conversionFactor;
        item.updatedAt = now;
        ensureRecordIntegrity(item, true);
      }
      await unifiedSave('factory_inventory_data', inv, null, updates.map(u => u.id));
    }
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
  if (cleanRecord && (collectionName === 'sales' || collectionName === 'rep_sales') &&
      cleanRecord.paymentType === 'COLLECTION' && Array.isArray(cleanRecord.allocations) && cleanRecord.allocations.length) {
    const key = COLLECTION_TO_KEY[collectionName];
    const arr = ensureArray(await sqliteStore.get(key));
    const idMap = await _loadIdMap();
    const now = new Date();
    const when = { date: cleanRecord.date, time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }) };
    const ids = [];
    for (const a of cleanRecord.allocations) {
      const sale = arr.find(x => x && !x.deletedAt && x.id === resolveId(a.saleId, idMap));
      if (!sale || sale.creditReceived) continue;
      applyCollectionAlloc(sale, a, cleanRecord.id, when);
      sale.updatedAt = getTimestamp();
      ensureRecordIntegrity(sale, true);
      ids.push(sale.id);
    }
    cleanRecord.allocations = cleanRecord.allocations.map(a => ({ ...a, saleId: resolveId(a.saleId, idMap) }));
    if (ids.length) await unifiedSave(key, arr, null, ids);
  }
  // A recovered sale must have its customer back in the customer list (no-op when the contact exists).
  if (cleanRecord && (collectionName === 'sales' || collectionName === 'rep_sales')) {
    try { await ensureContactForRecoveredSale(collectionName, cleanRecord); }
    catch (e) { console.warn('[recover] contact re-create failed', e && e.message); }
  }
  return cleanRecord;
}

// RECOVER (pre-upload): re-point the snapshot's own links at records that were recovered earlier.
export async function resolveSnapshotLinks(collectionName, cleanRecord) {
  if (!cleanRecord) return cleanRecord;
  return resolveOwnLinks(collectionName, cleanRecord, await _loadIdMap());
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

// SAVE (rename): remember old -> new so records still in the recycle bin come back under the new name.
export async function recordCustomerRename(kind, from, to) {
  const map = (await sqliteStore.get('customer_rename_map')) || {};
  await sqliteStore.set('customer_rename_map', recordRename(map, kind, from, to));
}

// RECOVER (pre-upload): apply renames made while the record sat in the recycle bin.
export async function applyRenameOnRecovery(collectionName, cleanRecord) {
  if (!cleanRecord) return cleanRecord;
  const kind = (collectionName === 'sales' || collectionName === 'sales_customers') ? 'sales'
    : (collectionName === 'rep_sales' || collectionName === 'rep_customers') ? ('rep|' + (cleanRecord.salesRep || '')) : null;
  if (!kind) return cleanRecord;
  const map = (await sqliteStore.get('customer_rename_map')) || {};
  if (cleanRecord.customerName) cleanRecord.customerName = resolveRename(map, kind, cleanRecord.customerName);
  if ((collectionName === 'sales_customers' || collectionName === 'rep_customers') && cleanRecord.name) {
    cleanRecord.name = resolveRename(map, kind, cleanRecord.name);
  }
  return cleanRecord;
}

// RECOVER: a contact/entity with the same name is already live -> merge into it instead of duplicating.
export async function findLiveSameNameRecord(collectionName, snapshot) {
  if (!snapshot || !snapshot.name) return null;
  if (!['sales_customers', 'rep_customers', 'entities'].includes(collectionName)) return null;
  const arr = ensureArray(await sqliteStore.get(COLLECTION_TO_KEY[collectionName]));
  const nm = String(snapshot.name).trim().toLowerCase();
  return arr.find(r => r && !r.deletedAt && r.name && String(r.name).trim().toLowerCase() === nm) || null;
}

// SAVE (old debt): changing the opening balance must keep payments that were already collected.
export async function getOldDebtChangeIssue(oldDebtRecord, newAmount) {
  if (!oldDebtRecord || !oldDebtRecord.id) return { issue: null, collected: 0 };
  const all = ensureArray(await sqliteStore.get('customer_sales'));
  const kids = all.filter(s => s && s.relatedSaleId === oldDebtRecord.id);
  const live = all.find(s => s && s.id === oldDebtRecord.id);
  if (live && Array.isArray(live.collectionAllocs) && live.collectionAllocs.length && Math.abs((Number(live.totalValue) || 0) - (Number(newAmount) || 0)) > 0.001) {
    return { issue: 'This opening balance was paid through a bulk/partial collection. Delete or edit that collection before changing the amount.', collected: 0 };
  }
  return { issue: getOldDebtEditIssue(newAmount, kids), collected: sumChildPayments(kids) };
}

// SAVE (mark paid / unpaid): a sale settled by a calculator record, or a cash sale / collection,
// must not be flipped by hand - that would double-count or erase money the calculator already booked.
export async function getSettleToggleBlockReason(id, kind = 'customer') {
  const key = kind === 'rep' ? 'rep_sales' : 'customer_sales';
  const rec = ensureArray(await sqliteStore.get(key)).find(s => s && s.id === id);
  if (!rec) return null;
  if (!isSettleableSale(rec)) return 'Only credit sales can be marked paid or unpaid.';
  if (Array.isArray(rec.collectionAllocs) && rec.collectionAllocs.length) {
    return 'This sale was paid through a bulk/partial collection. Delete or edit that collection to change it.';
  }
  const calc = await getSaleBlockReason(id, kind, { forEdit: true });
  if (calc) return calc;
  if (!rec.creditReceived) {
    // About to be marked PAID: money already collected through separate payment records would count twice.
    const kids = ensureArray(await sqliteStore.get(key)).filter(s => s && !s.deletedAt && s.relatedSaleId === id && s.paymentType === 'PARTIAL_PAYMENT');
    return getPartialPaidIssue(kids.reduce((t, c) => t + (Number(c.totalValue) || 0), 0));
  }
  return null;
}

// RECOVER (plan): what is live right now, so the planner knows which parents still have to come back.
export async function getLiveRecoveryRefs() {
  const ids = new Set();
  for (const k of ['customer_sales', 'rep_sales', 'expenses', 'payment_entities']) {
    ensureArray(await sqliteStore.get(k)).forEach(r => { if (r && r.id && !r.deletedAt) ids.add(String(r.id)); });
  }
  const names = async (k) => new Set(ensureArray(await sqliteStore.get(k)).filter(c => c && c.name && !c.deletedAt).map(c => String(c.name).trim().toLowerCase()));
  return { ids, contacts: { sales: await names('sales_customers'), rep: await names('rep_customers') } };
}

// RECOVER (apply): a recovered sale must have its customer in the customer list again, or it shows up in
// statements but nowhere in the customer screen. Re-creates the contact only when none exists.
export async function ensureContactForRecoveredSale(collectionName, rec) {
  if (!rec || !rec.customerName || !String(rec.customerName).trim()) return null;
  let key, extra = {};
  if (collectionName === 'sales') {
    if (rec.isRepTransfer || (rec.salesRep && rec.salesRep !== 'NONE')) return null;
    key = 'sales_customers';
    extra = { customSalePrice: 0 };
  } else if (collectionName === 'rep_sales') {
    key = 'rep_customers';
    extra = { salesRep: rec.salesRep };
  } else return null;
  const arr = ensureArray(await sqliteStore.get(key));
  const nm = String(rec.customerName).trim().toLowerCase();
  const exists = arr.some(c => c && !c.deletedAt && c.name && String(c.name).trim().toLowerCase() === nm &&
    (key !== 'rep_customers' || !c.salesRep || !rec.salesRep || c.salesRep === rec.salesRep));
  if (exists) return null;
  const now = getTimestamp();
  const contact = { id: `${key === 'sales_customers' ? 'cust' : 'rep_cust'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    name: String(rec.customerName).trim(), phone: rec.customerPhone || '', address: '', oldDebit: 0, createdAt: now, updatedAt: now, timestamp: now, ...extra };
  ensureRecordIntegrity(contact, false);
  arr.push(contact);
  await unifiedSave(key, arr, contact);
  return contact;
}

// RECOVER (calculator record): everything it settled / claimed / created must be re-appliable.
export async function loadCalcRestoreContext(entry) {
  const tombs = ensureArray(await sqliteStore.get('deletion_records'));
  const tt = entry && entry.transferSaleId
    ? tombs.find(t => t && String(t.recordId || t.id) === String(entry.transferSaleId) && (t.collection || t.recordType) === 'sales')
    : null;
  const contacts = ensureArray(await sqliteStore.get('sales_customers'));
  const rep = entry && entry.returnRep ? String(entry.returnRep).toLowerCase() : null;
  const repContact = rep ? contacts.find(c => c && !c.deletedAt && c.name && c.name.toLowerCase() === rep) : null;
  let storeKeys;
  try {
    const st = typeof window !== 'undefined' && typeof window.getAppStores === 'function' ? await window.getAppStores() : null;
    if (Array.isArray(st) && st.length) storeKeys = st.map(s => s.key);
  } catch (_) { /* store list unavailable: skip that check */ }
  return {
    sales: ensureArray(await sqliteStore.get('customer_sales')),
    repSales: ensureArray(await sqliteStore.get('rep_sales')),
    history: ensureArray(await sqliteStore.get('noman_history')),
    storeKeys,
    transferSnapshot: tt && tt.snapshot ? tt.snapshot : null,
    repPriceOk: !!(repContact && Number(repContact.customSalePrice) > 0),
  };
}

export async function getCalcRestoreBlockReason(entry) {
  return planCalcRestore(entry, await loadCalcRestoreContext(entry)).block;
}

// AUDIT: old partly-paid sales that statements and trackers count twice. Read-only: it never changes data.
// Runs a few seconds after start-up, reports at most once a day, and is also callable as window.auditLegacyPartialPayments().
export async function auditLegacyPartialPayments(opts = {}) {
  const customer = findPartialConflicts(ensureArray(await sqliteStore.get('customer_sales')));
  const rep = findPartialConflicts(ensureArray(await sqliteStore.get('rep_sales')));
  const all = [...customer.map(c => ({ ...c, where: 'customer' })), ...rep.map(c => ({ ...c, where: 'rep' }))];
  const debt = all.filter(c => c.kind === 'debt-reduced-twice').reduce((t, c) => t + c.amount, 0);
  const cash = all.filter(c => c.kind === 'cash-counted-twice').reduce((t, c) => t + c.amount, 0);
  const report = { count: all.length, debtUnderstatedBy: Math.round(debt * 100) / 100, cashOverstatedBy: Math.round(cash * 100) / 100, items: all };
  if (typeof window !== 'undefined') window._partialAudit = report;
  if (all.length && !opts.silent) {
    const today = new Date().toISOString().slice(0, 10);
    if ((await sqliteStore.get('partial_audit_last')) !== today) {
      await sqliteStore.set('partial_audit_last', today);
      const names = [...new Set(all.map(c => c.customerName).filter(Boolean))].slice(0, 3).join(', ');
      if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
        window.showToast(`${all.length} old partly-paid sale${all.length !== 1 ? 's' : ''} (${names}) are counted twice: customer debt is understated by ${report.debtUnderstatedBy} and cash overstated by ${report.cashOverstatedBy}. Details: window._partialAudit`, 'warning', 12000);
      }
      console.table(all);
    }
  }
  return report;
}


// ---- bulk / partial collections: apply to / undo from the customer's credit sales ---------------------------
// Pure rules live in link-graph.js. These wrappers do the store-aware part.

function _snapshotSales(list) { return list.map(x => ({ ref: x, copy: JSON.parse(JSON.stringify(x)) })); }
function _restoreSales(snaps) {
  for (const { ref, copy } of snaps) { Object.keys(ref).forEach(k => { if (!(k in copy)) delete ref[k]; }); Object.assign(ref, copy); }
}

// Undo what a collection did to its sales (delete path). Saves the touched sales on their own.
export async function revertCollectionToSales(kind, collection, all) {
  const key = kind === 'rep' ? 'rep_sales' : 'customer_sales';
  const arr = Array.isArray(all) ? all : ensureArray(await sqliteStore.get(key));
  const ids = [];
  for (const a of collection.allocations || []) {
    const sale = arr.find(s => s && s.id === a.saleId);
    if (sale && revertCollectionAlloc(sale, collection.id)) {
      sale.updatedAt = getTimestamp();
      ensureRecordIntegrity(sale, true);
      ids.push(sale.id);
    }
  }
  if (ids.length) await unifiedSave(key, arr, null, ids);
  return ids;
}

// Apply a collection to the customer's unpaid sales. Mutates `record` (totalValue becomes the leftover) and the sales.
// opts: { kind, arr, record, amount, name, repName, original, when, getGross }
// Returns { changedIds, allocated, undo } - call undo() if saving afterwards fails. Throws { message } when an edit cannot be redone.
export async function applyCollectionToSales(opts) {
  const { kind, arr, record, amount, name, repName, original, when, getGross } = opts;
  const lname = String(name || '').trim().toLowerCase();
  // Opening balances (old debt) are saved with salesRep 'ADMIN', so they are matched by type, not by rep.
  const mine = arr.filter(s => s && !s.deletedAt && !s.isMerged && s.customerName && String(s.customerName).trim().toLowerCase() === lname &&
    (kind === 'rep' ? s.salesRep === repName : (s.currentRepProfile === 'admin' && (s.transactionType === 'OLD_DEBT' || !s.salesRep || s.salesRep === 'NONE'))));
  const snaps = _snapshotSales(mine);
  const undo = () => _restoreSales(snaps);
  const changed = new Set();
  const hadOld = original && original.paymentType === 'COLLECTION' && Array.isArray(original.allocations) && original.allocations.length;
  if (hadOld) {
    const issue = getCollectionRevertIssue(original, arr);
    if (issue) throw new Error(issue);
    for (const a of original.allocations) {
      const sale = arr.find(s => s && s.id === a.saleId);
      if (sale && revertCollectionAlloc(sale, original.id)) changed.add(sale.id);
    }
  }
  const candidates = sortForCollection(mine.filter(s =>
    (s.paymentType === 'CREDIT' || s.transactionType === 'OLD_DEBT') && !s.creditReceived && !s.usedInCalcId &&
    !(s.isRepTransfer || (s.isTransfer && s.transferFrom))));
  const dues = [];
  for (const s of candidates) dues.push({ id: s.id, due: debtDelta(s, debtNeedsGross(s) ? await getGross(s) : 0) });
  const plan = planCollectionAllocation(amount, dues);
  for (const a of plan.allocs) {
    const sale = candidates.find(s => s.id === a.saleId);
    applyCollectionAlloc(sale, a, record.id, when);
    changed.add(sale.id);
  }
  const stamp = getTimestamp();
  const changedIds = [...changed];
  changedIds.forEach(id => { const s = arr.find(x => x && x.id === id); if (s) { s.updatedAt = stamp; ensureRecordIntegrity(s, true); } });
  if (plan.allocs.length) {
    record.collectedAmount = amount;
    record.allocations = plan.allocs;
    record.totalValue = plan.leftover;
    record.profit = plan.leftover;
  } else {
    delete record.collectedAmount; delete record.allocations;
  }
  const allocated = plan.allocs.reduce((t, a) => t + a.amount, 0);
  return { changedIds, allocated, paidCount: plan.allocs.filter(a => a.full).length, partialCount: plan.allocs.filter(a => !a.full).length, undo };
}
