import { formatMonthYear } from './date-format.js';

const LISTS = ['historyList', 'custHistoryList', 'prodHistoryList', 'paymentHistoryList', 'repHistoryList', 'factoryHistoryList', 'factoryPurchaseHistory', 'paymentTransferHistoryList', 'stockTransferHistoryList', 'dailyLedgerList', 'expenseManagementHistoryList'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const COLLAPSE_AFTER = 40;

const esc = (v) => (v == null ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'));
const isVisible = (c) => c.style.display !== 'none' && !c.classList.contains('d-none') && !c.classList.contains('hidden');
const toneOf = (c) => ['good', 'bad', 'warn', 'info', 'muted'].find((t) => c.classList.contains('is-' + t)) || 'muted';

const sigs = new WeakMap();
const srcObservers = new WeakMap();
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

const NF = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const plain = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&bull;|&middot;/g, ' ').replace(/\s+/g, ' ').trim();
const numOf = (h) => { const m = plain(h).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : 0; };
const TAG_CLS = { good: 'paid', warn: 'pending', bad: 'is-bad', info: '', muted: '' };
const IN_TAG = /collection|^in$|received|reconciled|return/i;
const DATE_HEAD = /^\s*\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:\s*@\s*(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M))?/i;
const DOT = { good: 'cm-in', warn: 'cm-cr', bad: 'cm-out' };
const SUMS = {
  custHistoryList: { kgWord: 'kg sold', a: ['Sold', (e) => !/collection|reconciled|rep return/i.test(e.tag)], b: ['Received', (e) => /collection|paid|cash|received/i.test(e.tag)] },
  paymentHistoryList: { a: ['In', (e) => /^in$/i.test(e.tag)], b: ['Out', (e) => /^out$/i.test(e.tag)] },
  historyList: { a: ['Revenue', () => true] },
  prodHistoryList: { kgWord: 'kg' },
  repHistoryList: { kgWord: 'kg sold', a: ['Sold', (e) => !/collection|reconciled|rep return/i.test(e.tag)], b: ['Received', (e) => /collection|paid|cash|received/i.test(e.tag)] },
  factoryPurchaseHistory: { kgWord: 'kg', a: ['Purchased', () => true] },
  factoryHistoryList: { a: ['Cost', () => true] },
  expenseManagementHistoryList: { a: ['Spent', () => true] },
  paymentTransferHistoryList: { a: ['Moved', () => true] },
  stockTransferHistoryList: { kgWord: 'kg' },
  dailyLedgerList: { a: ['Total', () => true] }
};

function kgOf(card, amtHtml, subHtml) {
  if (/kg/i.test(plain(amtHtml))) return numOf(amtHtml);
  const metric = Array.from(card.querySelectorAll('.hc-metric')).find((m) => /quantity|weight|returned/i.test(m.querySelector('dt') ? m.querySelector('dt').textContent : ''));
  if (metric) { const v = metric.querySelector('dd'); if (v && /kg/i.test(v.textContent)) return numOf(v.innerHTML); }
  const m = plain(subHtml).replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*kg/i);
  return m ? parseFloat(m[1]) : 0;
}

function metricList(card) {
  return Array.from(card.querySelectorAll('.hc-metric')).map((m) => ({ l: (m.querySelector('dt') || {}).textContent || '', v: (m.querySelector('dd') || {}).innerHTML || '' })).filter((m) => plain(m.v));
}

function qtyRateOf(card) {
  const mets = metricList(card);
  const q = mets.find((m) => /^quantity$/i.test(m.l.trim()));
  const rt = mets.find((m) => /^rate$/i.test(m.l.trim()));
  return q && rt ? `${plain(q.v)} @ ${plain(rt.v).replace(/\/kg/i, '')}` : '';
}

