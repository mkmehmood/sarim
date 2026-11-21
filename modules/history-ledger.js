import { formatMonthYear } from './date-format.js';

const LISTS = ['historyList', 'custHistoryList', 'prodHistoryList', 'paymentHistoryList', 'repHistoryList', 'factoryHistoryList', 'factoryPurchaseHistory', 'paymentTransferHistoryList', 'stockTransferHistoryList', 'dailyLedgerList', 'expenseManagementHistoryList'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLLAPSE_AFTER = 40;
const TONE_CLASS = { good: 'cm-in', warn: 'cm-cr', bad: 'cm-out' };

const esc = (v) => (v == null ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
const isVisible = (c) => c.style.display !== 'none' && !c.classList.contains('d-none') && !c.classList.contains('hidden');
const toneOf = (c) => ['good', 'bad', 'warn', 'info', 'muted'].find((t) => c.classList.contains('is-' + t)) || 'muted';

const sigs = new WeakMap();
const srcObservers = new WeakMap();
let sheetCard = null;
let sheetBody = null;
let armedAt = 0;
let blockOpenUntil = 0;

function ensureParts(list) {
  let src = list.querySelector(':scope > .hl-src');
  let led = list.querySelector(':scope > .hl-ledger');
  if (!src) {
    src = document.createElement('div');
    src.className = 'hl-src';
    src.hidden = true;
    list.prepend(src);
  }
  if (!led) {
    led = document.createElement('div');
    led.className = 'cm-list hl-ledger';
    src.after(led);
  }
  return { src, led };
}

function watchSource(list, src) {
  if (srcObservers.has(src)) return;
  const mo = new MutationObserver((records) => {
    if (records.some((r) => r.target.classList && r.target.classList.contains('hc-card'))) rebuild(list);
  });
  mo.observe(src, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
  srcObservers.set(src, mo);
}

function adopt(list) {
  const fresh = Array.from(list.querySelectorAll(':scope > .hc-card, :scope > .hc-list > .hc-card'));
  if (!fresh.length) return false;
  const { src } = ensureParts(list);
  watchSource(list, src);
  fresh.forEach((c) => src.appendChild(c));
  sigs.delete(list);
  return true;
}

function parseCard(card) {
  const date = card.getAttribute('data-date') || '';
  const tag = card.querySelector(':scope > .hc-head .hc-tag');
  const lead = card.querySelector(':scope > .hc-head .hc-lead');
  const title = card.querySelector(':scope > .hc-head .hc-title');
  const sub = card.querySelector(':scope > .hc-head .hc-sub');
  const amt = card.querySelector(':scope > .hc-head .hc-amt');
  return {
    card,
    tone: toneOf(card),
    dkey: DATE_RE.test(date.slice(0, 10)) ? date.slice(0, 10) : '',
    title: title ? title.innerHTML : '',
    sub: sub ? sub.innerHTML : '',
    amt: amt ? amt.innerHTML : '',
    tag: tag ? tag.textContent.trim() : '',
    lead: lead ? lead.outerHTML : ''
  };
}

function rowHtml(e, idx, first) {
  const d = e.dkey ? new Date(e.dkey + 'T00:00:00') : null;
  const ok = d && !isNaN(d.getTime());
  const dnum = ok ? d.getDate() : '';
  const dwk = ok ? d.toLocaleDateString('en-US', { weekday: 'short' }) : '';
  return `<button type="button" class="row cm-row hl-row ${TONE_CLASS[e.tone] || ''}" data-i="${idx}"><span class="cm-date">${first && ok ? `<b>${dnum}</b><span>${dwk}</span>` : ''}</span><span class="cm-main"><span class="cm-title"><i class="cm-dot"></i>${e.title}</span><span class="cm-sub">${e.sub}</span></span><span class="cm-amt"><b>${e.amt}</b><span>${esc(e.tag)}</span></span></button>`;
}

function rebuild(list) {
  const src = list.querySelector(':scope > .hl-src');
  const led = list.querySelector(':scope > .hl-ledger');
  if (!src || !led) return;
  const cards = Array.from(src.children).filter((c) => c.classList.contains('hc-card'));
  const vis = cards.filter(isVisible);
  const sig = `${cards.length}:${vis.map((c) => cards.indexOf(c)).join(',')}`;
  if (sigs.get(list) === sig) return;
  sigs.set(list, sig);
  led._entries = vis.map(parseCard);
  const entries = led._entries;
  if (!entries.length) { led.innerHTML = ''; return; }
  const months = [];
  const mIdx = {};
  entries.forEach((e, i) => {
    e.i = i;
    const mk = e.dkey ? e.dkey.slice(0, 7) : 'undated';
    let M = mIdx[mk];
    if (!M) { M = mIdx[mk] = { key: mk, days: [], dIdx: {}, n: 0 }; months.push(M); }
    const dk = e.dkey || 'undated';
    let D = M.dIdx[dk];
    if (!D) { D = M.dIdx[dk] = { key: dk, items: [] }; M.days.push(D); }
    D.items.push(e);
    M.n++;
  });
  const byKeyDesc = (a, b) => (a.key === 'undated' ? 1 : b.key === 'undated' ? -1 : a.key < b.key ? 1 : a.key > b.key ? -1 : 0);
  months.sort(byKeyDesc);
  months.forEach((M) => M.days.sort(byKeyDesc));
  const many = entries.length > COLLAPSE_AFTER;
  const comfortable = entries.length <= 6;
  led.classList.toggle('is-comfortable', comfortable);
  let html = '';
  months.forEach((M, mi) => {
    const days = M.days.map((D) => `<div class="hl-day" data-day="${esc(D.key)}">${D.items.map((e, i) => rowHtml(e, e.i, i === 0)).join('')}${D.items.length > 1 ? `<div class="cm-day-foot"><span>${D.items.length === 1 ? '1 entry' : `${D.items.length} entries`}</span></div>` : ''}</div>`).join('');
    if (comfortable) { html += days; return; }
    const md = M.key === 'undated' ? null : new Date(M.key + '-01T00:00:00');
    const name = md && !isNaN(md.getTime()) ? formatMonthYear(md) : 'No date';
    const collapsed = many && mi > 0;
    html += `<section class="cm-month${collapsed ? ' is-collapsed' : ''}"><button type="button" class="cm-month-head" data-hl-month aria-expanded="${collapsed ? 'false' : 'true'}"><span class="cm-month-name">${esc(name)}</span><span class="cm-month-count">${M.n === 1 ? '1 entry' : `${M.n} entries`}</span><svg class="cm-chev" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><div class="cm-month-body">${days}</div></section>`;
  });
  led.innerHTML = html;
}

function sync(list) {
  adopt(list);
  rebuild(list);
}

function watchList(list) {
  if (list._hlWatched) return;
  list._hlWatched = true;
  new MutationObserver(() => sync(list)).observe(list, { childList: true });
  sync(list);
}

function sheetEls() {
  let back = document.getElementById('hl-sheet-backdrop');
  let sheet = document.getElementById('hl-sheet');
  if (!back) {
    back = document.createElement('div');
    back.id = 'hl-sheet-backdrop';
    back.className = 'cm-sheet-backdrop';
    document.body.appendChild(back);
  }
  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'hl-sheet';
    sheet.className = 'overlay cm-sheet hl-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Entry details');
    document.body.appendChild(sheet);
  }
  return { back, sheet };
}

let locked = false;
let hadLock = false;

function lockScroll() {
  if (locked) return;
  locked = true;
  hadLock = document.body.classList.contains('scroll-locked');
  document.body.classList.add('scroll-locked');
  document.documentElement.classList.add('scroll-locked');
  const ae = document.activeElement;
  if (ae && ae !== document.body && typeof ae.blur === 'function' && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) ae.blur();
}

function unlockScroll() {
  if (!locked) return;
  locked = false;
  if (!hadLock) {
    document.body.classList.remove('scroll-locked');
    document.documentElement.classList.remove('scroll-locked');
  }
}

function inSheet(t) {
  return !!(t && t.closest && t.closest('#hl-sheet'));
}

export function closeHistorySheet() {
  const back = document.getElementById('hl-sheet-backdrop');
  const sheet = document.getElementById('hl-sheet');
  if (sheet) sheet.classList.remove('is-open');
  if (back) back.classList.remove('is-open');
  if (sheetBody && sheetCard && sheetCard.isConnected) sheetCard.appendChild(sheetBody);
  sheetBody = null;
  sheetCard = null;
  unlockScroll();
}

export function openHistorySheet(entry) {
  if (!entry || !entry.card) return;
  closeHistorySheet();
  const { back, sheet } = sheetEls();
  const body = entry.card.querySelector(':scope > .hc-body');
  sheetCard = entry.card;
  sheetBody = body;
  const wrap = document.createElement('div');
  wrap.className = `hc-card is-open hl-detail is-${entry.tone}`;
  if (body) wrap.appendChild(body);
  sheet.innerHTML = `<div class="cm-sheet-grab" aria-hidden="true"></div><div class="cm-sheet-head"><div class="title title-md cm-sheet-title">${entry.title}</div><div class="cm-sheet-amt">${entry.amt}</div></div><div class="hl-sheet-sub">${entry.sub}${entry.tag ? `<span class="hl-sheet-tag is-${entry.tone}">${esc(entry.tag)}</span>` : ''}</div>`;
  sheet.appendChild(wrap);
  sheet.scrollTop = 0;
  lockScroll();
  armedAt = Date.now() + 250;
  back.classList.add('is-open');
  sheet.classList.add('is-open');
}

window.closeHistorySheet = closeHistorySheet;
window.hlOpenCard = (card) => {
  const holder = card && card.closest && card.closest('.hl-src');
  const list = holder && holder.parentElement;
  if (list) { adopt(list); rebuild(list); }
  const led = list && list.querySelector(':scope > .hl-ledger');
  if (!led || !led._entries) return false;
  const e = led._entries.find((x) => x.card === card);
  if (!e) return false;
  openHistorySheet(e);
  return true;
};

function armed() {
  return Date.now() >= armedAt;
}

function onSheetOpen() {
  const s = document.getElementById('hl-sheet');
  return !!(s && s.classList.contains('is-open'));
}

if (typeof document !== 'undefined' && !window.__hlBound) {
  window.__hlBound = true;

  document.addEventListener('click', (e) => {
    const month = e.target.closest && e.target.closest('[data-hl-month]');
    if (month) {
      const sec = month.closest('.cm-month');
      if (sec) month.setAttribute('aria-expanded', sec.classList.toggle('is-collapsed') ? 'false' : 'true');
      return;
    }
    const row = e.target.closest && e.target.closest('.hl-row');
    if (row) {
      if (Date.now() < blockOpenUntil) return;
      const led = row.closest('.hl-ledger');
      const entry = led && led._entries && led._entries[Number(row.dataset.i)];
      if (entry) openHistorySheet(entry);
      return;
    }
    if (inSheet(e.target) && e.target.closest('.hc-actions button, .hc-actions a')) closeHistorySheet();
  }, true);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && onSheetOpen()) closeHistorySheet(); });

  const outside = (e) => {
    if (!onSheetOpen() || !armed() || inSheet(e.target)) return;
    blockOpenUntil = Date.now() + 450;
    closeHistorySheet();
  };
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('touchstart', outside, { capture: true, passive: true });
  document.addEventListener('wheel', (e) => {
    if (!onSheetOpen()) return;
    if (!inSheet(e.target)) { if (armed()) { blockOpenUntil = Date.now() + 450; closeHistorySheet(); } e.preventDefault(); return; }
    const sh = document.getElementById('hl-sheet');
    const atTop = sh.scrollTop <= 0 && e.deltaY < 0;
    const atEnd = sh.scrollTop + sh.clientHeight >= sh.scrollHeight - 1 && e.deltaY > 0;
    if (atTop || atEnd) e.preventDefault();
  }, { capture: true, passive: false });
  let ty = 0;
  document.addEventListener('touchstart', (e) => { if (e.touches[0]) ty = e.touches[0].clientY; }, { capture: true, passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!onSheetOpen()) return;
    if (!inSheet(e.target)) { if (armed()) { blockOpenUntil = Date.now() + 450; closeHistorySheet(); } if (e.cancelable) e.preventDefault(); return; }
    const sh = document.getElementById('hl-sheet');
    const dy = (e.touches[0] ? e.touches[0].clientY : ty) - ty;
    const atTop = sh.scrollTop <= 0 && dy > 0;
    const atEnd = sh.scrollTop + sh.clientHeight >= sh.scrollHeight - 1 && dy < 0;
    if ((atTop || atEnd) && e.cancelable) e.preventDefault();
  }, { capture: true, passive: false });
  window.addEventListener('scroll', (e) => { if (onSheetOpen() && armed() && !inSheet(e.target)) closeHistorySheet(); }, { capture: true, passive: true });
  document.addEventListener('focusin', (e) => { if (onSheetOpen() && !inSheet(e.target) && armed()) closeHistorySheet(); });

  const init = () => LISTS.forEach((id) => { const el = document.getElementById(id); if (el) watchList(el); });
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; init(); });
  };
  const start = () => {
    init();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
}
