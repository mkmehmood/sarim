import { sqliteStore, ensureArray, getTimestamp, ensureRecordIntegrity, debtDelta, debtNeedsGross } from './business.js';
import { unifiedSave, unifiedDelete } from './sync.js';
import {
  COLLECTION_TO_KEY, REF_FIELDS, resolveId, remapReferences, resolveOwnLinks,
  planChildDetach, planChildReattach, applyPatch, getEditLinkIssue,
  planExpenseCascade, newGroupId, stampGroup,
  planExpenseNameRename, getDeleteCashDrop, getRestoreCashNeed, getCashShortIssue, planEntityRename, applyEntityRename, findPartialConflicts, planCalcRestore, isSettleableSale, getPartialPaidIssue, remapMaterialRefs, planMaterialDeduction, getStockOverdrawIssue, getUnitsShortIssue, DELETE_ORIGIN_FIELD,
  recordRename, resolveRename, getOldDebtEditIssue, sumChildPayments,
  planCollectionAllocation, applyCollectionAlloc, revertCollectionAlloc, getCollectionRevertIssue, getCollectionReapplyIssue, sortForCollection,
} from './link-graph.js';
async function _calcHistory() {
  return ensureArray(await sqliteStore.get('calculator')).filter(h => h && !h.deletedAt);
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
export async function getSaleBlockReason(id, kind = 'customer', opts = {}) {
  const key = kind === 'rep' ? 'rep' : 'sales';
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
  const sales = ensureArray(await sqliteStore.get('sales'));
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
  const inv = ensureArray(await sqliteStore.get('inventory'));
  const chora = inv.find(m => m && m.name && m.name.toUpperCase() === 'CHORA');
  if (!chora) return null;
  if ((chora.quantity || 0) + 0.0001 < entry.expired) {
    return `Only ${chora.quantity || 0} kg of CHORA is left, but this record added ${entry.expired} kg. Part of it has already been used, so it cannot be removed.`;
  }
  return null;
}
export function getRecoverBlockReason(collectionName, snapshot) {
  const s = snapshot || {};
  if (collectionName === 'sales' && (s.isRepTransfer || (s.isTransfer && s.transferFrom))) {
    return 'This is a rep stock transfer created by a calculator record. Recover is not allowed; enter the calculation again.';
  }
  const _fromProdTab = s[DELETE_ORIGIN_FIELD] === 'prod-tab';
  if (collectionName === 'production' && s.isReturn === true && s.returnedBy && !_fromProdTab) {
    return 'This stock return was created by a calculator record. Recover is not allowed; enter the calculation again.';
  }
  if (collectionName === 'returns' && s.seller && !_fromProdTab) {
    return 'This return log was created by a calculator record. Recover is not allowed; enter the calculation again.';
  }
  return null;
}
export async function getPendingAllocationCount(repName) {
  const sales = ensureArray(await sqliteStore.get('sales'));
  const hist = await _calcHistory();
  const settled = new Set();
  hist.forEach(h => { if (Array.isArray(h.linkedSalesIds)) h.linkedSalesIds.forEach(i => settled.add(i)); });
  return sales.filter(s => s && !s.deletedAt && s.customerName === repName && s.currentRepProfile === 'admin' &&
    s.paymentType === 'CREDIT' && !s.creditReceived && s.transactionType !== 'OLD_DEBT' && !settled.has(s.id)).length;
}
const _ID_MAP_KEY = 'recovered_id_map';
async function _loadIdMap() {
  const m = await sqliteStore.get(_ID_MAP_KEY, {});
  return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
}
export async function detachChildPayment(kind, child, all) {
  if (child && child.paymentType === 'COLLECTION' && Array.isArray(child.allocations) && child.allocations.length) {
    return await revertCollectionToSales(kind, child, all);
  }
  if (!child || child.paymentType !== 'PARTIAL_PAYMENT' || !child.relatedSaleId) return null;
  const key = kind === 'rep' ? 'rep' : 'sales';
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
export async function getSaleEditLinkIssue(kind, original, next) {
  if (!original || !original.id) return null;
  const key = kind === 'rep' ? 'rep' : 'sales';
  const all = ensureArray(await sqliteStore.get(key));
  const children = all.filter(s => s && s.id !== original.id && s.relatedSaleId === original.id);
  return getEditLinkIssue(original, next, children);
}
export async function getRecoverLinkBlockReason(collectionName, snapshot, ctx) {
  if (!snapshot) return null;
  if ((collectionName === 'sales' || collectionName === 'rep') && snapshot.paymentType === 'PARTIAL_PAYMENT' && snapshot.relatedSaleId) {
    const key = COLLECTION_TO_KEY[collectionName];
    const idMap = await _loadIdMap();
    const parentId = resolveId(snapshot.relatedSaleId, idMap);
    const parent = ensureArray(await sqliteStore.get(key)).find(s => s && !s.deletedAt && s.id === parentId);
    const { block } = planChildReattach(parent, snapshot);
    return block || null;
  }
  if ((collectionName === 'sales' || collectionName === 'rep') && snapshot.paymentType === 'COLLECTION' && Array.isArray(snapshot.allocations) && snapshot.allocations.length) {
    const key = COLLECTION_TO_KEY[collectionName];
    const idMap = await _loadIdMap();
    const live = ensureArray(await sqliteStore.get(key)).filter(r => r && !r.deletedAt);
    const mapped = { ...snapshot, allocations: snapshot.allocations.map(a => ({ ...a, saleId: resolveId(a.saleId, idMap) })) };
    return getCollectionReapplyIssue(mapped, live);
  }
  if (collectionName === 'calculator') return await getCalcRestoreBlockReason(snapshot);
  if (collectionName === 'sales' && Number(snapshot.quantity) > 0 && snapshot.supplyStore &&
      !['COLLECTION', 'PARTIAL_PAYMENT'].includes(snapshot.paymentType) && snapshot.transactionType !== 'OLD_DEBT' &&
      typeof window !== 'undefined' && typeof window.computeStoreStockSnapshot === 'function') {
    const day = snapshot.supplyDate || snapshot.date;
    const snap = await window.computeStoreStockSnapshot(snapshot.supplyStore, day);
    const label = typeof window.getStoreLabel === 'function' ? (window.getStoreLabel(snapshot.supplyStore) || snapshot.supplyStore) : snapshot.supplyStore;
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
  if (collectionName === 'production' && !snapshot.isReturn && !snapshot.isTransfer && !snapshot.isMerged && Number(snapshot.formulaUnits) > 0) {
    const ft = snapshot.formulaStore || 'standard';
    const tracking = (await sqliteStore.get('factory_unit_tracking')) || {};
    const used = ctx && ctx.unitsUsed ? (ctx.unitsUsed.get(ft) || 0) : 0;
    const issue = getUnitsShortIssue(snapshot.formulaName || ft, Number(snapshot.formulaUnits) + used, (tracking[ft] && tracking[ft].available) || 0);
    if (!issue && ctx && ctx.unitsUsed) ctx.unitsUsed.set(ft, used + Number(snapshot.formulaUnits));
    return issue;
  }
  if (collectionName === 'inventory' && snapshot.supplierId) {
    const idMap = await _loadIdMap();
    const sid = resolveId(snapshot.supplierId, idMap);
    const ents = ensureArray(await sqliteStore.get('entities'));
    if (!ents.some(e => e && !e.deletedAt && String(e.id) === String(sid))) {
      return `This material was linked to ${snapshot.supplierName || 'a supplier'} who is no longer in your payments. Recover that supplier first, then recover the material.`;
    }
  }
  if (collectionName === 'factory') {
    if (ctx && !ctx.inv) ctx.inv = JSON.parse(JSON.stringify(ensureArray(await sqliteStore.get('inventory'))));
    const inv = ctx && ctx.inv ? ctx.inv : ensureArray(await sqliteStore.get('inventory'));
    const formulas = (await sqliteStore.get('factory_default_formulas')) || {};
    const idMap = await _loadIdMap();
    const entry = { ...snapshot, materialsUsed: (snapshot.materialsUsed || []).map(m => ({ ...m, id: resolveId(m.id, idMap) })) };
    const { block, updates } = planMaterialDeduction(entry, inv, formulas, snapshot.formulaType || snapshot.store);
    if (block) return block;
    if (ctx && updates) updates.forEach(u => { const it = inv.find(i => i && i.id === u.id); if (it) it.quantity = u.quantity; });
    return null;
  }
  if (collectionName === 'transactions') {
    if (!(ctx && ctx.entityInSet && ctx.entityInSet(snapshot.entityId))) {
      const idMap = await _loadIdMap();
      const ents = ensureArray(await sqliteStore.get('entities'));
      const liveEnt = (id) => id && ents.some(e => e && !e.deletedAt && String(e.id) === String(resolveId(id, idMap)));
      if (snapshot.entityId && !liveEnt(snapshot.entityId)) {
        return `The ${snapshot.entityName ? `"${snapshot.entityName}"` : 'entity'} this payment belongs to no longer exists. Recover that entity first.`;
      }
      if (snapshot.isTransfer && snapshot.transferPeerEntityId && !liveEnt(snapshot.transferPeerEntityId)) {
        return `The ${snapshot.transferPeerEntityName ? `"${snapshot.transferPeerEntityName}"` : 'other entity'} on the other side of this transfer no longer exists. Recover it first.`;
      }
    }
    const need = getRestoreCashNeed(snapshot);
    if (need > 0 && typeof window !== 'undefined' && typeof window.getAvailableCashInHand === 'function') {
      const used = ctx && typeof ctx.cashUsed === 'number' ? ctx.cashUsed : 0;
      const avail = await window.getAvailableCashInHand();
      const issue = getCashShortIssue(need + used, avail, 'Recovering this payment');
      if (!issue && ctx) ctx.cashUsed = used + need;
      return issue;
    }
  }
  return null;
}
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
  if (collectionName === 'inventory') {
    const hist = ensureArray(await sqliteStore.get('factory'));
    const formulas = (await sqliteStore.get('factory_default_formulas')) || {};
    const r = remapMaterialRefs(hist, formulas, oldId, newId);
    if (r.historyChanged.length) {
      const now = getTimestamp();
      r.historyChanged.forEach(h => { h.updatedAt = now; });
      await unifiedSave('factory', hist, null, r.historyChanged.map(h => h.id));
    }
    if (r.formulasChanged) {
      await sqliteStore.set('factory_default_formulas', formulas);
      await sqliteStore.set('factory_default_formulas_timestamp', Date.now());
    }
  }
  if (collectionName === 'factory' && cleanRecord) {
    const inv = ensureArray(await sqliteStore.get('inventory'));
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
      await unifiedSave('inventory', inv, null, updates.map(u => u.id));
    }
  }
  if (cleanRecord && !opts.skipReattach && (collectionName === 'sales' || collectionName === 'rep') &&
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
  if (cleanRecord && (collectionName === 'sales' || collectionName === 'rep') &&
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
  if (cleanRecord && (collectionName === 'sales' || collectionName === 'rep')) {
    try { await ensureContactForRecoveredSale(collectionName, cleanRecord); }
    catch (e) { console.warn('[recover] contact re-create failed', e && e.message); }
  }
  return cleanRecord;
}
export async function resolveSnapshotLinks(collectionName, cleanRecord) {
  if (!cleanRecord) return cleanRecord;
  resolveOwnLinks(collectionName, cleanRecord, await _loadIdMap());
  const isTx = collectionName === 'transactions';
  // A link to something that no longer exists is worse than no link: drop it, and refresh copied names.
  if (isTx && cleanRecord.expenseId) {
    const exps = ensureArray(await sqliteStore.get('expenses'));
    if (!exps.some(e => e && !e.deletedAt && String(e.id) === String(cleanRecord.expenseId))) delete cleanRecord.expenseId;
  }
  if (collectionName === 'inventory' && cleanRecord.supplierId) {
    const ents = ensureArray(await sqliteStore.get('entities'));
    const ent = ents.find(e => e && !e.deletedAt && String(e.id) === String(cleanRecord.supplierId));
    if (ent) cleanRecord.supplierName = ent.name;
    else {
      // The supplier is gone: bring the material back as an ordinary unlinked material with nothing owed.
      delete cleanRecord.supplierId; delete cleanRecord.supplierName; delete cleanRecord.totalPayable; delete cleanRecord.paidDate;
      cleanRecord.paymentStatus = 'pending';
    }
  }
  return cleanRecord;
}
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
export async function deletePaymentTxWithLinks(tx, opts = {}) {
  if (!tx || !tx.id) return { tx: null, expense: null };
  const allTxs = ensureArray(await sqliteStore.get('transactions'));
  const expenses = ensureArray(await sqliteStore.get('expenses'));
  const expense = planExpenseCascade(tx, allTxs, expenses, opts.excludeIds);
  const groupId = opts.groupId || (expense ? newGroupId('pay') : null);
  const remaining = allTxs.filter(t => t && String(t.id) !== String(tx.id));
  await unifiedDelete('transactions', remaining, tx.id, { strict: true }, groupId ? stampGroup(tx, groupId) : tx);
  if (expense) {
    const remainingExp = expenses.filter(e => e && String(e.id) !== String(expense.id));
    await unifiedDelete('expenses', remainingExp, expense.id, { strict: true }, stampGroup(expense, groupId));
  }
  await _dropExpensePhoto(tx.expenseId);
  return { tx, expense };
}
export async function recordCustomerRename(kind, from, to) {
  const map = (await sqliteStore.get('customer_rename_map')) || {};
  await sqliteStore.set('customer_rename_map', recordRename(map, kind, from, to));
}
export async function applyRenameOnRecovery(collectionName, cleanRecord) {
  if (!cleanRecord) return cleanRecord;
  if (collectionName === 'entities' || collectionName === 'transactions' || collectionName === 'inventory') {
    const emap = (await sqliteStore.get('customer_rename_map')) || {};
    if (collectionName === 'entities' && cleanRecord.name) cleanRecord.name = resolveRename(emap, 'entity', cleanRecord.name);
    if ((collectionName === 'transactions')) {
      if (cleanRecord.entityName) cleanRecord.entityName = resolveRename(emap, 'entity', cleanRecord.entityName);
      if (cleanRecord.transferPeerEntityName) cleanRecord.transferPeerEntityName = resolveRename(emap, 'entity', cleanRecord.transferPeerEntityName);
    }
    if (collectionName === 'inventory' && cleanRecord.supplierName) cleanRecord.supplierName = resolveRename(emap, 'entity', cleanRecord.supplierName);
    return cleanRecord;
  }
  const kind = (collectionName === 'sales' || collectionName === 'customers') ? 'sales'
    : (collectionName === 'rep' || collectionName === 'clients') ? ('rep|' + (cleanRecord.salesRep || '')) : null;
  if (!kind) return cleanRecord;
  const map = (await sqliteStore.get('customer_rename_map')) || {};
  if (cleanRecord.customerName) cleanRecord.customerName = resolveRename(map, kind, cleanRecord.customerName);
  if ((collectionName === 'customers' || collectionName === 'clients') && cleanRecord.name) {
    cleanRecord.name = resolveRename(map, kind, cleanRecord.name);
  }
  return cleanRecord;
}
export async function findLiveSameNameRecord(collectionName, snapshot) {
  if (!snapshot || !snapshot.name) return null;
  if (!['customers', 'clients', 'entities'].includes(collectionName)) return null;
  const arr = ensureArray(await sqliteStore.get(COLLECTION_TO_KEY[collectionName]));
  const nm = String(snapshot.name).trim().toLowerCase();
  return arr.find(r => r && !r.deletedAt && r.name && String(r.name).trim().toLowerCase() === nm) || null;
}
export async function getOldDebtChangeIssue(oldDebtRecord, newAmount) {
  if (!oldDebtRecord || !oldDebtRecord.id) return { issue: null, collected: 0 };
  const all = ensureArray(await sqliteStore.get('sales'));
  const kids = all.filter(s => s && s.relatedSaleId === oldDebtRecord.id);
  const live = all.find(s => s && s.id === oldDebtRecord.id);
  if (live && Array.isArray(live.collectionAllocs) && live.collectionAllocs.length && Math.abs((Number(live.totalValue) || 0) - (Number(newAmount) || 0)) > 0.001) {
    return { issue: 'This opening balance was paid through a bulk/partial collection. Delete or edit that collection before changing the amount.', collected: 0 };
  }
  return { issue: getOldDebtEditIssue(newAmount, kids), collected: sumChildPayments(kids) };
}
export async function getSettleToggleBlockReason(id, kind = 'customer') {
  const key = kind === 'rep' ? 'rep' : 'sales';
  const rec = ensureArray(await sqliteStore.get(key)).find(s => s && s.id === id);
  if (!rec) return null;
  if (!isSettleableSale(rec)) return 'Only credit sales can be marked paid or unpaid.';
  if (Array.isArray(rec.collectionAllocs) && rec.collectionAllocs.length) {
    return 'This sale was paid through a bulk/partial collection. Delete or edit that collection to change it.';
  }
  const calc = await getSaleBlockReason(id, kind, { forEdit: true });
  if (calc) return calc;
  if (!rec.creditReceived) {
    const kids = ensureArray(await sqliteStore.get(key)).filter(s => s && !s.deletedAt && s.relatedSaleId === id && s.paymentType === 'PARTIAL_PAYMENT');
    return getPartialPaidIssue(kids.reduce((t, c) => t + (Number(c.totalValue) || 0), 0));
  }
  return null;
}
export async function getLiveRecoveryRefs() {
  const ids = new Set();
  for (const k of ['sales', 'rep', 'expenses', 'entities']) {
    ensureArray(await sqliteStore.get(k)).forEach(r => { if (r && r.id && !r.deletedAt) ids.add(String(r.id)); });
  }
  const names = async (k) => new Set(ensureArray(await sqliteStore.get(k)).filter(c => c && c.name && !c.deletedAt).map(c => String(c.name).trim().toLowerCase()));
  return { ids, contacts: { sales: await names('customers'), rep: await names('clients') } };
}
export async function ensureContactForRecoveredSale(collectionName, rec) {
  if (!rec || !rec.customerName || !String(rec.customerName).trim()) return null;
  let key, extra = {};
  if (collectionName === 'sales') {
    if (rec.isRepTransfer || (rec.salesRep && rec.salesRep !== 'NONE')) return null;
    key = 'customers';
    extra = { customSalePrice: 0 };
  } else if (collectionName === 'rep') {
    key = 'clients';
    extra = { salesRep: rec.salesRep };
  } else return null;
  const arr = ensureArray(await sqliteStore.get(key));
  const nm = String(rec.customerName).trim().toLowerCase();
  const exists = arr.some(c => c && !c.deletedAt && c.name && String(c.name).trim().toLowerCase() === nm &&
    (key !== 'clients' || !c.salesRep || !rec.salesRep || c.salesRep === rec.salesRep));
  if (exists) return null;
  const now = getTimestamp();
  const contact = { id: `${key === 'customers' ? 'cust' : 'rep_cust'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    name: String(rec.customerName).trim(), phone: rec.customerPhone || '', address: '', oldDebit: 0, createdAt: now, updatedAt: now, timestamp: now, ...extra };
  ensureRecordIntegrity(contact, false);
  arr.push(contact);
  await unifiedSave(key, arr, contact);
  return contact;
}
export async function loadCalcRestoreContext(entry) {
  const tombs = ensureArray(await sqliteStore.get('deletion_records'));
  const tt = entry && entry.transferSaleId
    ? tombs.find(t => t && String(t.recordId || t.id) === String(entry.transferSaleId) && (t.collection || t.recordType) === 'sales')
    : null;
  const contacts = ensureArray(await sqliteStore.get('customers'));
  const rep = entry && entry.returnRep ? String(entry.returnRep).toLowerCase() : null;
  const repContact = rep ? contacts.find(c => c && !c.deletedAt && c.name && c.name.toLowerCase() === rep) : null;
  let storeKeys;
  try {
    const st = typeof window !== 'undefined' && typeof window.getAppStores === 'function' ? await window.getAppStores() : null;
    if (Array.isArray(st) && st.length) storeKeys = st.map(s => s.key);
  } catch (_) { }
  return {
    sales: ensureArray(await sqliteStore.get('sales')),
    repSales: ensureArray(await sqliteStore.get('rep')),
    history: ensureArray(await sqliteStore.get('calculator')),
    storeKeys,
    transferSnapshot: tt && tt.snapshot ? tt.snapshot : null,
    repPriceOk: !!(repContact && Number(repContact.customSalePrice) > 0),
  };
}
export async function getCalcRestoreBlockReason(entry) {
  return planCalcRestore(entry, await loadCalcRestoreContext(entry)).block;
}
export async function auditLegacyPartialPayments(opts = {}) {
  const customer = findPartialConflicts(ensureArray(await sqliteStore.get('sales')));
  const rep = findPartialConflicts(ensureArray(await sqliteStore.get('rep')));
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
        window.window.notifyBlocking(`${all.length} old partly-paid sale${all.length !== 1 ? 's' : ''} (${names}) are counted twice: customer debt is understated by ${report.debtUnderstatedBy} and cash overstated by ${report.cashOverstatedBy}. Details: window._partialAudit`, 'warning');
      }
      console.table(all);
    }
  }
  return report;
}
function _snapshotSales(list) { return list.map(x => ({ ref: x, copy: JSON.parse(JSON.stringify(x)) })); }
function _restoreSales(snaps) {
  for (const { ref, copy } of snaps) { Object.keys(ref).forEach(k => { if (!(k in copy)) delete ref[k]; }); Object.assign(ref, copy); }
}
export async function revertCollectionToSales(kind, collection, all) {
  const key = kind === 'rep' ? 'rep' : 'sales';
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
export async function applyCollectionToSales(opts) {
  const { kind, arr, record, amount, name, repName, original, when, getGross } = opts;
  const lname = String(name || '').trim().toLowerCase();
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
export async function getPaymentDeleteBlockReason(tx) {
  const drop = getDeleteCashDrop(tx);
  if (drop <= 0 || typeof window === 'undefined' || typeof window.getAvailableCashInHand !== 'function') return null;
  return getCashShortIssue(drop, await window.getAvailableCashInHand(), 'Deleting this payment');
}
export async function cascadeEntityRename(entityId, oldName, newName) {
  if (!entityId || !newName || oldName === newName) return { tx: 0, materials: 0 };
  const map = (await sqliteStore.get('customer_rename_map')) || {};
  await sqliteStore.set('customer_rename_map', recordRename(map, 'entity', oldName, newName));
  const txs = ensureArray(await sqliteStore.get('transactions'));
  const mats = ensureArray(await sqliteStore.get('inventory'));
  const plan = planEntityRename(entityId, newName, txs, mats);
  applyEntityRename(entityId, newName, txs, mats, plan);
  const now = getTimestamp();
  const ents = ensureArray(await sqliteStore.get('entities'));
  const entity = ents.find(e => e && String(e.id) === String(entityId));
  const exps = ensureArray(await sqliteStore.get('expenses'));
  const expIds = planExpenseNameRename(entity, oldName, newName, exps);
  if (expIds.length) {
    const set = new Set(expIds.map(String));
    exps.forEach(e => { if (e && set.has(String(e.id))) { e.name = newName; e.updatedAt = now; } });
    await unifiedSave('expenses', exps, null, expIds);
  }
  if (plan.txIds.length) {
    const ids = new Set(plan.txIds.map(String));
    txs.forEach(t => { if (t && ids.has(String(t.id))) t.updatedAt = now; });
    await unifiedSave('transactions', txs, null, plan.txIds);
  }
  if (plan.materialIds.length) {
    const ids = new Set(plan.materialIds.map(String));
    mats.forEach(m => { if (m && ids.has(String(m.id))) m.updatedAt = now; });
    await unifiedSave('inventory', mats, null, plan.materialIds);
  }
  return { tx: plan.txIds.length, materials: plan.materialIds.length, expenses: expIds.length };
}