function detailHtml(card, e) {
  const body = card.querySelector(':scope > .hc-body');
  if (!body) return { info: '', rows: '' };
  const mets = metricList(body);
  const used = new Set();
  let info = '';
  Array.from(body.querySelectorAll('.hc-chips > *')).map((c) => c.textContent.trim()).filter(Boolean).forEach((c) => { info += `<div class="hl-line is-soft">${esc(c)}</div>`; });
  const q = mets.find((m) => /^quantity$/i.test(m.l.trim()));
  const rt = mets.find((m) => /^rate$/i.test(m.l.trim()));
  if (q && rt) { used.add(q); used.add(rt); info += `<div class="hl-line">${esc(plain(q.v))} @ ${esc(plain(rt.v).replace(/\/kg/i, ''))} = ${e.amt}</div>`; }
  const note = body.querySelector('.hc-note');
  if (note && plain(note.innerHTML)) info += `<div class="hl-line is-soft">${note.innerHTML}</div>`;
  const kv = (l, v) => `<div class="txn-balance-after"><span>${esc(l)}</span><b>${v}</b></div>`;
  let rows = mets.filter((m) => !used.has(m)).map((m) => kv(m.l, m.v)).join('');
  rows += Array.from(body.querySelectorAll('.hc-mat')).map((m) => kv((m.querySelector('.hc-mat-name') || {}).textContent || '', (m.querySelector('.hc-mat-val') || {}).innerHTML || '')).join('');
  return { info, rows };
}

function parseCard(card) {
  const date = card.getAttribute('data-date') || '';
  const q = (sel) => card.querySelector(':scope > .hc-head ' + sel);
  const tag = q('.hc-tag');
  const title = q('.hc-title');
  const sub = q('.hc-sub');
  const amt = q('.hc-amt');
  const amtHtml = amt ? amt.innerHTML : '';
  const subHtml = sub ? sub.innerHTML : '';
  const isKgAmt = /kg/i.test(plain(amtHtml));
  return {
    card,
    tone: toneOf(card),
    dkey: DATE_RE.test(date.slice(0, 10)) ? date.slice(0, 10) : '',
    title: title ? title.innerHTML : '',
    sub: subHtml,
    amt: amtHtml,
    tag: tag ? tag.textContent.trim() : '',
    kg: kgOf(card, amtHtml, subHtml),
    qtyRate: qtyRateOf(card),
    money: isKgAmt ? 0 : numOf(amtHtml)
  };
}

function summarize(listId, items) {
  const cfg = SUMS[listId] || { a: ['Total', () => true] };
  const out = { kg: 0, a: 0, b: 0 };
  items.forEach((e) => {
    out.kg += e.kg;
    if (cfg.a && e.money && cfg.a[1](e)) out.a += e.money;
    if (cfg.b && e.money && cfg.b[1](e)) out.b += e.money;
  });
  const parts = [];
  if (cfg.a && (out.a || !out.kg)) parts.push(`${cfg.a[0]} ${NF.format(out.a)}`);
  if (cfg.b) parts.push(`${cfg.b[0]} ${NF.format(out.b)}`);
  return { kg: out.kg, kgText: out.kg > 0 ? `${NF.format(out.kg)} ${cfg.kgWord || 'kg'}` : '', parts, cfg, vals: out };
}

function rowSub(e) {
  const m = e.sub.match(DATE_HEAD);
  if (!m) return e.sub;
  const rest = e.sub.slice(m[0].length);
  const parts = [e.qtyRate, m[1]].filter(Boolean).join(' \u00b7 ');
  return parts + rest;
}

function tagHtml(e) {
  return e.tag ? `<span class="badge status-badge ${TAG_CLS[e.tone] || ''}">${esc(e.tag.toUpperCase())}</span>` : '';
}

function rowHtml(e, idx, first) {
  const d = e.dkey ? new Date(e.dkey + 'T00:00:00') : null;
  const ok = d && !isNaN(d.getTime());
  const dnum = ok ? d.getDate() : '';
  const dwk = ok ? d.toLocaleDateString('en-US', { weekday: 'short' }) : '';
  const isIn = IN_TAG.test(e.tag) && e.money > 0;
  return `<button type="button" class="row cm-row hl-row ${DOT[e.tone] || ''}" data-i="${idx}"><span class="cm-date">${first && ok ? `<b>${dnum}</b><span>${dwk}</span>` : ''}</span><span class="cm-main"><span class="cm-title"><i class="cm-dot"></i>${e.title}${tagHtml(e)}</span><span class="cm-sub">${rowSub(e)}</span></span><span class="cm-amt"><b class="${isIn ? 'is-in' : ''}">${isIn ? '+ ' : ''}${e.amt}</b></span></button>`;
}

