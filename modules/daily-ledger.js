import { formatDayMonthYear } from './date-format.js';
import { sqliteStore, esc, fmtAmt, generateUUID, localDateStr } from './business.js';
import { openDialog, showGlassConfirm } from './dialog.js';
import { triggerAutoSync, loadScript } from './utilities-core.js';
import { BRAND_LOGO_JPEG_BASE64 } from './constants.js';
import { mergeRestored, trashRecord } from './store-recycle.js';
import { TYPE_LABEL, buildEntry, buildLists, buildStatement, checkPeriod, computeSummary, defaultCategory, filterRows, impactText, isHomeExpense, normalizeRows, parseAmount, periodStatement, savedMessage, sortNewestFirst, transferPrompt, voucherText } from './ledger-core.js';
const KEY = 'daily_ledger';
const TS_KEY = 'daily_ledger_timestamp';
const state = { type: 'IN', editId: '', editCategory: '', editScope: 'BUSINESS', query: '', pdfFrom: '', pdfTo: '' };
let _rows = [];
let _stmt = new Map();
let _lists = buildLists([]);
let _loaded = false;
let _dialogHook = null;
const el = (id) => document.getElementById(id);
const toast = (msg, type) => { if (typeof window.showToast === 'function') window.showToast(msg, type); };
const signed = (n) => `${n >= 0 ? '+ ' : '- '}${fmtAmt(Math.abs(n))}`;
const shortDate = (d) => {
  const t = new Date(`${d}T00:00:00`);
  return Number.isFinite(t.getTime()) ? formatDayMonthYear(t) : String(d || '');
};
async function load() {
  _rows = normalizeRows(await sqliteStore.get(KEY));
  _stmt = buildStatement(_rows);
  _lists = buildLists(_rows);
  _loaded = true;
  return _rows;
}
async function persist() {
  await sqliteStore.setBatch([[KEY, _rows], [TS_KEY, Date.now()]]);
  if (typeof triggerAutoSync === 'function') triggerAutoSync();
}
function markGroup(selector, attr, value) {
  document.querySelectorAll(selector).forEach((b) => {
    const on = b.getAttribute(attr) === value;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
function syncForm() {
  markGroup('[data-dl-type]', 'data-dl-type', state.type);
  const isT = state.type === 'TRANSFER';
  const isOut = state.type === 'OUT';
  el('dl-party-wrap').classList.toggle('d-none', isT);
  el('dl-to-wrap').classList.toggle('d-none', !isT);
  el('dl-from-label').textContent = isT ? 'From Channel (Source)' : 'Payment Channel / Mode';
  el('dl-form-title').textContent = state.editId ? 'Edit Record' : (isT ? 'Transfer Between Channels' : 'Add Entry');
  el('btn-save-daily-ledger').textContent = state.editId ? 'Update Entry' : (isT ? 'Record Transfer' : isOut ? 'Add Cash Out' : 'Add Cash In');
  el('btn-cancel-daily-ledger').classList.toggle('d-none', !state.editId);
}
function renderSummary() {
  const s = computeSummary(_rows);
  el('dl-hero-amt').textContent = fmtAmt(s.inHand);
  el('dl-bal-cash').textContent = fmtAmt(s.cash);
  el('dl-bal-bank').textContent = fmtAmt(s.bank);
  el('dl-bal-other').textContent = fmtAmt(s.others);
  el('dl-sum-in').textContent = fmtAmt(s.totalIn);
  el('dl-sum-out').textContent = fmtAmt(s.totalOut);
  el('dl-sum-net').textContent = signed(s.net);
  el('dl-cnt-in').textContent = `${s.inCount} entries`;
  el('dl-cnt-out').textContent = `${s.outCount} entries`;
  el('dl-net-tag').textContent = s.net >= 0 ? 'Surplus' : 'Deficit';
  const modes = Object.entries(s.byMode).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  el('dl-modes-block').classList.toggle('d-none', !modes.length);
  el('dl-modes-card').innerHTML = modes.map(([m, n]) => `<button type="button" class="dl-row-line" data-v="${esc(m)}" onclick="dailyLedgerOpenMode(this.dataset.v)"><span>${esc(m)}</span><strong class="${n >= 0 ? 'dl-amt-in' : 'dl-amt-out'}">${signed(n)}</strong></button>`).join('');
  const cats = Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]);
  el('dl-cats-block').classList.toggle('d-none', !cats.length);
  el('dl-cats-card').innerHTML = cats.map(([c, a]) => `<div class="dl-row-line"><span>${esc(c)}</span><strong>${fmtAmt(a)}</strong></div>`).join('');
}
function isHomeRow(t) {
  return t.type === 'OUT' && (t.scope === 'HOME' || isHomeExpense(t.category));
}
function detailRow(label, value) {
  return `<div class="factory-summary-row"><span class="factory-summary-label">${label}</span><span class="qty-val">${value}</span></div>`;
}
function rowHtml(t) {
  const id = esc(t.id);
  const st = _stmt.get(t.id);
  const isT = t.type === 'TRANSFER';
  const isOut = t.type === 'OUT';
  const home = isHomeRow(t);
  const cls = t.type === 'IN' ? 'dl-amt-in' : isOut ? 'dl-amt-out' : 'dl-amt-trf';
  const sign = isT ? '&#8646; ' : isOut ? '- ' : '+ ';
  const tag = isOut ? `<span class="dl-tag ${home ? 'dl-tag-home' : 'dl-tag-biz'}">${home ? 'Home' : 'Biz'}</span>` : '';
  const sub = isT ? `${esc(t.mode)} &rarr; ${esc(t.toMode)}` : `${t.party ? `${esc(t.party)} &bull; ` : ''}${esc(t.mode)}`;
  const bal = st ? `<div class="dl-bal-line">Balance: ${fmtAmt(st.before)} &rarr; ${fmtAmt(st.after)}</div>` : '';
  const rows = [detailRow('Type', TYPE_LABEL[t.type]), isT ? detailRow('From', esc(t.mode)) + detailRow('To', esc(t.toMode)) : detailRow('Category', esc(t.category)) + detailRow('Mode', esc(t.mode))];
  if (isOut) rows.push(detailRow('Scope', home ? 'Home / Personal Expense' : 'Business Expense'));
  if (t.party) rows.push(detailRow('Party / Name', esc(t.party)));
  if (t.ref) rows.push(detailRow('Ref / Bill #', esc(t.ref)));
  if (t.note) rows.push(detailRow('Remarks', esc(t.note)));
  if (st) rows.push(detailRow('Statement Effect', esc(impactText(t, fmtAmt))));
  return `<div class="cust-history-item flex-col dl-item"><details class="dl-details"><summary><div class="txn-card-row"><div class="cust-history-info"><div class="u-fs-sm2 u-text-muted">${esc(shortDate(t.date))}</div><div>${isT ? 'Account Transfer' : esc(t.category)}${tag}</div><div class="u-fs-sm2 u-text-muted">${sub}</div></div><div class="text-right"><div class="cost-val dl-amount ${cls}">${sign}${fmtAmt(t.amount)}</div>${bal}</div></div></summary><div class="u-mt-8">${rows.join('')}</div><div class="dl-actions"><button class="tbl-action-btn" onclick="(async()=>{await dailyLedgerCopyVoucher('${id}')})()">Copy Voucher</button><button class="tbl-action-btn edit" onclick="dailyLedgerEdit('${id}')">Edit</button><button class="tbl-action-btn danger" onclick="dailyLedgerDelete('${id}')">Delete</button></div></details></div>`;
}
function visibleRows() {
  return filterRows(sortNewestFirst(_rows), { query: state.query });
}
function renderList() {
  const rows = visibleRows();
  const list = el('dailyLedgerList');
  if (!rows.length) {
    list.replaceChildren(Object.assign(document.createElement('div'), { className: 'u-empty-state-sm', textContent: 'No matching transactions found' }));
    return;
  }
  list.innerHTML = rows.map(rowHtml).join('');
}
function renderAll() {
  renderSummary();
  renderList();
}
function resetForm(keepType = true) {
  state.editId = '';
  state.editCategory = '';
  state.editScope = 'BUSINESS';
  if (!keepType) state.type = 'IN';
  el('dl-amount').value = '';
  el('dl-party').value = '';
  el('dl-note').value = '';
  el('dl-ref').value = '';
  el('dl-date').value = localDateStr();
  el('dl-mode').value = 'Cash';
  el('dl-to-mode').value = 'Bank Transfer';
  syncForm();
}
export async function prepareDailyLedgerScreen() {
  await load();
  state.query = '';
  el('dl-search').value = '';
  resetForm(false);
  renderAll();
}
export function dailyLedgerSetType(type) {
  state.type = type;
  syncForm();
}
export async function dailyLedgerSearchItems(source, query) {
  if (!_loaded) await load();
  const q = String(query || '').trim().toLowerCase();
  let items;
  if (source === 'ledger-mode') items = _lists.modes.map((value) => ({ value }));
  else if (source === 'ledger-party') items = _lists.parties.map((value) => ({ value }));
  else if (state.type === 'OUT') items = [..._lists.business.map((value) => ({ value, tag: 'Business' })), ..._lists.home.map((value) => ({ value, tag: 'Home' }))];
  else items = _lists.income.map((value) => ({ value }));
  return items.filter((it) => !q || it.value.toLowerCase().includes(q)).slice(0, 12);
}
export function dailyLedgerOnPick(inputId) {
  if (_dialogHook) _dialogHook(inputId);
}
export function dailyLedgerSetQuery(value) {
  state.query = value;
  renderList();
}
export function dailyLedgerOpenMode(mode) {
  state.query = mode;
  el('dl-search').value = mode;
  renderList();
  el('dl-history-label').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function pickCategoryDialog({ type, amount, category, scope }) {
  const isOut = type === 'OUT';
  const pool = isOut ? [..._lists.business, ..._lists.home] : _lists.income;
  const scopeOf = (name) => {
    const n = String(name || '').trim().toLowerCase();
    if (_lists.business.some((v) => v.toLowerCase() === n)) return 'BUSINESS';
    if (_lists.home.some((v) => v.toLowerCase() === n)) return 'HOME';
    return '';
  };
  const start = category || defaultCategory(type, scope);
  const scopeSelect = isOut ? '<div class="dlg-field d-none" id="dl-dlg-scope-wrap"><select id="dl-dlg-scope" class="dlg-input"><option value="BUSINESS">New category is a Business Expense</option><option value="HOME">New category is a Home / Personal Expense</option></select></div>' : '';
  const search = "handleUniversalSearch('dl-dlg-new','dl-dlg-results','ledger-category')";
  const body = `<div class="dlg-field"><input type="text" id="dl-dlg-new" class="dlg-input" value="${esc(start)}" placeholder="Search or type a category" maxlength="60" autocomplete="off" oninput="${search}" onfocus="${search}"><div id="dl-dlg-results" class="hidden dl-results st-background__e02427 st-border-bottom__e54b2f"></div></div>${scopeSelect}<div class="dlg-error" id="dl-dlg-err" role="alert" aria-live="polite"></div>`;
  const guard = async (overlay) => {
    const typed = overlay.querySelector('#dl-dlg-new').value.trim();
    const err = overlay.querySelector('#dl-dlg-err');
    if (!typed) { err.textContent = 'Search and select a category, or type a new one.'; return { ok: false }; }
    const known = pool.find((v) => v.toLowerCase() === typed.toLowerCase());
    const sel = overlay.querySelector('#dl-dlg-scope');
    return { ok: true, value: { category: known || typed, scope: isOut ? (scopeOf(typed) || (sel ? sel.value : 'BUSINESS')) : '' } };
  };
  const result = openDialog({
    tone: 'primary',
    title: 'Select Category',
    caption: isOut ? 'Search the expense category, tap it and save' : 'Search the income category, tap it and save',
    figure: { k: isOut ? 'CASH OUT' : 'CASH IN', v: fmtAmt(amount) },
    body,
    actions: [{ label: 'Cancel', variant: 'ghost', value: null }, { label: 'Save Entry', variant: 'solid', value: null, guard }],
    dismissIndex: 0,
    dismissOnBackdrop: false,
    focusIndex: -1
  });
  const overlay = document.querySelector('.dlg-overlay');
  const input = overlay.querySelector('#dl-dlg-new');
  const err = overlay.querySelector('#dl-dlg-err');
  const scopeWrap = overlay.querySelector('#dl-dlg-scope-wrap');
  const scopeSel = overlay.querySelector('#dl-dlg-scope');
  let touched = false;
  if (scopeSel) {
    scopeSel.value = scope === 'HOME' ? 'HOME' : 'BUSINESS';
    scopeSel.addEventListener('change', () => { touched = true; });
  }
  const refresh = () => {
    err.textContent = '';
    if (!scopeWrap) return;
    const typed = input.value.trim();
    const fresh = !!typed && !scopeOf(typed);
    scopeWrap.classList.toggle('d-none', !fresh);
    if (fresh && !touched) scopeSel.value = isHomeExpense(typed) ? 'HOME' : 'BUSINESS';
  };
  input.addEventListener('input', refresh);
  _dialogHook = refresh;
  refresh();
  return result.finally(() => { _dialogHook = null; });
}
export async function dailyLedgerSave() {
  await load();
  const prev = state.editId ? _rows.find((t) => t.id === state.editId) : null;
  const form = {
    type: state.type,
    scope: state.editScope,
    amount: el('dl-amount').value,
    category: state.editCategory,
    mode: el('dl-mode').value,
    toMode: el('dl-to-mode').value,
    party: el('dl-party').value,
    note: el('dl-note').value,
    ref: el('dl-ref').value,
    date: el('dl-date').value
  };
  const ctx = { id: generateUUID('dl_'), now: Date.now(), today: localDateStr(), modes: _lists.modes };
  const check = buildEntry(form, prev, ctx);
  if (!check.ok) { toast(check.error, 'warning'); return; }
  if (state.type !== 'TRANSFER') {
    const picked = await pickCategoryDialog({ type: state.type, amount: parseAmount(form.amount), category: prev && prev.type === state.type ? prev.category : '', scope: prev && prev.type === 'OUT' ? prev.scope : 'BUSINESS' });
    if (!picked) return;
    form.category = picked.category;
    form.scope = picked.scope;
  } else {
    form.category = '';
  }
  const res = buildEntry(form, prev, ctx);
  if (!res.ok) { toast(res.error, 'warning'); return; }
  if (state.type === 'TRANSFER') {
    const prompt = transferPrompt(_rows.filter((t) => !prev || t.id !== prev.id), res.entry, fmtAmt);
    const go = await showGlassConfirm(prompt.message, { title: prompt.title, confirmText: prev ? 'Update Transfer' : 'Transfer', tone: 'warning' });
    if (!go) return;
  }
  _rows = prev ? _rows.map((t) => (t.id === prev.id ? res.entry : t)) : [..._rows, res.entry];
  await persist();
  toast(savedMessage(res.entry, !!prev, fmtAmt), 'success');
  await load();
  resetForm(true);
  renderAll();
}
export async function dailyLedgerEdit(id) {
  await load();
  const t = _rows.find((r) => r.id === id);
  if (!t) return;
  state.editId = t.id;
  state.type = t.type;
  state.editCategory = t.category;
  state.editScope = t.type === 'OUT' ? t.scope : 'BUSINESS';
  el('dl-amount').value = String(t.amount);
  el('dl-date').value = t.date || localDateStr();
  el('dl-mode').value = t.mode;
  el('dl-to-mode').value = t.toMode || 'Bank Transfer';
  el('dl-party').value = t.party || '';
  el('dl-note').value = t.note || '';
  el('dl-ref').value = t.ref || '';
  syncForm();
  el('dl-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
export function dailyLedgerCancelEdit() { resetForm(true); }
export async function dailyLedgerDelete(id) {
  await load();
  const t = _rows.find((r) => r.id === id);
  if (!t) return;
  const isT = t.type === 'TRANSFER';
  const msg = isT
    ? `Are you sure you want to delete this transfer of ${fmtAmt(t.amount)} (${t.mode} ➔ ${t.toMode})?`
    : `Are you sure you want to delete this ${t.type === 'OUT' ? 'CASH OUT' : 'CASH IN'} entry of ${fmtAmt(t.amount)} (${t.category})?`;
  const ok = await showGlassConfirm(msg, { title: isT ? 'Delete Transfer Record?' : 'Delete Transaction Record?', confirmText: 'Delete', danger: true });
  if (!ok) return;
  await trashRecord('daily_ledger', t);
  _rows = _rows.filter((r) => r.id !== id);
  await persist();
  toast('Transaction deleted.', 'success');
  if (state.editId === id) resetForm(true);
  await load();
  renderAll();
}
async function copyText(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
  } catch (_e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    document.body.appendChild(ta);
    ta.select();
    let copied = false;
    try { copied = document.execCommand('copy'); } catch (_e2) { copied = false; }
    ta.remove();
    if (!copied) { toast('Copy is not available on this device', 'warning'); return; }
  }
  toast(okMsg, 'success');
}
export async function dailyLedgerCopyVoucher(id) {
  await load();
  const t = _rows.find((r) => r.id === id);
  if (t) await copyText(voucherText(t, _stmt.get(t.id), fmtAmt), 'Voucher copied');
}
export async function refreshDailyLedger() {
  const screen = el('daily-ledger-screen');
  if (!screen || screen.classList.contains('d-none')) return;
  await load();
  renderAll();
}
export async function restoreLedgerEntry(record) {
  if (!record || !record.id) return false;
  await load();
  _rows = mergeRestored(_rows, record);
  await persist();
  await refreshDailyLedger();
  return true;
}
const money = (n) => `${n < 0 ? '-' : ''}${fmtAmt(Math.abs(n))}`;
function pickPeriodDialog({ from, to }) {
  const field = (id, label, value) => `<div class="dlg-field dl-period-field"><label class="dl-period-label" for="${id}">${label}</label><input type="date" id="${id}" class="dlg-input" value="${esc(value)}"></div>`;
  const body = `${field('dl-pdf-from', 'From', from)}${field('dl-pdf-to', 'To', to)}<div class="dlg-error" id="dl-pdf-err" role="alert" aria-live="polite"></div>`;
  const guard = async (overlay) => {
    const fromValue = overlay.querySelector('#dl-pdf-from').value;
    const toValue = overlay.querySelector('#dl-pdf-to').value;
    const problem = checkPeriod(fromValue, toValue);
    if (problem) { overlay.querySelector('#dl-pdf-err').textContent = problem; return { ok: false }; }
    return { ok: true, value: { from: fromValue, to: toValue } };
  };
  const result = openDialog({
    tone: 'primary',
    title: 'Export Daily Ledger PDF',
    caption: 'Choose the period from the calendar',
    body,
    actions: [{ label: 'Cancel', variant: 'ghost', value: null }, { label: 'Export PDF', variant: 'solid', value: null, guard }],
    dismissIndex: 0,
    dismissOnBackdrop: false,
    focusIndex: -1
  });
  const overlay = document.querySelector('.dlg-overlay');
  const clear = () => { overlay.querySelector('#dl-pdf-err').textContent = ''; };
  ['dl-pdf-from', 'dl-pdf-to'].forEach((id) => {
    const input = overlay.querySelector(`#${id}`);
    input.addEventListener('change', clear);
    input.addEventListener('input', clear);
  });
  return result;
}
async function ensurePdfLibs() {
  if (!window.jspdf) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('Failed to load PDF library. Please refresh and try again.');
}
function lineCells(t) {
  const isT = t.type === 'TRANSFER';
  const title = isT ? `Account Transfer (${fmtAmt(t.amount)})` : t.category;
  const extra = [t.party, t.ref ? `Ref ${t.ref}` : '', t.note].filter(Boolean).join(' | ');
  return [shortDate(t.date), extra ? `${title}\n${extra}` : title, isT ? `${t.mode} > ${t.toMode}` : t.mode, t.type === 'IN' ? fmtAmt(t.amount) : '-', t.type === 'OUT' ? fmtAmt(t.amount) : '-', money(t.balance)];
}
function drawPdf(jsPDF, st) {
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const headerColor = [0, 122, 200];
  doc.setFillColor(...headerColor);
  doc.rect(0, 0, pageW, 22, 'F');
  if (typeof BRAND_LOGO_JPEG_BASE64 !== 'undefined') {
    try { doc.addImage(BRAND_LOGO_JPEG_BASE64, 'JPEG', 6, 2.5, 23.72, 17, undefined, 'NONE'); } catch (_e) {}
  }
  doc.setFontSize(16); doc.setFont(undefined, 'bold'); doc.setTextColor(255, 255, 255);
  doc.text('GULL AND ZUBAIR NASWAR DEALERS', pageW / 2, 10, { align: 'center' });
  doc.setFontSize(9); doc.setFont(undefined, 'normal');
  doc.text('Naswar Manufacturers & Dealers', pageW / 2, 17, { align: 'center' });
  doc.setFontSize(12); doc.setFont(undefined, 'bold'); doc.setTextColor(50, 50, 50);
  doc.text('Daily Ledger Statement', pageW / 2, 30, { align: 'center' });
  doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(80, 80, 80);
  doc.text(`Period: ${shortDate(st.from)} to ${shortDate(st.to)}`, pageW / 2, 36, { align: 'center' });
  const body = [['', 'Opening Balance', '', '-', '-', money(st.opening)], ...st.lines.map(lineCells)];
  doc.autoTable({
    startY: 42,
    head: [['Date', 'Details', 'Mode', 'Cash In', 'Cash Out', 'Balance']],
    body,
    theme: 'grid',
    headStyles: { fillColor: headerColor, textColor: 255, fontSize: 8.5, fontStyle: 'bold', halign: 'center' },
    styles: { fontSize: 7.5, cellPadding: 2.5, lineWidth: 0.15, lineColor: [180, 180, 180], overflow: 'linebreak' },
    columnStyles: { 0: { cellWidth: 24, halign: 'center' }, 1: { cellWidth: 60 }, 2: { cellWidth: 28 }, 3: { cellWidth: 22, halign: 'right', textColor: [40, 167, 69], fontStyle: 'bold' }, 4: { cellWidth: 22, halign: 'right', textColor: [220, 53, 69], fontStyle: 'bold' }, 5: { cellWidth: 26, halign: 'right', fontStyle: 'bold' } },
    didParseCell(data) {
      if (data.section === 'body' && data.row.index === 0) {
        data.cell.styles.fillColor = [220, 235, 255];
        data.cell.styles.textColor = [30, 80, 160];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: 14, right: 14 }
  });
  let y = doc.lastAutoTable.finalY + 6;
  if (!st.count) {
    doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.setTextColor(150);
    doc.text('No transactions recorded for this period.', pageW / 2, y, { align: 'center' });
    y += 8;
  }
  if (y > 250) { doc.addPage(); y = 20; }
  doc.setFillColor(240, 244, 250);
  doc.roundedRect(14, y, pageW - 28, 22, 2, 2, 'F');
  doc.setFontSize(8.5); doc.setFont(undefined, 'normal');
  doc.setTextColor(30, 80, 160);
  doc.text(`Opening: ${money(st.opening)}`, 20, y + 8);
  doc.setTextColor(40, 167, 69);
  doc.text(`Total Cash In: ${fmtAmt(st.totalIn)}`, 75, y + 8);
  doc.setTextColor(220, 53, 69);
  doc.text(`Total Cash Out: ${fmtAmt(st.totalOut)}`, 135, y + 8);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(st.closing < 0 ? 220 : 40, st.closing < 0 ? 53 : 167, st.closing < 0 ? 69 : 69);
  doc.text(`Closing Cash In Hand: ${money(st.closing)}`, pageW / 2, y + 17, { align: 'center' });
  const now = new Date();
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setFont(undefined, 'normal'); doc.setTextColor(160);
    doc.text(`Generated on ${formatDayMonthYear(now)} at ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })} | GULL AND ZUBAIR NASWAR DEALERS`, pageW / 2, 291, { align: 'center' });
    doc.text(`Page ${i} of ${pages}`, pageW / 2, 287, { align: 'center' });
  }
  return doc;
}
export async function dailyLedgerExportPdf() {
  await load();
  const today = localDateStr();
  const period = await pickPeriodDialog({ from: state.pdfFrom || `${today.slice(0, 8)}01`, to: state.pdfTo || today });
  if (!period) return;
  state.pdfFrom = period.from;
  state.pdfTo = period.to;
  toast('Generating PDF...', 'info');
  try {
    await ensurePdfLibs();
    const doc = drawPdf(window.jspdf.jsPDF, periodStatement(_rows, period.from, period.to));
    await new Promise((r) => setTimeout(r, 100));
    doc.save(`Daily_Ledger_${period.from}_to_${period.to}.pdf`);
    toast('PDF exported successfully', 'success');
  } catch (e) {
    toast(`Error generating PDF: ${e.message}`, 'error');
  }
}
Object.assign(window, { restoreLedgerEntry, refreshDailyLedger, prepareDailyLedgerScreen, dailyLedgerSetType, dailyLedgerSearchItems, dailyLedgerOnPick, dailyLedgerSetQuery, dailyLedgerOpenMode, dailyLedgerSave, dailyLedgerEdit, dailyLedgerCancelEdit, dailyLedgerDelete, dailyLedgerCopyVoucher, dailyLedgerExportPdf });
