import { esc, fmtAmt } from './business.js';
import { fmtNum } from './finance.js';
import { openDialog } from './dialog.js';
import { renderMarkupImage, warmMarkupImage } from './dialog-image.js';
import { formatDateKey, dateSearchText } from './date-format.js';
import { BRAND_LOGO_JPEG_BASE64, loadBrandLogo } from './constants.js';

const CFG = {
  cust: { list: 'customerManagementHistoryList', search: 'cust-trans-search', filters: 'customerHistoryFilters', jump: 'customerMonthJump', summary: 'customerManagementSummary', edit: 'sale', del: 'deleteTransactionFromOverlay', invoiceTag: 'C' },
  rep: { list: 'repCustomerManagementHistoryList', search: 'rep-cust-trans-search', filters: 'repCustomerHistoryFilters', jump: 'repCustomerMonthJump', summary: 'repCustomerManagementSummary', edit: 'repsale', del: 'deleteRepTransactionFromOverlay', invoiceTag: 'R' },
  ent: {
    list: 'entityManagementHistoryList', search: 'entity-trans-search', filters: 'entityHistoryFilters', jump: 'entityMonthJump', summary: 'entityManagementSummary', edit: 'payment', del: 'deleteEntityTransaction', invoiceTag: 'E',
    menuEdit: 'Edit entity', pdfKind: 'entity', editFn: 'openEditEntityFromDetails',
    aLabel: 'Out', bLabel: 'In',
    emptyTitle: 'No payments yet',
    emptyText: (name) => `Payments in, payments out and transfers for ${name} will appear here.`,
    emptyBtn: 'Record first payment',
    filterChips: [['all', 'All'], ['in', 'Payment In'], ['out', 'Payment Out'], ['transfer', 'Transfers']]
  }
};
const lbl = (kind) => ({ a: CFG[kind].aLabel || 'Sold', b: CFG[kind].bLabel || 'Received' });
const S = {};
const st = (kind) => S[kind] || (S[kind] = { filter: 'all', rows: new Map(), days: new Map(), name: '', phone: '', dayKeys: [] });
const toast = (m, t) => { if (typeof window.showToast === 'function') window.showToast(m, t); };

export function resetLedgerFilter(kind) { st(kind).filter = 'all'; }
export function ledgerDayRange(kind) {
  const keys = st(kind).dayKeys.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  return { min: keys[0] || '', max: keys[keys.length - 1] || '' };
}

const SHARE_ICON = '<svg width="13" height="13" viewBox="0 0 36 36" fill="none" aria-hidden="true"><path d="M10.5 16L25 9.5M10.5 20L25 26.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="27.5" cy="8" r="4.5" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.8"/><circle cx="8.5" cy="18" r="4.5" fill="currentColor" fill-opacity="0.3" stroke="currentColor" stroke-width="1.8"/><circle cx="27.5" cy="28" r="4.5" fill="currentColor" fill-opacity="0.25" stroke="currentColor" stroke-width="1.8"/></svg>';
const RECEIPT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>';
const MENU_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>';

export function menuButtonHtml(kind, safeName) {
  return `<button type="button" class="btn cm-menu-btn" aria-haspopup="menu" aria-label="More actions" title="More actions" onclick="toggleCmMenu(this,'${kind}','${safeName}')">${MENU_ICON}</button>`;
}

function closeCmMenu() {
  const m = document.getElementById('cm-menu');
  if (m) m.remove();
}

window.toggleCmMenu = (btn, kind, safeName) => {
  const open = document.getElementById('cm-menu');
  if (open) { const same = open.dataset.owner === kind; closeCmMenu(); if (same) return; }
  const menu = document.createElement('div');
  menu.id = 'cm-menu';
  menu.className = 'cm-menu';
  menu.dataset.owner = kind;
  menu.setAttribute('role', 'menu');
  menu.innerHTML = `<button type="button" role="menuitem" class="cm-menu-item" data-a="edit">${CFG[kind].menuEdit || 'Edit customer'}</button><button type="button" role="menuitem" class="cm-menu-item" data-a="pdf">Statement PDF</button>`;
  document.body.appendChild(menu);
  const r = btn.getBoundingClientRect();
  menu.style.setProperty('top', `${Math.round(r.bottom + 6)}px`);
  menu.style.setProperty('right', `${Math.max(8, Math.round(window.innerWidth - r.right))}px`);
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    closeCmMenu();
    if (b.dataset.a === 'edit') {
      const fn = kind === 'ent' ? window.openEditEntityFromDetails : kind === 'rep' ? window.openRepCustomerEditModal : window.openCustomerEditModal;
      if (typeof fn === 'function') fn(safeName);
    } else if (typeof window.promptStatementShare === 'function') {
      window.promptStatementShare(CFG[kind].pdfKind || (kind === 'rep' ? 'rep' : 'customer'));
    }
  });
  setTimeout(() => {
    const away = (e) => { if (!menu.contains(e.target)) { closeCmMenu(); document.removeEventListener('click', away, true); } };
    document.addEventListener('click', away, true);
  }, 0);
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCmMenu(); });

