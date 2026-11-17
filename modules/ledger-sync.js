import { appMode, allocatePaymentToMaterials, ensureArray, ensureRecordIntegrity, formatTime12, generateUUID, getTimestamp, loadCollections, sqliteStore, validateUUID } from './business.js';
import { unifiedDelete, unifiedSave } from './sync.js';
import { _restorePayableFromDeletedTransaction, notifyDataChange, triggerAutoSync } from './utilities-core.js';
import { calculateCashTracker, calculateNetCash, refreshCustomerSales } from './utilities-sales.js';
import { refreshPaymentTab } from './utilities-payments.js';
import { applyCollectionToSales, deletePaymentTxWithLinks, detachChildPayment, getPaymentTxDeleteBlockReason, getSaleBlockReason } from './link-guards.js';
import { getTxLinkIssue, newGroupId } from './link-graph.js';
import { getSaleTransactionValue } from './factory-core.js';
import { buildMoneyOutRecord } from './money-out.js';
import { ledgerLink, linkedDescription } from './ledger-core.js';

const createdBy = () => ((appMode === 'userrole' && window._assignedManagerName) ? window._assignedManagerName : null);
const newId = (prefix) => {
  let id = generateUUID(prefix);
  if (!validateUUID(id)) id = generateUUID(prefix);
  return id;
};
const isPending = (m) => (m.paymentStatus === 'pending' || !m.paymentStatus) && parseFloat(m.totalPayable || 0) > 0;
const byPurchase = (a, b) => new Date(a.purchaseDate || a.createdAt || 0) - new Date(b.purchaseDate || b.createdAt || 0);

async function postEntity(entry, target) {
  const { inventory, entities, transactions, expenses } = await loadCollections('inventory', 'entities', 'transactions', 'expenses');
  const entity = entities.find((e) => e && String(e.id) === String(target.entity.id));
  if (!entity) throw new Error('The Payments entity for this party was not found.');
  const type = entry.type === 'OUT' ? 'OUT' : 'IN';
  const snap = JSON.parse(JSON.stringify(inventory));
  const touchedIds = [];
  let materialId = null;
  const materialIds = [];
  let isPayable = false;
  try {
    if (type === 'OUT') {
      const linked = inventory.filter((m) => String(m.supplierId) === String(entity.id) && isPending(m)).sort(byPurchase);
      const loose = entity.isSupplier ? inventory.filter((m) => !m.supplierId && isPending(m)).sort(byPurchase) : [];
      const pending = [...linked, ...loose];
      if (pending.length) {
        const touched = allocatePaymentToMaterials(pending, entry.amount, entry.date).touched;
        for (const mat of touched) {
          if (!materialId) materialId = mat.id;
          materialIds.push(mat.id);
          touchedIds.push(mat.id);
          await unifiedSave('inventory', inventory, mat);
        }
        isPayable = touched.length > 0;
      }
    }
    const stamp = getTimestamp();
    let payment = {
      id: newId('pay'), createdAt: stamp, updatedAt: stamp, timestamp: stamp,
      entityId: entity.id, entityName: entity.name, entityType: entity.type,
      date: entry.date, time: formatTime12(new Date()), amount: entry.amount,
      description: linkedDescription(entry), type, materialId, materialIds, isPayable,
      ledgerId: entry.id, syncedAt: new Date().toISOString(), createdBy: createdBy()
    };
    const issue = getTxLinkIssue(payment, { entities, expenses, inventory });
    if (issue) throw new Error(issue);
    payment = ensureRecordIntegrity(payment, false);
    transactions.push(payment);
    await unifiedSave('transactions', transactions, payment);
    notifyDataChange('payments');
    return ledgerLink('entity', { entityId: entity.id, name: entity.name, txId: payment.id });
  } catch (err) {
    for (const id of touchedIds) {
      const orig = snap.find((m) => m && m.id === id);
      const live = inventory.find((m) => m && m.id === id);
      if (orig && live) {
        Object.keys(live).forEach((k) => { delete live[k]; });
        Object.assign(live, orig);
        try { await unifiedSave('inventory', inventory, live); } catch (_) { }
      }
    }
    throw err;
  }
}

async function postCustomer(entry, target) {
  const name = target.customer;
  const { sales, customers } = await loadCollections('sales', 'customers');
  const snapshot = [...sales];
  let rec;
  let alloc = null;
  if (entry.type === 'OUT') {
    rec = ensureRecordIntegrity(buildMoneyOutRecord({ name, amount: entry.amount, date: entry.date, note: linkedDescription(entry), createdBy: createdBy() }), false);
  } else {
    const stamp = getTimestamp();
    const known = customers.find((c) => c && String(c.name || '').trim().toLowerCase() === name.toLowerCase());
    const phone = (known && known.phone) || ((sales.find((s) => s && s.customerName === name && s.customerPhone) || {}).customerPhone) || '';
    const time = formatTime12(new Date());
    rec = {
      id: newId('sale'), timestamp: stamp, createdAt: stamp, updatedAt: stamp, date: entry.date, time,
      customerName: name, customerPhone: phone, quantity: 0, supplyStore: null, paymentType: 'COLLECTION',
      salesRep: 'NONE', currentRepProfile: 'admin', totalCost: 0, totalValue: entry.amount, profit: entry.amount,
      creditReceived: true, isCollection: true, notes: linkedDescription(entry), gps: null,
      syncedAt: new Date().toISOString(), createdBy: createdBy()
    };
    alloc = await applyCollectionToSales({ kind: 'customer', arr: sales, record: rec, amount: entry.amount, expiredValue: 0, name, original: null, when: { date: entry.date, time }, getGross: getSaleTransactionValue });
    rec = ensureRecordIntegrity(rec, false);
  }
  rec.ledgerId = entry.id;
  try {
    sales.push(rec);
    if (alloc && alloc.changedIds.length) await unifiedSave('sales', sales, null, alloc.changedIds);
    await unifiedSave('sales', sales, rec);
    notifyDataChange('sales');
    return ledgerLink('customer', { name, saleId: rec.id });
  } catch (err) {
    if (alloc) alloc.undo();
    sales.length = 0;
    sales.push(...snapshot);
    try { await unifiedSave('sales', sales); } catch (_) { }
    throw err;
  }
}

