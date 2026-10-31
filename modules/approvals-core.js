export const GATED_COLLECTIONS = [
  'production', 'sales', 'rep', 'clients', 'customers', 'calculator',
  'inventory', 'factory', 'entities', 'transactions', 'expenses', 'returns',
];

export const CONFIG_COLLECTIONS = ['settings', 'stores', 'formulas', 'categories', 'daily_ledger', 'field_expense_categories', 'commission_categories'];

const LABELS = {
  rep: 'Sale', sales: 'Sale', transactions: 'Payment', expenses: 'Expense', production: 'Production entry',
  factory: 'Factory entry', clients: 'Customer', customers: 'Customer', inventory: 'Raw material',
  entities: 'Entity', returns: 'Return', calculator: 'Calculation',
};

export function isGatedCollection(name) {
  return GATED_COLLECTIONS.includes(name);
}

export function labelFor(collection) {
  return LABELS[collection] || 'Record';
}

export function pendingId(collection, docId) {
  return `${collection}__${String(docId).replace(/\//g, '_')}`;
}

export function buildPendingDoc({ collection, docId, action, data, who, now, isEdit }) {
  const doc = {
    id: pendingId(collection, docId),
    collection,
    docId: String(docId),
    action: action === 'delete' ? 'delete' : 'set',
    data: action === 'delete' ? null : (data || {}),
    isEdit: !!isEdit,
    status: 'pending',
    submittedBy: { uid: who.uid, name: who.name || '', email: who.email || '' },
    submittedAt: now,
  };
  doc.summary = summarizePending(doc, (n) => String(n));
  return doc;
}

function amountText(d, fmt) {
  const amt = d.totalValue != null ? d.totalValue : d.amount;
  if (amt != null && amt !== '' && !Number.isNaN(Number(amt))) return fmt(amt);
  if (d.net != null && !Number.isNaN(Number(d.net))) return `${Math.abs(Number(d.net))} kg`;
  if (d.units != null && Number(d.units)) return `${Number(d.units)} units`;
  return '';
}

export function summarizePending(p, fmt) {
  const d = p.data || {};
  const label = labelFor(p.collection);
  const who = d.customerName || d.entityName || d.name || d.description || d.formulaName || '';
  const parts = [who, amountText(d, fmt)].filter(Boolean);
  if (p.action === 'delete') return { title: `Delete ${label.toLowerCase()}`, body: `Remove ${label.toLowerCase()} ${p.docId.slice(0, 8)}` };
  return {
    title: `${p.isEdit ? 'Change' : 'New'} ${label.toLowerCase()}`,
    body: parts.join(' — ') || label,
  };
}

export function describeSubmitter(p) {
  const s = p.submittedBy || {};
  return s.name || s.email || 'A team member';
}

export function pendingSummaryLine(items) {
  const n = items.length;
  if (n === 0) return 'Nothing is waiting for approval.';
  const people = [...new Set(items.map(describeSubmitter))];
  const who = people.length <= 2 ? people.join(' and ') : `${people.slice(0, 2).join(', ')} and ${people.length - 2} more`;
  return `${n} action${n === 1 ? '' : 's'} from ${who} waiting for approval.`;
}

export function groupBySubmitter(items) {
  const map = new Map();
  items.forEach((p) => {
    const key = describeSubmitter(p);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(p);
  });
  return [...map.entries()].map(([name, list]) => ({ name, items: list }));
}

export function approveConfirm(p, fmt) {
  const s = summarizePending(p, fmt);
  const by = describeSubmitter(p);
  const outcome = p.action === 'delete'
    ? 'The record will be deleted for everyone.'
    : 'It becomes part of the shared records for everyone.';
  return {
    title: p.action === 'delete' ? 'Approve Deletion' : 'Approve Action',
    confirmText: p.action === 'delete' ? 'Approve Delete' : 'Approve',
    danger: p.action === 'delete',
    message: `${s.title[0].toUpperCase()}${s.title.slice(1)} from ${by}\n\n${s.body}\n\n${outcome}`,
  };
}

export function discardConfirm(p, fmt) {
  const s = summarizePending(p, fmt);
  const by = describeSubmitter(p);
  return {
    title: 'Discard Action',
    confirmText: 'Discard',
    danger: true,
    message: `Discard this ${s.title} from ${by}?\n\n${s.body}\n\n${by}'s device will undo it. This cannot be reversed.`,
  };
}

export function bulkConfirm(kind, items) {
  const n = items.length;
  const people = [...new Set(items.map(describeSubmitter))].join(', ');
  if (kind === 'approve') {
    return {
      title: 'Approve All',
      confirmText: `Approve ${n}`,
      danger: false,
      message: `Approve all ${n} waiting action${n === 1 ? '' : 's'}?\n\nFrom: ${people}\n\nEvery one becomes part of the shared records.`,
    };
  }
  return {
    title: 'Discard All',
    confirmText: `Discard ${n}`,
    danger: true,
    message: `Discard all ${n} waiting action${n === 1 ? '' : 's'}?\n\nFrom: ${people}\n\nTheir devices will undo them. This cannot be reversed.`,
  };
}

export function resolutionNotice(p, status, fmt) {
  const s = summarizePending(p, fmt);
  return status === 'approved'
    ? { title: 'Approved', body: `Your ${s.title} was approved. ${s.body}` }
    : { title: 'Discarded by admin', body: `Your ${s.title} was discarded and removed from this device. ${s.body}` };
}