export function applyCmFilters(kind) {
  const c = CFG[kind];
  const list = document.getElementById(c.list);
  if (!list) return;
  const searchEl = document.getElementById(c.search);
  const term = searchEl && !searchEl.classList.contains('d-none') ? searchEl.value.toLowerCase().trim() : '';
  const filter = list.classList.contains('is-comfortable') ? 'all' : st(kind).filter;
  list.classList.toggle('is-filtering', !!term || filter !== 'all');
  list.querySelectorAll('.cm-row').forEach((r) => {
    const okF = filter === 'all' || (filter === 'open' ? r.dataset.open === '1' : r.dataset.cat === filter);
    const day = r.closest('.cm-day');
    const okT = !term || r.textContent.toLowerCase().includes(term) || dateSearchText(day && day.dataset.day).includes(term);
    r.classList.toggle('d-none', !(okF && okT));
  });
  list.querySelectorAll('.cm-day').forEach((d) => d.classList.toggle('d-none', !d.querySelector('.cm-row:not(.d-none)')));
  list.querySelectorAll('.cm-month').forEach((m) => m.classList.toggle('d-none', !m.querySelector('.cm-row:not(.d-none)')));
  const none = list.querySelector('.cm-no-match');
  if (none) none.classList.toggle('d-none', !!list.querySelector('.cm-row:not(.d-none)'));
}

window.setCmFilter = (kind, k) => {
  st(kind).filter = k;
  document.querySelectorAll(`#${CFG[kind].filters} .toggle-opt`).forEach((c) => c.classList.toggle('active', c.dataset.f === k));
  applyCmFilters(kind);
};
window.toggleCmMonth = (btn) => {
  const sec = btn.closest('.cm-month');
  if (!sec) return;
  const collapsed = sec.classList.toggle('is-collapsed');
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
};
window.jumpCmMonth = (id) => {
  const sec = document.getElementById(id);
  if (!sec) return;
  sec.classList.remove('is-collapsed');
  const head = sec.querySelector('.cm-month-head');
  if (head) head.setAttribute('aria-expanded', 'true');
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.openCustomerTxnSheet = (btn) => {
  const kind = (btn && btn.dataset && btn.dataset.kind) || 'cust';
  const d = st(kind).rows.get(String((btn && btn.dataset && btn.dataset.txid) || ''));
  const sheet = document.getElementById('cm-sheet');
  const back = document.getElementById('cm-sheet-backdrop');
  if (!d || !sheet || !back) return;
  const c = CFG[kind];
  const editCall = d.editCall || `startEdit('${c.edit}','${d.safeId}')`;
  const delCall = d.delCall || `${c.del}('${d.safeId}')`;
  const actions = (d.canDelete ? `<button type="button" class="btn btn-danger" onclick="closeCustomerTxnSheet();${delCall}">Delete</button>` : '') + (d.canEdit ? `<button type="button" class="btn btn-main u-mt-8" onclick="closeCustomerTxnSheet();${editCall}">Edit</button>` : '');
  sheet.innerHTML = `<div class="cm-sheet-grab" aria-hidden="true"></div><div class="cm-sheet-head"><div class="cm-sheet-title">${esc(d.title)}</div><div class="cm-sheet-amt${d.rIn ? ' is-in' : ''}">${d.rIn ? '+ ' : ''}${d.amtText}</div></div><div class="cm-sheet-body"><div class="cust-history-info">${d.info}</div>${d.kebabBtn ? `<div class="cm-sheet-more">${d.kebabBtn}</div>` : ''}${d.panelPlaceholder}</div>${d.balHtml}${actions ? `<div class="cm-sheet-actions">${actions}</div>` : ''}`;
  back.classList.add('is-open');
  sheet.classList.add('is-open');
};
window.closeCustomerTxnSheet = () => {
  const sheet = document.getElementById('cm-sheet');
  const back = document.getElementById('cm-sheet-backdrop');
  if (sheet) sheet.classList.remove('is-open');
  if (back) back.classList.remove('is-open');
};
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.closeCustomerTxnSheet(); });
(function () {
  let y0 = null;
  document.addEventListener('touchstart', (e) => { const g = e.target.closest && e.target.closest('#cm-sheet'); y0 = g ? e.touches[0].clientY : null; }, { passive: true });
  document.addEventListener('touchend', (e) => { if (y0 !== null && e.changedTouches[0].clientY - y0 > 70) { const sh = document.getElementById('cm-sheet'); if (sh && sh.scrollTop <= 0) window.closeCustomerTxnSheet(); } y0 = null; }, { passive: true });
})();

