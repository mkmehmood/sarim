export const TARGET_KEYS = ['sales', 'rep', 'transactions', 'expenses', 'production', 'factory', 'clients', 'calculator', 'daily_ledger'];
export const VIEW_IDS = ['approvals', 'recycle-bin', 'store-manager', 'formula-store', 'daily-ledger', 'tab:sales', 'tab:rep', 'tab:prod', 'tab:calc', 'tab:factory', 'tab:payments'];
const TAB_FOR_KEY = { sales: 'sales', rep: 'rep', clients: 'rep', transactions: 'payments', expenses: 'payments', production: 'prod', factory: 'factory', calculator: 'calc' };

export function tabForKey(key) {
  return TAB_FOR_KEY[key] || 'sales';
}

export function isViewTarget(target) {
  return !!target && target.k === 'view';
}

export function parseTarget(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const i = raw.indexOf(':');
    if (i < 1) return null;
    return parseTarget({ k: raw.slice(0, i), id: raw.slice(i + 1) });
  }
  const k = raw.k != null ? String(raw.k) : '';
  const id = raw.id != null ? String(raw.id) : '';
  if (!id) return null;
  if (k === 'view') return VIEW_IDS.includes(id) ? { k, id } : null;
  if (!TARGET_KEYS.includes(k)) return null;
  return { k, id };
}

const VIEW_PLANS = {
  approvals: { type: 'transfer', screen: 'approvals-screen', prepare: '', card: '' },
  'recycle-bin': { type: 'call', fn: 'openRecycleBin' },
  'store-manager': { type: 'call', fn: 'openStoreManagerScreen' },
  'formula-store': { type: 'transfer', screen: 'formula-store-screen', prepare: 'openFormulaStore', card: '' },
  'daily-ledger': { type: 'transfer', screen: 'daily-ledger-screen', prepare: 'prepareDailyLedgerScreen', card: '' },
};

export function resolveView(target, record) {
  const id = target.id;
  if (target.k === 'view') {
    if (id.startsWith('tab:')) return { type: 'tab', tab: id.slice(4) };
    return VIEW_PLANS[id] || null;
  }
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
  if (target.k === 'calculator') return { type: 'calc', card: id };
  if (target.k === 'daily_ledger') return { type: 'transfer', screen: 'daily-ledger-screen', prepare: 'prepareDailyLedgerScreen', card: id };
  if (target.k === 'clients') {
    if (r.name) return { type: 'ledger', kind: 'rep', owner: String(r.name), row: '' };
    return { type: 'tab', tab: 'rep' };
  }
  return null;
}

export const LEDGER_SCREEN = { cust: 'customer-management-screen', rep: 'rep-customer-management-screen', ent: 'entity-details-screen' };