async function postExpense(entry, target) {
  const { expenses, entities, transactions } = await loadCollections('expenses', 'entities', 'transactions');
  const name = target.name;
  const stamp = getTimestamp();
  const expense = ensureRecordIntegrity({
    id: newId('exp'), name, amount: entry.amount, date: entry.date, description: linkedDescription(entry),
    category: 'operating', createdAt: stamp, updatedAt: stamp, timestamp: stamp, ledgerId: entry.id, syncedAt: new Date().toISOString()
  }, false);
  expenses.push(expense);
  await unifiedSave('expenses', expenses, expense);
  const entity = entities.find((e) => e && e.isExpenseEntity === true && !e.deletedAt && String(e.name || '').trim().toLowerCase() === name.toLowerCase());
  let txId = '';
  if (entity) {
    try {
      const tx = ensureRecordIntegrity({
        id: newId('pay'), entityId: entity.id, entityName: entity.name, amount: entry.amount, type: 'OUT', date: entry.date,
        description: linkedDescription(entry), category: 'operating', isPayable: false, isExpense: true, expenseId: expense.id,
        ledgerId: entry.id, createdBy: createdBy()
      }, false);
      transactions.push(tx);
      await unifiedSave('transactions', transactions, tx);
      txId = tx.id;
    } catch (err) {
      await unifiedDelete('expenses', ensureArray(await sqliteStore.get('expenses')).filter((e) => e && e.id !== expense.id), expense.id, { strict: true }, expense);
      throw err;
    }
  }
  notifyDataChange('expenses');
  return ledgerLink('expense', { expenseId: expense.id, txId, name });
}

async function refreshViews() {
  try {
    if (typeof calculateCashTracker === 'function') calculateCashTracker();
    if (typeof calculateNetCash === 'function') calculateNetCash();
    if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
    if (typeof refreshCustomerSales === 'function') await refreshCustomerSales();
    if (typeof window.renderUnifiedTable === 'function') window.renderUnifiedTable(1);
    if (typeof window.renderCustomersTable === 'function') window.renderCustomersTable();
  } catch (e) { console.warn('[ledger-sync] a screen refresh failed:', e && e.message); }
  triggerAutoSync();
}

export async function postLedgerLink(entry, target) {
  let link = null;
  if (target.kind === 'entity') link = await postEntity(entry, target);
  else if (target.kind === 'customer') link = await postCustomer(entry, target);
  else if (target.kind === 'expense') link = await postExpense(entry, target);
  if (link) await refreshViews();
  return link;
}

export async function checkRemoveLink(link) {
  if (!link || link.kind === 'calc') return '';
  if (link.kind === 'customer') return (link.saleId && (await getSaleBlockReason(link.saleId, 'customer'))) || '';
  const txs = ensureArray(await sqliteStore.get('transactions'));
  const tx = txs.find((t) => t && String(t.id) === String(link.txId));
  if (!tx) return '';
  const guard = await getPaymentTxDeleteBlockReason(tx, { allTxs: txs });
  return guard.block || '';
}

export async function removeLedgerLink(link) {
  if (!link || link.kind === 'calc') return;
  if (link.kind === 'customer') {
    const sales = ensureArray(await sqliteStore.get('sales'));
    const item = sales.find((s) => s && String(s.id) === String(link.saleId));
    if (item) {
      await detachChildPayment('customer', item, sales);
      await unifiedDelete('sales', sales.filter((s) => s && s.id !== item.id), item.id, { strict: true }, item);
      notifyDataChange('sales');
    }
  } else {
    const { transactions, inventory, expenses } = await loadCollections('transactions', 'inventory', 'expenses');
    const tx = transactions.find((t) => t && String(t.id) === String(link.txId));
    if (tx) {
      const groupId = (tx.isPayable || tx.expenseId) ? newGroupId('pay') : null;
      await _restorePayableFromDeletedTransaction(tx, transactions, inventory, { groupId });
      await deletePaymentTxWithLinks(tx, { groupId });
    } else if (link.expenseId) {
      const exp = expenses.find((e) => e && String(e.id) === String(link.expenseId));
      if (exp) await unifiedDelete('expenses', expenses.filter((e) => e && e.id !== exp.id), exp.id, { strict: true }, exp);
    }
    notifyDataChange(link.kind === 'expense' ? 'expenses' : 'payments');
  }
  await refreshViews();
}