export async function renderLedger(kind, { name, phone, entries, summaryHtml, money, emptyAction }) {
  const c = CFG[kind];
  const state = st(kind);
  const list = document.getElementById(c.list);
  if (!list) return;
  state.rows.clear();
  state.days.clear();
  state.name = name;
  state.phone = phone || '';
  state.dayKeys = entries.map((e) => e.dkey);
  const search = document.getElementById(c.search);
  const filters = document.getElementById(c.filters);
  const jump = document.getElementById(c.jump);
  const sum = document.getElementById(c.summary);
  const n = entries.length;
  const comfortable = n <= 6;
  if (search) search.classList.toggle('d-none', comfortable);
  if (filters) filters.classList.toggle('d-none', comfortable);
  if (sum) { sum.classList.remove('d-none'); sum.innerHTML = summaryHtml; }
  if (n === 0) {
    if (filters) filters.replaceChildren();
    if (jump) { jump.replaceChildren(); jump.classList.add('d-none'); }
    list.className = 'cm-list';
    const emptyTitle = c.emptyTitle || 'No transactions yet';
    const emptyText = c.emptyText ? c.emptyText(esc(name)) : `Sales, collections and old debt for ${esc(name)} will appear here.`;
    list.innerHTML = `<div class="cm-empty"><div class="cm-empty-title">${emptyTitle}</div><p>${emptyText}</p>${emptyAction ? `<button type="button" class="btn btn-main" onclick="${emptyAction}">${c.emptyBtn || 'Record first sale'}</button>` : ''}</div>`;
    return;
  }
  for (const e of entries) state.rows.set(String(e.id), e.row);
  const months = [];
  const mIdx = {};
  for (const e of entries) {
    const month = e.dkey.slice(0, 7);
    let M = mIdx[month];
    if (!M) { M = mIdx[month] = { key: month, days: [], dIdx: {}, c: 0, q: 0, sold: 0, got: 0 }; months.push(M); }
    let D = M.dIdx[e.dkey];
    if (!D) { D = M.dIdx[e.dkey] = { key: e.dkey, items: [], q: 0, sold: 0, got: 0 }; M.days.push(D); }
    D.items.push(e); D.q += e.qty || 0; D.sold += e.sold; D.got += e.got;
    M.c++; M.q += e.qty || 0; M.sold += e.sold; M.got += e.got;
  }
  const countLabel = (count, qty) => (kind === 'ent' ? `${count} ${count === 1 ? 'entry' : 'entries'}` : `${fmtNum(qty)} kg`);
  const rowHtml = (e, first) => {
    const dateObj = new Date(e.dkey + 'T00:00:00');
    const ok = !isNaN(dateObj.getTime());
    const dnum = ok ? dateObj.getDate() : '';
    const dwk = ok ? dateObj.toLocaleDateString('en-US', { weekday: 'short' }) : '';
    return `<button type="button" class="cm-row cm-${e.rKind}${e.isSettled ? ' is-settled-record' : ''}" data-kind="${kind}" data-txid="${esc(e.id)}" data-cat="${e.rCat}" data-open="${e.unpaid ? 1 : 0}" onclick="openCustomerTxnSheet(this)"><span class="cm-date">${first && !e.noDate ? `<b>${dnum}</b><span>${dwk}</span>` : ''}</span><span class="cm-main"><span class="cm-title"><i class="cm-dot"></i>${esc(e.rTitle)}${e.tag ? ' ' + e.tag : ''}</span><span class="cm-sub">${esc(e.rSub)}</span></span><span class="cm-amt"><b class="${e.rIn ? 'is-in' : ''}">${e.rIn ? '+ ' : ''}${e.amtText}</b><span class="${e.balTone}">${e.balText}</span></span></button>`;
  };
  const dayHtml = async (D) => {
    const chrono = D.items.slice().reverse();
    const latest = D.items[0];
    const net = D.items.reduce((a, e) => a + (e.debit || 0) - (e.credit || 0), 0);
    state.days.set(D.key, { rows: chrono, closing: latest.bal, opening: latest.bal - net, sold: D.sold, got: D.got });
    const L = lbl(kind);
    const summary = D.items.length > 1 ? `${countLabel(D.items.length, D.q)} \u00b7 ${L.a} ${await money(D.sold)} \u00b7 ${L.b} ${await money(D.got)}` : '';
    return `<div class="card cm-day" data-day="${esc(D.key)}">${D.items.map((e, i) => rowHtml(e, i === 0)).join('')}<div class="cm-day-foot"><span>${summary}</span>${c.noInvoice ? '' : `<button type="button" class="btn cm-share" onclick="shareCustomerDay('${kind}','${esc(D.key)}')" title="Open invoice for this day">${SHARE_ICON}<span>Invoice</span></button>`}</div></div>`;
  };
  let html = '';
  const many = n > 40;
  for (let mi = 0; mi < months.length; mi++) {
    const M = months[mi];
    let days = '';
    for (const D of M.days) days += await dayHtml(D);
    if (comfortable) { html += days; continue; }
    const md = new Date(M.key + '-01T00:00:00');
    const mName = isNaN(md.getTime()) ? M.key : md.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const collapsed = many && mi > 0;
    html += `<section class="cm-month${collapsed ? ' is-collapsed' : ''}" id="cm-m-${kind}-${esc(M.key)}"><button type="button" class="cm-month-head" onclick="toggleCmMonth(this)" aria-expanded="${collapsed ? 'false' : 'true'}"><span class="cm-month-name">${esc(mName)}</span><span class="cm-month-count">${countLabel(M.c, M.q)}</span><span class="cm-month-sum">${lbl(kind).a} ${await money(M.sold)} \u00b7 ${lbl(kind).b} ${await money(M.got)}</span><svg class="cm-chev" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><div class="cm-month-body">${days}</div></section>`;
  }
  html += '<div class="cm-no-match u-empty-state-sm d-none">No matching history. Clear the search or pick All.</div>';
  list.className = comfortable ? 'cm-list is-comfortable' : 'cm-list';
  list.innerHTML = html;
  if (filters && !comfortable) {
    const FL = Array.isArray(c.filterChips) ? c.filterChips : [['all', 'All'], ['credit', 'Credit'], ['cash', 'Cash'], ['pay', 'Payments'], ['open', 'Unpaid']];
    filters.innerHTML = FL.map(([k, l]) => `<button type="button" class="toggle-opt${state.filter === k ? ' active' : ''}" data-f="${k}" onclick="setCmFilter('${kind}','${k}')">${l}</button>`).join('');
  }
  if (jump) {
    const show = many && months.length >= 3;
    jump.classList.toggle('d-none', !show);
    jump.innerHTML = show ? months.map((M) => { const d = new Date(M.key + '-01T00:00:00'); return `<button type="button" class="toggle-opt" onclick="jumpCmMonth('cm-m-${kind}-${esc(M.key)}')">${isNaN(d.getTime()) ? esc(M.key) : d.toLocaleDateString('en-US', { month: 'short' })} ${M.c}</button>`; }).join('') : '';
  }
  applyCmFilters(kind);
}

