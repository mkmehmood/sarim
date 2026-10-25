import { rlInitials, rlHue } from './record-list.js';

const esc = (v) => (v == null ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

const ICONS = {
  production: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  sale: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  return: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  transfer: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  in: '<path d="M17 7L7 17"/><path d="M7 9v8h8"/>',
  out: '<path d="M7 17L17 7"/><path d="M9 7h8v8"/>',
  calc: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M14 12h2M8 16h2M14 16h2"/>',
  factory: '<path d="M3 21V10l6 4v-4l6 4V6h6v15z"/>',
  collection: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  debt: '<path d="M12 3v18"/><path d="M16 7h-6a3 3 0 000 6h4a3 3 0 010 6H8"/>'
};

export function hcIcon(kind) {
  const p = ICONS[kind] || ICONS.sale;
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

export function hcChip(text, tone) {
  return text ? `<span class="badge badge-tint${tone ? ' is-' + tone : ''}">${esc(text)}</span>` : '';
}

const VALUE_CLASSES = new Set(['qty-val', 'cost-val', 'rev-val', 'profit-val', 'balance-pos', 'balance-neg']);

export function hcMetricsHtml(metrics) {
  const list = (metrics || []).filter((m) => m && m.value != null && m.value !== '');
  if (!list.length) return '';
  return `<dl class="hc-metrics">${list.map((m) => {
    const cls = VALUE_CLASSES.has(m.cls) ? ` ${m.cls}` : '';
    return `<div class="card stat hc-metric${m.wide ? ' is-wide' : ''}"><dt>${esc(m.label)}</dt><dd class="${cls.trim()}">${m.value}</dd></div>`;
  }).join('')}</dl>`;
}

export function hcExpensesHtml(entries, amt, title = 'Expenses breakdown') {
  const list = (entries || []).filter((e) => e && Number(e[1]) > 0);
  if (!list.length) return '';
  const rows = list.map(([name, value]) => `<div class="hc-mat"><span class="hc-mat-name">${esc(name)}</span><span class="hc-mat-val"><span class="cost-val">${amt(value)}</span></span></div>`).join('');
  return `<details class="hc-more"><summary>${esc(title)}</summary><div class="hc-mats">${rows}</div></details>`;
}

export function hcInnerHtml(o) {
  const tone = o.tone || 'muted';
  const lead = o.avatar != null
    ? `<div class="hc-lead is-avatar" style="--rl-hue:${rlHue(o.avatar)}" aria-hidden="true">${esc(rlInitials(o.avatar))}</div>`
    : `<div class="hc-lead">${hcIcon(o.icon)}</div>`;
  const title = o.titleHtml != null ? o.titleHtml : esc(o.title || '');
  const chips = (o.chips || []).filter(Boolean).join('');
  const sections = (o.sections || []).map((s) => {
    const m = hcMetricsHtml(s.metrics);
    return m ? `<details class="hc-more"${s.open ? ' open' : ''}><summary>${esc(s.title)}</summary>${m}</details>` : '';
  }).join('');
  return `<div class="hc-head" role="button" tabindex="0" aria-expanded="false">${lead}`
    + `<div class="hc-title-wrap"><div class="title title-sm hc-title${o.titleClass ? ' ' + o.titleClass : ''}">${title}</div>${o.sub ? `<div class="hc-sub">${o.sub}</div>` : ''}</div>`
    + ((o.amount != null && o.amount !== '') || o.tag
      ? `<div class="hc-end">${o.amount != null && o.amount !== '' ? `<div class="hc-amt">${o.amount}</div>` : ''}${o.tag ? `<div class="hc-tag${o.tagTone ? ' is-' + o.tagTone : ''}">${esc(o.tag)}</div>` : ''}</div>`
      : '')
    + `</div>`
    + `<div class="hc-body">`
    + (chips ? `<div class="hc-chips">${chips}</div>` : '')
    + hcMetricsHtml(o.metrics)
    + sections
    + (o.note ? `<p class="hc-note">${o.note}</p>` : '')
    + (o.body || '')
    + (o.actions ? `<div class="hc-actions">${o.actions}</div>` : '')
    + `</div>`;
}

function hcStartsOpen(className) {
  return /\bhighlight-card\b/.test(className || '');
}

export function hcToggle(card) {
  if (!card) return;
  const open = card.classList.toggle('is-open');
  const head = card.querySelector(':scope > .hc-head');
  if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
}

if (typeof document !== 'undefined' && !window.__hcBound) {
  window.__hcBound = true;
  document.addEventListener('click', (e) => {
    const head = e.target.closest && e.target.closest('.hc-card > .hc-head');
    if (head) hcToggle(head.parentElement);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const head = e.target.closest && e.target.closest('.hc-card > .hc-head');
    if (head && e.target === head) { e.preventDefault(); hcToggle(head.parentElement); }
  });
}

export function hcCard(o, extra = {}) {
  const el = document.createElement('div');
  el.className = `card hc-card is-${o.tone || 'muted'}${extra.className ? ' ' + extra.className : ''}${hcStartsOpen(extra.className) ? ' is-open' : ''}`;
  Object.entries(extra.attrs || {}).forEach(([k, v]) => { if (v != null && v !== '') el.setAttribute(k, v); });
  el.innerHTML = hcInnerHtml(o);
  if (el.classList.contains('is-open')) el.querySelector('.hc-head')?.setAttribute('aria-expanded', 'true');
  return el;
}

export function hcCardHtml(o, extra = {}) {
  const attrs = Object.entries(extra.attrs || {}).filter(([, v]) => v != null && v !== '').map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  return `<div class="card hc-card is-${o.tone || 'muted'}${extra.className ? ' ' + extra.className : ''}${hcStartsOpen(extra.className) ? ' is-open' : ''}"${attrs}>${hcStartsOpen(extra.className) ? hcInnerHtml(o).replace('aria-expanded="false"', 'aria-expanded="true"') : hcInnerHtml(o)}</div>`;
}

export function hcEmptyHtml(message) {
  return `<div class="hc-empty">${esc(message)}</div>`;
}
