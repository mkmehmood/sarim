import { formatMonthYear } from './date-format.js';

const LISTS = ['historyList', 'custHistoryList', 'prodHistoryList', 'paymentHistoryList', 'repHistoryList', 'factoryHistoryList', 'factoryPurchaseHistory', 'paymentTransferHistoryList', 'stockTransferHistoryList', 'dailyLedgerList', 'expenseManagementHistoryList'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
const DATE_HEAD = /^\s*\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}(?:\s*@\s*(\d{1,2}:\d{2}(?::\d{2})?\s*[AP]M))?/i;
function kindOf(listId, e) {
  if (e.dkind) return e.dkind;
  const t = e.tag;
  if (/credit|pending|unpaid|partial|debt|due|rep return/i.test(t)) return 'cr';
  if (/collection|^in$|received|reconcil|return|payment in/i.test(t)) return 'in';
  if (/^out$|expense|payment out|money out/i.test(t) || listId === 'expenseManagementHistoryList') return 'out';
  if (e.tone === 'bad') return 'out';
  if (e.tone === 'warn') return 'cr';
  return 'cash';
}
const TAG_BY_KIND = { in: 'paid', cr: 'pending', out: 'is-bad', cash: '' };
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
  const chips = Array.from(body.querySelectorAll('.hc-chips > *')).map((c) => c.textContent.trim()).filter(Boolean);
  const supply = chips.filter((c) => /^supply date/i.test(c));
  const others = chips.filter((c) => !/^supply date/i.test(c));
  let info = '';
  supply.forEach((c) => { info += `<div class="st-font-size__8113a0 st-color__5872de st-margin-top__7a21c6 st-font-style__e698a0">${esc(c.replace(/^supply date\s*/i, 'Supply Date: '))}</div>`; });
  const q = mets.find((m) => /^quantity$/i.test(m.l.trim()));
  const rt = mets.find((m) => /^rate$/i.test(m.l.trim()));
  if (q && rt) { used.add(q); used.add(rt); info += `<div class="u-fs-sm2 u-text-muted">${esc(plain(q.v))} @ ${esc(plain(rt.v).replace(/\/kg/i, ''))} = ${e.amt}</div>`; }
  if (others.length) info += `<div class="u-5d1cf22 text-xs">${esc(others.join(' \u00b7 '))}</div>`;
  const note = body.querySelector('.hc-note');
  if (note && plain(note.innerHTML)) info += `<div class="u-5d1cf22 text-xs">${note.innerHTML}</div>`;
  const kv = (l, v) => `<div class="txn-balance-after"><span>${esc(l)}</span><b>${v}</b></div>`;
  let rows = '';
  const bal = card.getAttribute('data-bal');
  if (bal) rows += `<div class="txn-balance-after txn-balance-${card.getAttribute('data-bal-tone') === 'debt' ? 'debt' : 'clear'}"><span>Balance after</span><b>${esc(bal)}</b></div>`;
  rows += mets.filter((m) => !used.has(m)).map((m) => kv(m.l, m.v)).join('');
  rows += Array.from(body.querySelectorAll('.hc-mat')).map((m) => kv((m.querySelector('.hc-mat-name') || {}).textContent || '', (m.querySelector('.hc-mat-val') || {}).innerHTML || '')).join('');
  return { info, rows };
}

function parseCard(card, listId) {
  const date = card.getAttribute('data-date') || '';
  const q = (sel) => card.querySelector(':scope > .hc-head ' + sel);
  const tag = q('.hc-tag');
  const title = q('.hc-title');
  const sub = q('.hc-sub');
  const amt = q('.hc-amt');
  const amtHtml = amt ? amt.innerHTML : '';
  const subHtml = sub ? sub.innerHTML : '';
  const isKgAmt = /kg/i.test(plain(amtHtml));
  const e = {
    card,
    tone: toneOf(card),
    dkey: DATE_RE.test(date.slice(0, 10)) ? date.slice(0, 10) : '',
    title: title ? title.innerHTML : '',
    sub: subHtml,
    amt: amtHtml,
    tag: tag ? tag.textContent.trim() : '',
    rec: card.getAttribute('data-rec') || '',
    dkind: card.getAttribute('data-kind') || '',
    kg: kgOf(card, amtHtml, subHtml),
    qtyRate: qtyRateOf(card),
    money: isKgAmt ? 0 : numOf(amtHtml)
  };
  e.kind = kindOf(listId, e);
  return e;
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
  return e.tag ? `<span class="badge status-badge ${TAG_BY_KIND[e.kind] || ''}">${esc(e.tag.toUpperCase())}</span>` : '';
}