const balText = (b) => (Math.abs(b) < 0.01 ? 'SETTLED' : b > 0 ? fmtAmt(b) : `${fmtAmt(-b)} CR`);
const invoiceDate = (k) => formatDateKey(k) || dayText(k);
const dayText = (k) => (typeof window.formatDisplayDate === 'function' ? window.formatDisplayDate(k) : k);

async function brandLogo() {
  try { const d = await loadBrandLogo(); if (d) return d; } catch (_) { }
  return BRAND_LOGO_JPEG_BASE64 || '';
}

function invoicePaperHtml(kind, dayKey, d, state, logo) {
  const isEnt = kind === 'ent';
  const due = d.closing;
  const dueLabel = isEnt ? (due < -0.005 ? 'Receivable' : 'Balance') : (due > 0.005 ? 'Balance due' : due < -0.005 ? 'Overpaid' : 'Balance');
  const dueText = isEnt ? (due < -0.005 ? `${fmtAmt(-due)} REC` : fmtAmt(Math.max(0, due))) : balText(due);
  const line = (cls, title, sub, amt, isIn) => `<li class="invp-row${cls}"><span class="invp-main"><b>${esc(title)}</b>${sub ? `<i>${esc(sub)}</i>` : ''}</span><span class="invp-amt${isIn ? ' is-in' : ''}">${isIn ? '+ ' : ''}${esc(amt)}</span></li>`;
  const prev = Math.abs(d.opening) >= 0.01 ? line(' is-prev', 'Previous balance', '', isEnt ? (d.opening < 0 ? `${fmtAmt(-d.opening)} REC` : fmtAmt(d.opening)) : balText(d.opening), false) : '';
  const rows = d.rows.map((e) => line('', e.rTitle, e.invSub != null ? e.invSub : e.rSub, e.amtText, e.rIn)).join('');
  const totals = isEnt
    ? (d.got > 0.005 ? line(' is-recv', 'Total in', '', fmtAmt(d.got), false) : '') + (d.sold > 0.005 ? line(' is-recv', 'Total out', '', fmtAmt(d.sold), false) : '')
    : line(' is-recv', 'Received', '', fmtAmt(d.got), false);
  const owed = Math.max(0, d.opening) + (d.sold || 0);
  const p = owed > 0.005 ? Math.min(1, Math.max(0, (d.got || 0) / owed)) : 1;
  const pct = Math.round(p * 1000) / 10;
  const dx = (150 - 124 * Math.cos(Math.PI * p)).toFixed(2);
  const dy = (150 - 124 * Math.sin(Math.PI * p)).toFixed(2);
  const arc = 'M26 150A124 124 0 0 1 274 150';
  const endDots = [26, 274].map((x) => `<circle cx="${x}" cy="150" r="11" fill="url(#invp-sun)"/><circle cx="${x}" cy="150" r="3.8" fill="#F59E0B"/>`).join('');
  const marker = isEnt ? '' : `<circle cx="${dx}" cy="${dy}" r="11" fill="url(#invp-sun)"/><circle cx="${dx}" cy="${dy}" r="3.6" fill="#F59E0B"/>`;
  const fill = isEnt ? '' : `<path class="invp-arc-fill" d="${arc}" pathLength="100" stroke-dasharray="${pct} 100"/>`;
  const dial = `<svg viewBox="0 70 300 80" aria-hidden="true"><defs><radialGradient id="invp-sun"><stop offset="0" stop-color="#F59E0B" stop-opacity=".55"/><stop offset="1" stop-color="#F59E0B" stop-opacity="0"/></radialGradient><linearGradient id="invp-fade" gradientUnits="userSpaceOnUse" x1="0" y1="70" x2="0" y2="100"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient><mask id="invp-mk" maskUnits="userSpaceOnUse" x="-20" y="70" width="340" height="100"><rect x="-20" y="70" width="340" height="100" fill="url(#invp-fade)"/></mask></defs><g mask="url(#invp-mk)"><path class="invp-arc-track" d="${arc}" pathLength="100"/>${fill}</g>${endDots}${marker}</svg>`;
  return `<div class="invp-root"><div class="invp-glow"></div>${logo ? `<img class="invp-logo" src="${esc(logo)}" alt="">` : ''}<div class="invp-brand"><b>Gull and Zubair</b><div class="invp-tag">Naswar Dealers</div><div class="invp-rule"></div></div><div class="invp-dial">${dial}<div class="invp-dial-in"><div class="invp-greet">${isEnt ? 'Account of' : 'Billed to'}</div><div class="invp-name">${esc(state.name)}</div>${state.phone ? `<div class="invp-phone">${esc(state.phone)}</div>` : ''}<div class="invp-when"><b>Date</b><span>${esc(invoiceDate(dayKey))}</span></div></div></div><div class="invp-panel"><ul class="invp-items">${prev}${rows}${totals}</ul></div><div class="invp-due"><div class="invp-due-k">${dueLabel}</div><strong class="invp-due-v${due < -0.005 ? ' is-credit' : ''}">${esc(dueText)}</strong></div><p class="invp-thanks">Thank you for your business</p><i class="invp-foot"></i></div>`;
}

