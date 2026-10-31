export const REMOTE_KEYS = ['rep', 'sales', 'transactions', 'expenses', 'production', 'factory', 'clients'];
export const REMOTE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const REMOTE_MAX_NOTIFICATIONS = 5;

function authorOf(r) {
  return String(r.managedBy || r.createdBy || '').trim();
}

export function describeRemote(key, r, fmt, now = Date.now()) {
  if (!r || !r.id || r.isMerged === true || String(r.id) === '_placeholder_') return null;
  const created = Number(r.createdAt || r.timestamp || 0);
  if (!created || now - created > REMOTE_WINDOW_MS) return null;
  if (key === 'rep') {
    const rep = r.salesRep;
    if (!rep || rep === 'NONE' || rep === 'admin') return null;
    return r.isCollection
      ? { title: 'New collection', body: `${rep} collected ${fmt(r.totalValue)} from ${r.customerName || 'customer'}` }
      : { title: 'New sale', body: `${rep} sold to ${r.customerName || 'customer'} — ${fmt(r.totalValue)}` };
  }
  if (key === 'clients') {
    const rep = r.salesRep;
    if (!rep || rep === 'NONE' || rep === 'admin' || !r.name) return null;
    return { title: 'New customer', body: `${rep} added customer ${r.name}` };
  }
  const who = authorOf(r);
  if (!who) return null;
  if (key === 'sales') return { title: 'New sale', body: `${who} added a sale: ${r.customerName || 'customer'} — ${fmt(r.totalValue)}` };
  if (key === 'transactions') {
    if (r.isExpense) return null;
    return { title: 'New payment', body: `${who} recorded a payment ${r.type === 'IN' ? 'received from' : 'paid to'} ${r.entityName || 'entity'} — ${fmt(r.amount)}` };
  }
  if (key === 'expenses') return { title: 'New expense', body: `${who} added an expense: ${r.name || r.description || 'expense'} — ${fmt(r.amount)}` };
  if (key === 'production') {
    const kg = Math.abs(Number(r.net) || 0);
    if (r.isTransfer) return r.transferDirection === 'out' ? { title: 'Stock transfer', body: `${who} transferred ${kg} kg` } : null;
    if (r.isReturn) return { title: 'Stock return', body: `${who} returned ${kg} kg` };
    return { title: 'New production', body: `${who} recorded ${kg} kg produced` };
  }
  if (key === 'factory') {
    const units = Number(r.units) || 0;
    return { title: 'New factory entry', body: `${who} added a factory entry${units ? ` — ${units} units` : ''}${r.formulaName ? ` (${r.formulaName})` : ''}` };
  }
  return null;
}

export function findRemoteActivity(localBatch, merged, fmt, now = Date.now()) {
  const items = [];
  const get = (src, key) => {
    const v = src && typeof src.get === 'function' ? src.get(key) : (src ? src[key] : null);
    return Array.isArray(v) ? v : [];
  };
  for (const key of REMOTE_KEYS) {
    const local = get(localBatch, key);
    if (local.length === 0) continue;
    const known = new Set(local.map(r => String(r && r.id)));
    for (const r of get(merged, key)) {
      if (!r || known.has(String(r.id))) continue;
      const item = describeRemote(key, r, fmt, now);
      if (item) items.push({ ...item, id: r.id });
    }
  }
  return items;
}

export function planNotifications(items) {
  const shown = items.slice(0, REMOTE_MAX_NOTIFICATIONS).map(i => ({ title: i.title, body: i.body, tag: 'tx-' + i.id, key: i.id }));
  if (items.length > REMOTE_MAX_NOTIFICATIONS) {
    shown.push({
      title: 'More new activity',
      body: `${items.length - REMOTE_MAX_NOTIFICATIONS} more records arrived from your team. Open the app to see them all.`,
      tag: 'tx-more-remote', key: 'tx-more-remote',
    });
  }
  return shown;
}
