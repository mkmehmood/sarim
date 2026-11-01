export const DEFAULT_BUSINESS_CATEGORIES = ['Raw Materials', 'Salaries & Labor', 'Rent & Lease', 'Electricity / Power', 'Maintenance & Repairs', 'Transport & Fuel', 'Tea & Refreshment', 'Packaging Supplies', 'Office Supplies', 'Taxes & Govt Fees', 'Marketing & Ads', 'Miscellaneous Business'];
export const DEFAULT_HOME_CATEGORIES = ['Groceries & Food', 'Home Electricity & Gas', 'Water & Maintenance', 'Home Rent', 'School / Tuition Fees', 'Medical & Healthcare', 'House Help & Maid', 'Clothing & Shopping', 'Mobile & Internet', 'Home Repairs', 'Gifts & Charity', 'Miscellaneous Home', 'Home', 'Kitchen Supplies', 'Personal & Family'];
export const DEFAULT_INCOME_CATEGORIES = ['Sales', 'Customer Payment', 'Recovery', 'Advance Received', 'Capital In', 'Commission', 'Loan Received', 'Other Income'];
export const DEFAULT_PAYMENT_MODES = ['Cash', 'Bank Transfer', 'Easypaisa', 'JazzCash', 'Cheque', 'Online Transfer', 'UPI', 'Debit Card', 'Credit Card'];
export const TYPE_LABEL = { IN: 'Cash In', OUT: 'Cash Out', TRANSFER: 'Transfer' };
const HOME_WORDS = ['home', 'grocer', 'school', 'tuition', 'maid', 'doctor', 'medical', 'clothing', 'personal', 'family', 'kitchen', 'house', 'gas', 'water', 'ration', 'sabzi', 'milk', 'child', 'domestic', 'food', 'shopping', 'charity', 'gift'];
const low = (v) => String(v == null ? '' : v).trim().toLowerCase();
export const isCashMode = (m) => ['cash', 'cash in hand', 'petty cash'].includes(low(m));
export const isBankMode = (m) => ['bank transfer', 'bank', 'bank_transfer', 'cheque', 'online'].includes(low(m));
export const isDefaultMode = (m) => isCashMode(m) || isBankMode(m);
export function normalizeType(t) {
  const v = String(t || '').toUpperCase();
  if (v === 'OUT' || v === 'CASH_OUT') return 'OUT';
  if (v === 'TRANSFER' || v === 'CASH_TRANSFER') return 'TRANSFER';
  return 'IN';
}
export function isHomeExpense(category, scope = '') {
  const s = String(scope || '').trim().toUpperCase();
  if (s.includes('HOME') || s.includes('PERSONAL')) return true;
  const c = low(category);
  if (!c) return false;
  return HOME_WORDS.some((w) => c.includes(w));
}
export function defaultCategory(type, scope) {
  if (type === 'OUT') return scope === 'HOME' ? 'Groceries & Food' : 'Raw Materials';
  if (type === 'TRANSFER') return 'Account Transfer';
  return 'Sales';
}
export function parseAmount(text) {
  const raw = String(text == null ? '' : text).replace(/\s/g, '');
  const cleaned = /^\d{1,3}(,\d{2,3})*,\d{3}(\.\d+)?$/.test(raw) ? raw.replace(/,/g, '') : raw.replace(/,/g, '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}
export function uniqCI(list) {
  const seen = new Set();
  const out = [];
  for (const v of list) {
    const t = String(v == null ? '' : v).trim();
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}
export function normalizeRow(r) {
  if (!r || !r.id) return null;
  const amount = Number(r.amount);
  if (!Number.isFinite(amount)) return null;
  const type = normalizeType(r.type);
  const mode = String(r.mode || '').trim() || 'Cash';
  const toMode = type === 'TRANSFER' ? (String(r.toMode || '').trim() || (low(mode) === 'cash' ? 'Bank Transfer' : 'Cash')) : '';
  return { ...r, id: String(r.id), type, amount, mode, toMode, category: String(r.category || '').trim(), scope: type === 'OUT' ? (String(r.scope || '').trim().toUpperCase() === 'HOME' ? 'HOME' : isHomeExpense(r.category, r.scope) ? 'HOME' : 'BUSINESS') : '', party: String(r.party || '').trim(), note: String(r.note || '').trim(), ref: String(r.ref || '').trim(), date: String(r.date || ''), timestamp: Number(r.timestamp) || 0 };
}
export function normalizeRows(list) {
  return (Array.isArray(list) ? list : []).map(normalizeRow).filter(Boolean);
}
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export function sortChronological(rows) {
  return rows.slice().sort((a, b) => cmp(a.date, b.date) || cmp(a.timestamp, b.timestamp) || cmp(a.id, b.id));
}
export function sortNewestFirst(rows) {
  return sortChronological(rows).reverse();
}
export function buildStatement(rows) {
  let running = 0;
  const map = new Map();
  for (const t of sortChronological(rows)) {
    const before = running;
    const impact = t.type === 'OUT' ? -t.amount : t.type === 'TRANSFER' ? 0 : t.amount;
    running += impact;
    map.set(t.id, { before, after: running, impact });
  }
  return map;
}
export function computeSummary(rows) {
  const s = { totalIn: 0, totalOut: 0, totalTransferred: 0, inCount: 0, outCount: 0, transferCount: 0, cash: 0, bank: 0, others: 0, othersCount: 0, byMode: {}, byCategory: {}, count: rows.length };
  const bump = (mode, amt) => {
    if (isCashMode(mode)) s.cash += amt;
    else if (isBankMode(mode)) s.bank += amt;
    else { s.others += amt; s.othersCount++; }
    s.byMode[mode] = (s.byMode[mode] || 0) + amt;
  };
  for (const t of rows) {
    if (t.type === 'OUT') {
      s.totalOut += t.amount;
      s.outCount++;
      bump(t.mode || 'Cash', -t.amount);
      const cat = t.category || 'Expense';
      s.byCategory[cat] = (s.byCategory[cat] || 0) + t.amount;
    } else if (t.type === 'TRANSFER') {
      s.totalTransferred += t.amount;
      s.transferCount++;
      const from = t.mode || 'Cash';
      bump(from, -t.amount);
      bump(t.toMode || (from === 'Cash' ? 'Bank Transfer' : 'Cash'), t.amount);
    } else {
      s.totalIn += t.amount;
      s.inCount++;
      bump(t.mode || 'Cash', t.amount);
      const cat = t.category || 'Sales';
      s.byCategory[cat] = (s.byCategory[cat] || 0) + t.amount;
    }
  }
  s.inHand = s.totalIn - s.totalOut;
  s.net = s.inHand;
  return s;
}
export function filterRows(rows, { query = '', type = 'ALL', mode = 'ALL' } = {}) {
  const q = low(query);
  return rows.filter((t) => {
    const isT = t.type === 'TRANSFER';
    const okSearch = !q || [t.party, t.note, t.ref, t.category, t.mode, t.toMode, t.scope].some((f) => low(f).includes(q)) || String(t.amount).includes(q);
    let okType = true;
    if (type === 'IN') okType = t.type === 'IN';
    else if (type === 'OUT') okType = t.type === 'OUT';
    else if (type === 'TRANSFER') okType = isT;
    else if (type === 'BUSINESS') okType = t.type === 'OUT' && !isHomeExpense(t.category, t.scope);
    else if (type === 'HOME') okType = t.type === 'OUT' && isHomeExpense(t.category, t.scope);
    let okMode = true;
    if (mode === 'CASH') okMode = isCashMode(t.mode) || (isT && isCashMode(t.toMode));
    else if (mode === 'BANK') okMode = isBankMode(t.mode) || (isT && isBankMode(t.toMode));
    else if (mode === 'OTHERS') okMode = !isDefaultMode(t.mode) || (isT && !isDefaultMode(t.toMode));
    else if (mode !== 'ALL') okMode = low(t.mode) === low(mode) || (isT && low(t.toMode) === low(mode));
    return okSearch && okType && okMode;
  });
}
export function buildLists(rows) {
  const outRows = rows.filter((t) => t.type === 'OUT');
  const inRows = rows.filter((t) => t.type === 'IN');
  const modes = rows.flatMap((t) => [t.mode, t.toMode]);
  return {
    business: uniqCI([...DEFAULT_BUSINESS_CATEGORIES, ...outRows.filter((t) => t.scope !== 'HOME').map((t) => t.category)]),
    home: uniqCI([...DEFAULT_HOME_CATEGORIES, ...outRows.filter((t) => t.scope === 'HOME').map((t) => t.category)]),
    income: uniqCI([...DEFAULT_INCOME_CATEGORIES, ...inRows.map((t) => t.category)]),
    modes: uniqCI([...DEFAULT_PAYMENT_MODES, ...modes]),
    parties: uniqCI(sortNewestFirst(rows).map((t) => t.party)).slice(0, 20)
  };
}
export function suggest(pool, typed, limit = 8) {
  const q = low(typed);
  const list = q ? pool.filter((v) => low(v).includes(q) && low(v) !== q) : pool;
  return { matches: list.slice(0, limit), isNew: !!q && !pool.some((v) => low(v) === q) };
}
export function canonicalMode(value, modes) {
  const v = String(value || '').trim();
  const hit = modes.find((m) => low(m) === low(v));
  return hit || v;
}
export function buildEntry(form, prev, ctx) {
  const amount = parseAmount(form.amount);
  if (amount === null || amount <= 0) return { ok: false, error: 'Please enter a valid amount greater than 0.' };
  const type = normalizeType(form.type);
  const isT = type === 'TRANSFER';
  const isOut = type === 'OUT';
  const modes = ctx.modes || DEFAULT_PAYMENT_MODES;
  const mode = canonicalMode(String(form.mode || '').trim() || 'Cash', modes);
  const toMode = isT ? canonicalMode(String(form.toMode || '').trim() || 'Bank Transfer', modes) : '';
  if (isT && low(mode) === low(toMode)) return { ok: false, error: 'Source and destination payment modes must be different.' };
  const typed = String(form.category || '').trim();
  const home = isHomeExpense(typed, form.scope);
  const scope = isOut ? (home || String(form.scope).toUpperCase() === 'HOME' ? 'HOME' : 'BUSINESS') : '';
  const category = typed || (isT ? 'Account Transfer' : defaultCategory(type, scope));
  const entry = {
    id: prev ? prev.id : ctx.id,
    type,
    amount: Math.round(amount * 100) / 100,
    category,
    scope,
    mode,
    toMode,
    party: isT ? '' : String(form.party || '').trim(),
    note: String(form.note || '').trim(),
    ref: String(form.ref || '').trim(),
    date: form.date || ctx.today,
    timestamp: prev ? prev.timestamp : ctx.now,
    updatedAt: ctx.now
  };
  return { ok: true, entry };
}
export function savedMessage(entry, isEdit, fmt) {
  if (isEdit) return 'Transaction updated successfully.';
  if (entry.type === 'TRANSFER') return `Transferred ${fmt(entry.amount)}: ${entry.mode} ➔ ${entry.toMode}`;
  const tag = entry.type === 'OUT' ? ` (${entry.scope === 'HOME' ? 'Home Expense' : 'Business Expense'})` : '';
  return `${TYPE_LABEL[entry.type]}${tag} saved.`;
}
export function impactText(t, fmt) {
  return t.type === 'TRANSFER' ? `⇆ ${fmt(t.amount)}` : t.type === 'OUT' ? `- ${fmt(t.amount)}` : `+ ${fmt(t.amount)}`;
}
export function voucherText(t, st, fmt) {
  const out = t.type === 'OUT';
  const label = t.type === 'TRANSFER' ? 'CASH / ACCOUNT TRANSFER' : out ? `CASH OUT (${t.scope === 'HOME' || isHomeExpense(t.category) ? 'HOME EXPENSE' : 'BUSINESS EXPENSE'})` : 'CASH IN (INCOME / SALES)';
  const lines = ['=== CASHBOOK TRANSACTION STATEMENT VOUCHER ===', `Type: ${label}`, `Amount: ${fmt(t.amount)}`];
  if (st) lines.push(`Balance Before: ${fmt(st.before)}`, `Transaction Impact: ${impactText(t, fmt)}`, `Balance After:  ${fmt(st.after)}`);
  if (t.type === 'TRANSFER') lines.push(`From Channel: ${t.mode}`, `To Channel:   ${t.toMode}`);
  else lines.push(`Category: ${t.category}`, `Payment Mode: ${t.mode}`);
  if (t.party) lines.push(`Party / Name: ${t.party}`);
  if (t.ref) lines.push(`Ref / Bill No: ${t.ref}`);
  if (t.note) lines.push(`Remarks: ${t.note}`);
  lines.push(`Date: ${t.date}`, '==============================================');
  return lines.join('\n');
}
export function auditText(summary, filtered, stmt, fmt) {
  const lines = ['=== DAILY LEDGER & CASHBOOK BANK STATEMENT ===', `Total Entries: ${summary.count}`, '--------------------------------------', `TOTAL CASH IN HAND: ${fmt(summary.inHand)}`, `Cash Mode Balance:  ${fmt(summary.cash)}`, `Bank Mode Balance:  ${fmt(summary.bank)}`, `Others Balance:     ${fmt(summary.others)}`, '--------------------------------------', `TOTAL CASH IN:      ${fmt(summary.totalIn)} (${summary.inCount} txns)`, `TOTAL CASH OUT:     ${fmt(summary.totalOut)} (${summary.outCount} txns)`];
  if (summary.transferCount > 0) lines.push(`TOTAL TRANSFERRED:  ${fmt(summary.totalTransferred)} (${summary.transferCount} transfers)`);
  lines.push(`NET BALANCE:        ${summary.net >= 0 ? '+' : '-'}${fmt(Math.abs(summary.net))}`, '--------------------------------------');
  const modes = Object.entries(summary.byMode);
  if (modes.length) {
    lines.push('PAYMENT CHANNEL BREAKDOWN:');
    modes.forEach(([m, n]) => lines.push(`• ${m}: ${n >= 0 ? '+' : '-'}${fmt(Math.abs(n))}`));
    lines.push('--------------------------------------');
  }
  const cats = Object.entries(summary.byCategory);
  if (cats.length) {
    lines.push('CATEGORY BREAKDOWN:');
    cats.forEach(([c, a]) => lines.push(`• ${c}: ${fmt(a)}`));
    lines.push('--------------------------------------');
  }
  lines.push(`TRANSACTION STATEMENT LOG (${filtered.length} records):`);
  filtered.forEach((t, i) => {
    const sign = t.type === 'TRANSFER' ? '⇆' : t.type === 'OUT' ? '-' : '+';
    const party = t.party ? ` | ${t.party}` : '';
    const tag = t.type === 'OUT' ? ` [${t.scope === 'HOME' || isHomeExpense(t.category) ? 'Home' : 'Biz'}]` : '';
    const via = t.type === 'TRANSFER' ? `${t.mode} ➔ ${t.toMode}` : t.mode;
    const st = stmt.get(t.id);
    lines.push(`${i + 1}. [${t.date}] ${t.category}${party}${tag} : ${sign} ${fmt(t.amount)} (${via})${st ? ` | Bal After: ${fmt(st.after)}` : ''}`);
  });
  lines.push('==============================================');
  return lines.join('\n');
}
export function modeBalance(rows, mode) {
  const byMode = computeSummary(rows).byMode;
  const key = Object.keys(byMode).find((m) => low(m) === low(mode));
  return key ? byMode[key] : 0;
}
export function transferPrompt(rows, entry, fmt) {
  const balance = modeBalance(rows, entry.mode);
  const after = balance - entry.amount;
  const insufficient = after < 0;
  const lines = [`Transfer ${fmt(entry.amount)} from ${entry.mode} ➔ ${entry.toMode}?`, 'This only moves money between channels. Cash in hand does not change.'];
  if (insufficient) lines.push(`Warning: ${entry.mode} balance is ${balance < 0 ? '-' : ''}${fmt(Math.abs(balance))}. This transfer will leave it at -${fmt(Math.abs(after))}.`);
  return { message: lines.join('\n\n'), title: insufficient ? 'Insufficient Channel Balance' : 'Confirm Transfer', insufficient, balance, after };
}
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
export function checkPeriod(from, to) {
  if (!ISO_DAY.test(String(from || ''))) return 'Select the From date from the calendar.';
  if (!ISO_DAY.test(String(to || ''))) return 'Select the To date from the calendar.';
  if (from > to) return 'The From date cannot be after the To date.';
  return '';
}
export function periodStatement(rows, from, to) {
  const impactOf = (t) => (t.type === 'OUT' ? -t.amount : t.type === 'TRANSFER' ? 0 : t.amount);
  const ordered = sortChronological(rows);
  const opening = ordered.filter((t) => t.date < from).reduce((n, t) => n + impactOf(t), 0);
  let running = opening;
  let totalIn = 0;
  let totalOut = 0;
  const lines = ordered.filter((t) => t.date >= from && t.date <= to).map((t) => {
    const impact = impactOf(t);
    running += impact;
    if (t.type === 'IN') totalIn += t.amount;
    if (t.type === 'OUT') totalOut += t.amount;
    return { ...t, impact, balance: running };
  });
  return { from, to, opening, closing: running, totalIn, totalOut, count: lines.length, lines };
}