function rowHtml(e, idx) {
  const isIn = e.kind === 'in' && e.money > 0;
  return `<button type="button" class="row cm-row hl-row cm-${e.kind} is-${e.tone}" data-i="${idx}" data-rec="${esc(e.rec)}"><span class="cm-main"><span class="cm-title"><i class="cm-dot"></i>${e.title}${tagHtml(e)}</span><span class="cm-sub">${rowSub(e)}</span></span><span class="cm-amt"><b class="${isIn ? 'is-in' : ''}">${isIn ? '+ ' : ''}${e.amt}</b></span></button>`;
}

const CHEV = '<svg class="cm-chev" width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 6l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const localKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const byKeyDesc = (a, b) => (a.key === 'undated' ? 1 : b.key === 'undated' ? -1 : a.key < b.key ? 1 : a.key > b.key ? -1 : 0);
const entriesWord = (n) => (n === 1 ? '1 entry' : `${n} entries`);

function refreshSelected() {
  const on = new Set(Array.from(document.querySelectorAll('[data-pp-box].on')).map((b) => b.getAttribute('data-pp-box')));
  document.querySelectorAll('.hl-row[data-rec]').forEach((row) => row.classList.toggle('is-selected', on.has(row.dataset.rec)));
}

function isOpen(list, key, dflt) {
  const st = list._hlOpen || (list._hlOpen = {});
  return key in st ? st[key] : dflt;
}

function headHtml(cls, key, name, count, sum, open) {
  return `<button type="button" class="${cls}" data-hl-toggle="${esc(key)}" aria-expanded="${open}"><span class="cm-month-name">${esc(name)}</span><span class="cm-month-count">${esc(count)}</span><span class="cm-month-sum">${esc(sum)}</span>${CHEV}</button>`;
}

function dayHtml(list, D, today) {
  const dKey = `d:${D.key}`;
  const open = isOpen(list, dKey, D.key === today);
  const dd = D.key === 'undated' ? null : new Date(D.key + 'T00:00:00');
  const ok = dd && !isNaN(dd.getTime());
  const S = summarize(list.id, D.items);
  const bits = [];
  if (S.kgText) bits.push(S.kgText);
  S.parts.forEach((p) => bits.push(p.replace(' ', ': ')));
  const cnt = entriesWord(D.items.length);
  const dateCol = ok ? `<span class="cm-date"><b>${dd.getDate()}</b><span>${dd.toLocaleDateString('en-US', { weekday: 'short' })}</span></span>` : '<span class="cm-date"><b>--</b></span>';
  return `<div class="card cm-day hl-day${open ? '' : ' is-collapsed'}" data-day="${esc(D.key)}"><button type="button" class="hl-day-head" data-hl-toggle="${esc(dKey)}" aria-expanded="${open}">${dateCol}<span class="hl-day-sum"><b>${esc(cnt)}</b><span>${esc(bits.join(' | '))}</span></span>${CHEV}</button><div class="hl-day-body">${D.items.map((e) => rowHtml(e, e.i)).join('')}</div></div>`;
}

