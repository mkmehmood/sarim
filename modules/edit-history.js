import { esc } from './business.js';
import { fmtNum } from './finance.js';
import { formatDisplayDateTime } from './utilities-payments.js';

export const HISTORY_LIMIT = 100;

const TRASH = '<svg width="16" height="16" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8 10H28M14 10V7H22V10M10.5 10L12 30H24L25.5 10M15 15V25M21 15V25" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function historyActor() {
  const u = window.currentUser || {};
  return String(window._assignedManagerName || u.displayName || String(u.email || '').split('@')[0] || 'Admin');
}

export function historyStamp(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  return formatDisplayDateTime(d, time);
}

export function historyValue(key, v, fmt) {
  if (typeof fmt === 'function') {
    const custom = fmt(key, v);
    if (custom != null) return custom;
  }
  if (v === '' || v == null || (typeof v === 'number' && v === 0 && key !== 'ledgerPage')) return '\u2014';
  return typeof v === 'number' ? fmtNum(v) : String(v);
}

export function historyDiff(fields, before, after) {
  const out = [];
  for (const [key, label] of fields) {
    const a = before[key] == null ? '' : before[key];
    const b = after[key] == null ? '' : after[key];
    if (String(a) !== String(b)) out.push({ f: key, label, from: a, to: b });
  }
  return out;
}

export function pushHistory(record, changes) {
  if (!record || !changes || !changes.length) return;
  const list = Array.isArray(record.editHistory) ? record.editHistory : [];
  list.push({ at: new Date().toISOString(), by: historyActor(), changes });
  record.editHistory = list.slice(-HISTORY_LIMIT);
}

export function renderEditHistory({ cardId, boxId, record, delFn, addedLabel, fmt }) {
  const card = document.getElementById(cardId);
  const box = document.getElementById(boxId);
  if (!card || !box) return;
  if (!record) { card.classList.add('d-none'); box.replaceChildren(); return; }
  card.classList.remove('d-none');
  const all = Array.isArray(record.editHistory) ? record.editHistory : [];
  let html = all.map((h, idx) => ({ h, idx })).reverse().map(({ h, idx }) =>
    `<div class="eh-item"><div class="eh-head"><span class="eh-when">${esc(historyStamp(h.at))}</span><span class="eh-by">${esc(h.by || '')}</span>`
    + `<button type="button" class="eh-del" onclick="${delFn}(${idx})" aria-label="Delete this history entry" title="Delete this history entry">${TRASH}</button></div>`
    + (h.changes || []).map(c => `<div class="eh-change"><span class="eh-field">${esc(c.label || c.f)}</span><span class="eh-vals">${esc(historyValue(c.f, c.from, fmt))} <i>\u2192</i> ${esc(historyValue(c.f, c.to, fmt))}</span></div>`).join('')
    + '</div>').join('');
  const created = record.createdAt ? historyStamp(record.createdAt) : '';
  if (created) html += `<div class="eh-item eh-created"><div class="eh-head"><span class="eh-when">${esc(created)}</span><span class="eh-by">${esc(addedLabel || 'Added')}</span></div></div>`;
  if (!html) html = '<div class="pf-hint">No edits recorded yet.</div>';
  box.innerHTML = html;
}

export function openingBalanceOf(entity) {
  const n = Number(entity && entity.openingBalance);
  return Number.isFinite(n) ? n : 0;
}

export function openingBalanceText(v) {
  const n = Number(v) || 0;
  if (n > 0.005) return `${fmtNum(n)} credit`;
  if (n < -0.005) return `${fmtNum(-n)} debit`;
  return '\u2014';
}
