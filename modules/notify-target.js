export const TARGET_KEYS = ['sales', 'rep', 'transactions', 'expenses', 'production', 'factory', 'clients'];

export function parseTarget(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const i = raw.indexOf(':');
    if (i < 1) return null;
    return parseTarget({ k: raw.slice(0, i), id: raw.slice(i + 1) });
  }
  const k = raw.k != null ? String(raw.k) : '';
  const id = raw.id != null ? String(raw.id) : '';
  if (!TARGET_KEYS.includes(k) || !id) return null;
  return { k, id };
}

export function resolveView(target, record) {
  const id = target.id;
  const r = record || {};
  if (target.k === 'sales' || target.k === 'rep') {
    const kind = target.k === 'rep' ? 'rep' : 'cust';
    if (r.customerName) return { type: 'ledger', kind, owner: String(r.customerName), row: id };
    return { type: 'tab', tab: target.k === 'rep' ? 'rep' : 'sales' };
  }
  if (target.k === 'transactions') {
    if (r.isTransfer === true && r.transferPairId) return { type: 'transfer', screen: 'payment-transfer-screen', prepare: 'prepareEntityTransferScreen', card: String(r.transferPairId) };
    if (r.entityId) return { type: 'ledger', kind: 'ent', owner: String(r.entityId), row: id };
    return { type: 'tab', tab: 'payments' };
  }
  if (target.k === 'expenses') return { type: 'expense', expenseId: id };
  if (target.k === 'production') {
    if (r.isTransfer === true && r.transferPairId) return { type: 'transfer', screen: 'stock-transfer-screen', prepare: 'prepareStockTransferScreen', card: String(r.transferPairId) };
    return { type: 'prod', card: id };
  }
  if (target.k === 'factory') return { type: 'factory', card: id };
  if (target.k === 'clients') {
    if (r.name) return { type: 'ledger', kind: 'rep', owner: String(r.name), row: '' };
    return { type: 'tab', tab: 'rep' };
  }
  return null;
}

export const LEDGER_SCREEN = { cust: 'customer-management-screen', rep: 'rep-customer-management-screen', ent: 'entity-details-screen' };