function dayFoot(listId, items) {
  const S = summarize(listId, items);
  const bits = [];
  if (S.kgText) bits.push(S.kgText);
  S.parts.forEach((p) => bits.push(p.replace(' ', ': ')));
  if (!bits.length || (!S.kgText && items.length > 1 && bits.length === 1)) bits.unshift(items.length === 1 ? '1 entry' : `${items.length} entries`);
  return `<div class="cm-day-foot"><span>${bits.join(' | ')}</span></div>`;
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
    if (!M) { M = mIdx[mk] = { key: mk, days: [], dIdx: {}, items: [] }; months.push(M); }
    const dk = e.dkey || 'undated';
    let D = M.dIdx[dk];
    if (!D) { D = M.dIdx[dk] = { key: dk, items: [] }; M.days.push(D); }
    D.items.push(e);
    M.items.push(e);
  });
  const byKeyDesc = (a, b) => (a.key === 'undated' ? 1 : b.key === 'undated' ? -1 : a.key < b.key ? 1 : a.key > b.key ? -1 : 0);
  months.sort(byKeyDesc);
  months.forEach((M) => M.days.sort(byKeyDesc));
  const many = entries.length > COLLAPSE_AFTER;
  led.classList.remove('is-comfortable');
  let html = '';
  months.forEach((M, mi) => {
    const days = M.days.map((D) => `<div class="card cm-day hl-day" data-day="${esc(D.key)}">${D.items.map((e, i) => rowHtml(e, e.i, i === 0)).join('')}${dayFoot(list.id, D.items)}</div>`).join('');
    const md = M.key === 'undated' ? null : new Date(M.key + '-01T00:00:00');
    const name = md && !isNaN(md.getTime()) ? formatMonthYear(md) : 'No date';
    const collapsed = many && mi > 0;
    const S = summarize(list.id, M.items);
    const count = S.kgText || (M.items.length === 1 ? '1 entry' : `${M.items.length} entries`);
    html += `<section class="cm-month${collapsed ? ' is-collapsed' : ''}"><button type="button" class="cm-month-head" data-hl-month aria-expanded="${collapsed ? 'false' : 'true'}"><span class="cm-month-name">${esc(name)}</span><span class="cm-month-count">${esc(count)}</span><span class="cm-month-sum">${esc(S.parts.join(' \u00b7 '))}</span><svg class="cm-chev" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button><div class="cm-month-body">${days}</div></section>`;
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

let sheetActs = null;
let sheetActsParent = null;
let sheetEdit = null;

export function closeHistorySheet() {
  const back = document.getElementById('hl-sheet-backdrop');
  const sheet = document.getElementById('hl-sheet');
  if (sheet) sheet.classList.remove('is-open');
  if (back) back.classList.remove('is-open');
  if (sheetEdit) { sheetEdit.classList.replace('btn-main', 'btn-theme'); sheetEdit.classList.add('btn-sm'); }
  if (sheetActs && sheetActsParent && sheetActsParent.isConnected) sheetActsParent.appendChild(sheetActs);
  sheetActs = null;
  sheetActsParent = null;
  sheetEdit = null;
  unlockScroll();
}

export function openHistorySheet(entry) {
  if (!entry || !entry.card) return;
  closeHistorySheet();
  const { back, sheet } = sheetEls();
  const body = entry.card.querySelector(':scope > .hc-body');
  const acts = body ? body.querySelector('.hc-actions') : null;
  sheetActs = acts;
  sheetActsParent = acts ? acts.parentElement : null;
  const det = detailHtml(entry.card, entry);
  sheet.innerHTML = `<div class="cm-sheet-grab" aria-hidden="true"></div><div class="cm-sheet-head"><div class="title title-md cm-sheet-title">${entry.title}</div><div class="cm-sheet-amt">${entry.amt}</div></div><div class="cm-sheet-body"><div class="cust-history-info"><div>${entry.sub}</div>${det.info}</div></div>${det.rows}`;
  if (acts) {
    const bar = document.createElement('div');
    bar.className = 'cm-sheet-actions hl-sheet-actions';
    bar.appendChild(acts);
    sheet.appendChild(bar);
    sheetEdit = acts.querySelector('.btn-theme');
    if (sheetEdit) { sheetEdit.classList.replace('btn-theme', 'btn-main'); sheetEdit.classList.remove('btn-sm'); }
  }
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