async function prepareInvoiceFile(kind, dayKey, d, state, logo) {
  const blob = await renderMarkupImage(invoicePaperHtml(kind, dayKey, d, state, logo), { width: 420, scale: 2 });
  const safe = String(state.name).replace(/[^a-z0-9]/gi, '_');
  return new File([blob], `Invoice_${safe}_${dayKey}.png`, { type: 'image/png' });
}

async function shareInvoiceFile(file, phone) {
  if (!(navigator.canShare && navigator.canShare({ files: [file] }))) return 'unsupported';
  try {
    await navigator.share({ files: [file], title: 'Invoice', phone: phone || '' });
    return 'shared';
  } catch (err) {
    if (err && err.name === 'AbortError') return 'cancelled';
    if (err && err.name === 'NotAllowedError') return 'retry';
    throw err;
  }
}

export async function openDayInvoice(kind, dayKey, render) {
  const logoPromise = brandLogo();
  const dataPromise = (async () => {
    if (typeof render === 'function') await render();
    const state = st(kind);
    const d = state.days.get(dayKey);
    if (!state.name || !d || !d.rows.length) return null;
    const logo = await logoPromise;
    return { state, d, logo, html: invoicePaperHtml(kind, dayKey, d, state, logo) };
  })().catch((err) => { console.error('Invoice data failed.', err); return null; });
  const filePromise = dataPromise
    .then(async (x) => {
      if (!x) return null;
      await new Promise((resolve) => setTimeout(resolve, 40));
      return prepareInvoiceFile(kind, dayKey, x.d, x.state, x.logo);
    })
    .catch((err) => { console.error('Invoice image failed.', err); return null; });
  const shown = openDialog({
    tone: 'primary',
    title: 'Share Invoice',
    eyebrow: 'Invoice',
    caption: 'This is the picture that will be shared',
    icon: RECEIPT_ICON,
    body: '<div class="invp-loading">Preparing invoice\u2026</div>',
    actions: [
      { label: 'Close', variant: 'ghost', value: false },
      {
        label: 'Share invoice',
        variant: 'solid',
        value: true,
        guard: async (overlay) => {
          const btn = overlay.querySelector('[data-act="1"]');
          const label = btn ? btn.textContent : '';
          if (btn) btn.textContent = 'Preparing\u2026';
          const file = await filePromise;
          if (btn) btn.textContent = label;
          if (!file) { toast('Nothing to invoice for this day.', 'warning'); return { ok: false }; }
          try {
            const result = await shareInvoiceFile(file, st(kind).phone);
            if (result === 'shared') { toast('Invoice shared successfully', 'success'); return { ok: true, value: true }; }
            if (result === 'cancelled') { toast('Share cancelled', 'info'); return { ok: false }; }
            if (result === 'retry') { toast('Invoice is ready \u2014 tap Share again', 'info'); return { ok: false }; }
            toast('Sharing images is not supported on this device.', 'warning');
            return { ok: false };
          } catch (err) {
            console.error('Invoice share failed.', err);
            toast('Could not share the invoice. Please try again.', 'error');
            return { ok: false };
          }
        }
      }
    ],
    dismissIndex: 0
  });
  const overlays = document.querySelectorAll('.dlg-overlay');
  const body = overlays[overlays.length - 1] && overlays[overlays.length - 1].querySelector('.dlg-body');
  dataPromise.then((x) => {
    if (!body || !body.isConnected) return;
    body.innerHTML = x ? x.html : '<div class="invp-loading">Nothing to invoice for this day.</div>';
  });
  await shown;
}

let warmed = false;
window.warmInvoiceShare = () => {
  if (warmed) return;
  warmed = true;
  setTimeout(async () => {
    try {
      const logo = await brandLogo();
      const blank = { rows: [], closing: 0, opening: 0, sold: 0, got: 0 };
      await warmMarkupImage(invoicePaperHtml('cust', '2000-01-01', blank, { name: '', phone: '' }, logo));
    } catch (_) { }
  }, 60);
};
window.shareCustomerDay = (kind, dayKey) => openDayInvoice(kind, dayKey);
window.getLedgerDayRange = ledgerDayRange;

export async function shareInvoiceAfterSave(kind, { name, date, render }) {
  const want = window._gcShare;
  window._gcShare = null;
  if (!want || want.kind !== kind) return;
  if (!name || !date) return;
  try {
    await openDayInvoice(kind, date, render);
  } catch (err) {
    console.error('Share after save failed.', err);
    toast('Saved, but the invoice could not be opened.', 'warning');
  }
}
window.shareInvoiceAfterSave = (kind, opts) => { shareInvoiceAfterSave(kind, opts); };