function rebuild(list) {
  const src = list.querySelector(':scope > .hl-src');
  const led = list.querySelector(':scope > .hl-ledger');
  if (!src || !led) return;
  const cards = Array.from(src.children).filter((c) => c.classList.contains('hc-card'));
  const vis = cards.filter(isVisible);
  const today = localKey(new Date());
  const sig = `${today}:${cards.length}:${vis.map((c) => cards.indexOf(c)).join(',')}`;
  if (sigs.get(list) === sig) return;
  sigs.set(list, sig);
  led._entries = vis.map((c) => parseCard(c, list.id));
  const entries = led._entries;
  if (!entries.length) { led.innerHTML = ''; return; }
  const years = [];
  const yIdx = {};
  entries.forEach((e, i) => {
    e.i = i;
    const dk = e.dkey || 'undated';
    const mk = e.dkey ? e.dkey.slice(0, 7) : 'undated';
    const yk = e.dkey ? e.dkey.slice(0, 4) : 'undated';
    let Y = yIdx[yk];
    if (!Y) { Y = yIdx[yk] = { key: yk, months: [], mIdx: {}, items: [] }; years.push(Y); }
    let M = Y.mIdx[mk];
    if (!M) { M = Y.mIdx[mk] = { key: mk, days: [], dIdx: {}, items: [] }; Y.months.push(M); }
    let D = M.dIdx[dk];
    if (!D) { D = M.dIdx[dk] = { key: dk, items: [] }; M.days.push(D); }
    D.items.push(e); M.items.push(e); Y.items.push(e);
  });
  years.sort(byKeyDesc);
  years.forEach((Y) => Y.months.sort(byKeyDesc));
  const curY = today.slice(0, 4);
  const curM = today.slice(0, 7);
  const hasY = years.some((Y) => Y.key === curY);
  const hasM = years.some((Y) => Y.months.some((M) => M.key === curM));
  const latestY = years[0].key;
  const latestM = years[0].months[0].key;
  let html = '';
  years.forEach((Y) => {
    const yKey = `y:${Y.key}`;
    const yOpen = isOpen(list, yKey, hasY ? Y.key === curY : Y.key === latestY);
    let mHtml = '';
    Y.months.forEach((M) => {
      M.days.sort(byKeyDesc);
      const mKey = `m:${M.key}`;
      const mOpen = isOpen(list, mKey, hasM ? M.key === curM : M.key === latestM);
      const md = M.key === 'undated' ? null : new Date(M.key + '-01T00:00:00');
      const name = md && !isNaN(md.getTime()) ? formatMonthYear(md) : 'No date';
      const S = summarize(list.id, M.items);
      mHtml += `<section class="cm-month hl-month${mOpen ? '' : ' is-collapsed'}">${headHtml('cm-month-head', mKey, name, S.kgText || entriesWord(M.items.length), S.parts.join(' \u00b7 '), mOpen)}<div class="cm-month-body">${M.days.map((D) => dayHtml(list, D, today)).join('')}</div></section>`;
    });
    const SY = summarize(list.id, Y.items);
    html += `<section class="cm-month hl-year${yOpen ? '' : ' is-collapsed'}">${headHtml('cm-month-head hl-year-head', yKey, Y.key === 'undated' ? 'No date' : Y.key, SY.kgText || entriesWord(Y.items.length), SY.parts.join(' \u00b7 '), yOpen)}<div class="cm-month-body">${mHtml}</div></section>`;
  });
  led.innerHTML = html;
  refreshSelected();
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

function isOverlay(t) {
  return !!(t && t.closest && t.closest('#photo-lightbox-modal, #pp-sharebar'));
}

function inSheet(t) {
  return !!(t && t.closest && t.closest('#hl-sheet'));
}

let sheetActs = null;
let sheetActsParent = null;
let sheetEdit = null;
let sheetExtras = [];
const KNOWN_PARTS = ['hc-chips', 'hc-metrics', 'hc-more', 'hc-note', 'hc-actions'];

export function closeHistorySheet() {
  const back = document.getElementById('hl-sheet-backdrop');
  const sheet = document.getElementById('hl-sheet');
  if (sheet) { sheet.classList.remove('is-open', 'is-good', 'is-warn', 'is-bad', 'is-info', 'is-muted'); }
  if (back) back.classList.remove('is-open');
  if (sheetEdit) { sheetEdit.classList.replace('btn-main', 'btn-theme'); sheetEdit.classList.add('btn-sm'); }
  if (sheetActs && sheetActsParent && sheetActsParent.isConnected) sheetActsParent.appendChild(sheetActs);
  sheetExtras.forEach((x) => { if (x.parent && x.parent.isConnected) x.parent.insertBefore(x.node, x.next && x.next.parentNode === x.parent ? x.next : null); });
  sheetExtras = [];
  sheetActs = null;
  sheetActsParent = null;
  sheetEdit = null;
  unlockScroll();
  refreshSelected();
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
  sheet.innerHTML = `<div class="cm-sheet-grab" aria-hidden="true"></div><div class="cm-sheet-head"><div class="title title-md cm-sheet-title">${entry.title}</div><div class="cm-sheet-amt">${entry.amt}</div></div><div class="cm-sheet-body"><div class="cust-history-info"><div class="u-fs-sm2 u-text-muted">${entry.sub}</div>${det.info}</div></div>${det.rows}`;
  const inner = body ? body.querySelector(':scope > .hc-body-in') : null;
  if (inner) {
    const extras = Array.from(inner.children).filter((n) => !KNOWN_PARTS.some((c) => n.classList.contains(c)));
    if (extras.length) {
      const box = document.createElement('div');
      box.className = 'hl-extra';
      extras.forEach((n) => { sheetExtras.push({ node: n, parent: inner, next: n.nextSibling }); box.appendChild(n); });
      sheet.querySelector('.cm-sheet-body').after(box);
    }
  }
  if (acts) {
    const bar = document.createElement('div');
    bar.className = 'cm-sheet-actions hl-sheet-actions';
    bar.appendChild(acts);
    sheet.appendChild(bar);
    sheetEdit = acts.querySelector('.btn-theme');
    if (sheetEdit) { sheetEdit.classList.replace('btn-theme', 'btn-main'); sheetEdit.classList.remove('btn-sm'); }
  }
  sheet.classList.add(`is-${entry.tone}`);
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
    const tog = e.target.closest && e.target.closest('[data-hl-toggle]');
    if (tog) {
      const box = tog.closest('.cm-month, .hl-day');
      const led = tog.closest('.hl-ledger');
      if (box) {
        const closed = box.classList.toggle('is-collapsed');
        tog.setAttribute('aria-expanded', closed ? 'false' : 'true');
        const list = led && led.parentElement;
        if (list) (list._hlOpen || (list._hlOpen = {}))[tog.dataset.hlToggle] = !closed;
      }
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
    if (e.target.closest && e.target.closest('[data-pp-box], #pp-sharebar')) setTimeout(refreshSelected, 60);
    if (inSheet(e.target) && e.target.closest('[data-pp-box]')) setTimeout(closeHistorySheet, 420);
    if (inSheet(e.target) && e.target.closest('.hc-actions button, .hc-actions a')) closeHistorySheet();
  }, true);

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && onSheetOpen()) closeHistorySheet(); });

  const outside = (e) => {
    if (!onSheetOpen() || !armed() || inSheet(e.target) || isOverlay(e.target)) return;
    blockOpenUntil = Date.now() + 450;
    closeHistorySheet();
  };
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('touchstart', outside, { capture: true, passive: true });
  document.addEventListener('wheel', (e) => {
    if (!onSheetOpen() || isOverlay(e.target)) return;
    if (!inSheet(e.target)) { if (armed()) { blockOpenUntil = Date.now() + 450; closeHistorySheet(); } e.preventDefault(); return; }
    const sh = document.getElementById('hl-sheet');
    const atTop = sh.scrollTop <= 0 && e.deltaY < 0;
    const atEnd = sh.scrollTop + sh.clientHeight >= sh.scrollHeight - 1 && e.deltaY > 0;
    if (atTop || atEnd) e.preventDefault();
  }, { capture: true, passive: false });
  let ty = 0;
  document.addEventListener('touchstart', (e) => { if (e.touches[0]) ty = e.touches[0].clientY; }, { capture: true, passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!onSheetOpen() || isOverlay(e.target)) return;
    if (!inSheet(e.target)) { if (armed()) { blockOpenUntil = Date.now() + 450; closeHistorySheet(); } if (e.cancelable) e.preventDefault(); return; }
    const sh = document.getElementById('hl-sheet');
    const dy = (e.touches[0] ? e.touches[0].clientY : ty) - ty;
    const atTop = sh.scrollTop <= 0 && dy > 0;
    const atEnd = sh.scrollTop + sh.clientHeight >= sh.scrollHeight - 1 && dy < 0;
    if ((atTop || atEnd) && e.cancelable) e.preventDefault();
  }, { capture: true, passive: false });
  window.addEventListener('scroll', (e) => { if (onSheetOpen() && armed() && !inSheet(e.target)) closeHistorySheet(); }, { capture: true, passive: true });
  document.addEventListener('focusin', (e) => { if (onSheetOpen() && !inSheet(e.target) && !isOverlay(e.target) && armed()) closeHistorySheet(); });

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
