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

export function resolutionNotice(p, status, fmt) {
  const s = summarizePending(p, fmt);
  return status === 'approved'
    ? { title: 'Approved', body: `Your ${s.title} was approved. ${s.body}` }
    : { title: 'Discarded by admin', body: `Your ${s.title} was discarded and removed from this device. ${s.body}` };
}

const DEFAULT_CTX = {
  fmt: (n) => String(n),
  num: (n) => String(Number(n) || 0),
  store: (c) => String(c || ''),
  time: (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  when: (date, time) => [date, time].filter(Boolean).join(' '),
};

const ctxOf = (c) => ({ ...DEFAULT_CTX, ...(c || {}) });
const nz = (v) => Number(v) || 0;

function dataOf(p) {
  return p.data || p._cloud || {};
}

export function materialIds(p) {
  const list = dataOf(p).materialsUsed;
  return Array.isArray(list) ? list.map(m => String(m && m.id)).filter(Boolean) : [];
}

export function groupPending(items) {
  const byDoc = new Map(items.map(p => [`${p.collection}:${p.docId}`, p]));
  const claimed = new Set();
  const groups = [];
  items.filter(p => p.collection === 'factory').forEach((main) => {
    claimed.add(main.id);
    const children = [];
    materialIds(main).forEach((id) => {
      const kid = byDoc.get('inventory:' + id);
      if (kid && !claimed.has(kid.id)) { claimed.add(kid.id); children.push(kid); }
    });
    groups.push({ id: main.id, main, children });
  });
  items.forEach((p) => { if (!claimed.has(p.id)) groups.push({ id: p.id, main: p, children: [] }); });
  const order = new Map(items.map((p, i) => [p.id, i]));
  return groups.sort((a, b) => order.get(a.main.id) - order.get(b.main.id));
}

export function groupMembers(group) {
  return [group.main, ...group.children];
}

function saleTitle(d) {
  if (d.paymentType === 'COLLECTION') return 'Collection';
  if (d.paymentType === 'PARTIAL_PAYMENT') return 'Partial payment';
  if (d.paymentType === 'CREDIT') return 'Credit sale';
  if (d.isRepReturn || nz(d.returnedQty) > 0) return 'Return';
  return 'Cash sale';
}

function unitPrice(d) {
  const up = nz(d.unitPrice);
  if (up > 0) return up;
  return nz(d.quantity) > 0 ? nz(d.totalValue) / nz(d.quantity) : 0;
}

export function recordTitle(collection, d) {
  if (collection === 'rep' || collection === 'sales') return saleTitle(d);
  if (collection === 'transactions') return d.type === 'IN' ? 'Payment received' : 'Payment made';
  if (collection === 'production') return d.isReturn ? 'Stock return' : (d.isTransfer ? 'Stock transfer' : 'Production');
  if (collection === 'factory') return 'Factory production';
  return labelFor(collection);
}

function recordAmount(collection, d, c) {
  if (collection === 'rep' || collection === 'sales') {
    if (d.paymentType === 'COLLECTION') return c.fmt(d.collectedAmount != null ? nz(d.collectedAmount) : nz(d.totalValue));
    return c.fmt(nz(d.totalValue));
  }
  if (collection === 'transactions' || collection === 'expenses') return c.fmt(nz(d.amount));
  if (collection === 'production') return `${c.num(Math.abs(nz(d.net)))} kg`;
  if (collection === 'factory') return `${c.num(nz(d.units))} units`;
  if (collection === 'inventory') return d.totalPayable != null ? c.fmt(nz(d.totalPayable)) : '';
  return '';
}

export function recordLines(collection, d, c) {
  const lines = [];
  const when = c.when(d.date, d.time);
  if (when) lines.push(when);
  if (collection === 'rep' || collection === 'sales') {
    if (d.customerName) lines.push(d.customerName);
    if (d.paymentType !== 'COLLECTION' && d.paymentType !== 'PARTIAL_PAYMENT') {
      lines.push(`${c.num(d.quantity)} kg @ ${c.fmt(unitPrice(d))} = ${c.fmt(nz(d.totalValue))}`);
      if (d.supplyStore) lines.push(`Supply: ${c.store(d.supplyStore)}`);
    }
    if (d.salesRep && d.salesRep !== 'NONE') lines.push(`Sales rep: ${d.salesRep}`);
  } else if (collection === 'transactions') {
    if (d.entityName) lines.push(d.entityName);
    if (d.description || d.notes) lines.push(d.description || d.notes);
  } else if (collection === 'expenses') {
    if (d.name || d.description) lines.push(d.name || d.description);
    if (d.category) lines.push(`Category: ${d.category}`);
  } else if (collection === 'production') {
    lines.push(`Net ${c.num(Math.abs(nz(d.net)))} kg`);
    if (d.store) lines.push(`Store: ${c.store(d.store)}`);
  } else if (collection === 'factory') {
    lines.push(`${c.num(nz(d.units))} units${d.formulaName ? ` · ${d.formulaName}` : ''}`);
    if (d.store) lines.push(`Store: ${c.store(d.store)}`);
    if (nz(d.totalCost) > 0) lines.push(`Total cost ${c.fmt(nz(d.totalCost))}`);
  } else if (collection === 'inventory') {
    if (d.name) lines.push(d.name);
    lines.push(`${c.num(nz(d.quantity))} kg in stock${nz(d.cost) > 0 ? ` @ ${c.fmt(nz(d.cost))}` : ''}`);
    if (d.supplierName) lines.push(`Supplier: ${d.supplierName}`);
  } else {
    const who = d.name || d.customerName || d.entityName || d.description;
    if (who) lines.push(who);
  }
  if (d.notes && collection !== 'transactions') lines.push(String(d.notes));
  return lines;
}

function materialLines(group, c) {
  const used = dataOf(group.main).materialsUsed;
  if (Array.isArray(used) && used.length) {
    return used.map(m => `${m.name || 'Material'} — ${c.num(nz(m.quantity))} kg`);
  }
  return group.children.map(k => (k.data && k.data.name) || 'Material');
}

export function sheetModel(group, ctx) {
  const c = ctxOf(ctx);
  const p = group.main;
  const d = dataOf(p);
  const submitter = describeSubmitter(p);
  const kind = p.action === 'delete' ? 'Delete' : (p.isEdit ? 'Change' : 'New');
  const title = recordTitle(p.collection, d);
  const lines = Object.keys(d).length ? recordLines(p.collection, d, c) : [`Record ${p.docId.slice(0, 8)}`];
  const model = {
    title: `${kind === 'Delete' ? 'Delete ' : ''}${title}`,
    amount: Object.keys(d).length ? recordAmount(p.collection, d, c) : '',
    lines,
    submittedLine: `${kind === 'Change' ? 'Change' : kind === 'Delete' ? 'Deletion' : 'New entry'} from ${submitter}`,
    sectionTitle: '',
    sectionLines: [],
    note: p.action === 'delete'
      ? 'Approving removes this record for everyone.'
      : 'Approving adds it to the shared records for everyone.',
    count: groupMembers(group).length,
  };
  if (p.collection === 'factory') {
    const mats = materialLines(group, c);
    model.sectionTitle = `Raw materials used (${mats.length})`;
    model.sectionLines = mats;
    if (group.children.length) model.note += ` The ${group.children.length} stock update${group.children.length === 1 ? '' : 's'} above ${group.children.length === 1 ? 'is' : 'are'} included.`;
  }
  return model;
}

export function groupRowSummary(group, ctx) {
  const m = sheetModel(group, ctx);
  const extra = group.main.collection === 'factory' && group.children.length ? ` · ${group.children.length} materials` : '';
  return { title: m.title, body: [m.amount, m.lines[1] || m.lines[0]].filter(Boolean).join(' — ') + extra };
}

export function bulkSheetModel(kind, groups) {
  const people = [...new Set(groups.map(g => describeSubmitter(g.main)))];
  const records = groups.reduce((n, g) => n + groupMembers(g).length, 0);
  return {
    title: kind === 'approve' ? `Approve all (${groups.length})` : `Discard all (${groups.length})`,
    lines: groups.slice(0, 8).map(g => {
      const m = sheetModel(g, {});
      return `${m.title}${m.amount ? ' — ' + m.amount : ''}`;
    }).concat(groups.length > 8 ? [`+ ${groups.length - 8} more`] : []),
    submittedLine: `From ${people.join(', ')}`,
    note: kind === 'approve'
      ? `${records} record${records === 1 ? '' : 's'} become part of the shared records for everyone.`
      : `Their devices will undo ${records} record${records === 1 ? '' : 's'}. This cannot be reversed.`,
    confirmText: kind === 'approve' ? 'Approve all' : 'Discard all',
  };
}

function msOf(t) {
  if (typeof t === 'number') return t;
  if (t && typeof t.toMillis === 'function') return t.toMillis();
  if (t && typeof t.seconds === 'number') return t.seconds * 1000;
  return 0;
}

function localDayKey(ms) {
  const d = new Date(ms || Date.now());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function isMoneyIn(collection, d) {
  if (collection === 'rep' || collection === 'sales') return d.paymentType === 'COLLECTION' || d.paymentType === 'PARTIAL_PAYMENT';
  return collection === 'transactions' && d.type === 'IN';
}

function whoOf(d) {
  return String(d.customerName || d.entityName || d.name || '').trim();
}

function rowDetail(collection, d, c) {
  if (collection === 'rep' || collection === 'sales') {
    if (d.paymentType === 'COLLECTION' || d.paymentType === 'PARTIAL_PAYMENT') return 'Payment received';
    const store = d.supplyStore ? ` · ${c.store(d.supplyStore)}` : '';
    return `${c.num(d.quantity)} kg @ ${c.fmt(unitPrice(d))}${store}`;
  }
  if (collection === 'transactions') return String(d.description || d.notes || '');
  if (collection === 'expenses') return String(d.category || d.description || '');
  if (collection === 'production') return `Net ${c.num(Math.abs(nz(d.net)))} kg${d.store ? ` · ${c.store(d.store)}` : ''}`;
  if (collection === 'factory') return `${c.num(nz(d.units))} units${d.formulaName ? ` · ${d.formulaName}` : ''}`;
  if (collection === 'inventory') return `${c.num(nz(d.quantity))} kg in stock`;
  return '';
}

export function ledgerRow(group, ctx) {
  const c = ctxOf(ctx);
  const p = group.main;
  const d = dataOf(p);
  const has = Object.keys(d).length > 0;
  const typeTitle = recordTitle(p.collection, d);
  const who = has ? whoOf(d) : '';
  const rIn = has && isMoneyIn(p.collection, d);
  const credit = has && (p.collection === 'rep' || p.collection === 'sales') && d.paymentType === 'CREDIT';
  const ms = msOf(p.submittedAt);
  const dateKey = has && /^\d{4}-\d{2}-\d{2}/.test(String(d.date || '')) ? String(d.date).slice(0, 10) : localDayKey(ms);
  const detail = has ? rowDetail(p.collection, d, c) : '';
  const extra = p.collection === 'factory' && group.children.length ? ` · ${group.children.length} materials` : '';
  const time = ms ? c.time(ms) : '';
  const submitter = describeSubmitter(p);
  const tag = p.action === 'delete'
    ? '<span class="badge badge-tint is-bad">Delete</span>'
    : (p.isEdit ? '<span class="badge badge-tint">Change</span>' : '');
  return {
    id: group.id,
    dkey: dateKey,
    ms,
    rKind: rIn ? 'in' : (credit ? 'cr' : 'cash'),
    rIn,
    title: who || typeTitle,
    sub: [who ? typeTitle : '', detail].filter(Boolean).join(' · ') + extra,
    amount: has ? recordAmount(p.collection, d, c) : '',
    tag,
    byline: [submitter, time].filter(Boolean).join(' · '),
    submitter,
  };
}

export function ledgerSheet(group, ctx) {
  const c = ctxOf(ctx);
  const m = sheetModel(group, c);
  const p = group.main;
  const d = dataOf(p);
  const has = Object.keys(d).length > 0;
  const who = has ? whoOf(d) : '';
  const typeTitle = recordTitle(p.collection, d);
  const kind = p.action === 'delete' ? 'Delete' : (p.isEdit ? 'Change' : 'New');
  const lines = m.lines.filter((l) => l !== who);
  return {
    title: who || m.title,
    amtText: m.amount,
    rIn: has && isMoneyIn(p.collection, d),
    lines,
    typeLine: who ? typeTitle : '',
    sectionTitle: m.sectionTitle,
    sectionLines: m.sectionLines,
    stripLabel: 'Waiting for approval',
    stripText: `${kind} \u00b7 ${describeSubmitter(p)}`,
    note: m.note,
  };
}
