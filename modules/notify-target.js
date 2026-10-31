export const EDIT_KIND = { sales: 'sale', rep: 'repsale', transactions: 'payment', expenses: 'expense', production: 'prod' };

export function parseTarget(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const i = raw.indexOf(':');
    if (i < 1) return null;
    return parseTarget({ k: raw.slice(0, i), id: raw.slice(i + 1) });
  }
  const k = raw.k != null ? String(raw.k) : '';
  const id = raw.id != null ? String(raw.id) : '';
  if (!EDIT_KIND[k] || !id) return null;
  return { k, id };
}

export function resolveEdit(target, record) {
  if (target.k === 'transactions' && record.isTransfer === true && record.transferPairId) {
    return { kind: 'paytransfer', id: record.transferPairId };
  }
  if (target.k === 'production' && record.isTransfer === true && record.transferPairId) {
    return { kind: 'stocktransfer', id: record.transferPairId };
  }
  return { kind: EDIT_KIND[target.k], id: target.id };
}
