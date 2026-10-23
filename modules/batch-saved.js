import { formatDayMonthYear } from './date-format.js';
import { esc, generateUUID } from './business.js';
import { fixed3, fmtAmt, show, summaryRow } from './batch-common.js';
const _when = (ts) => {
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? `${formatDayMonthYear(d)} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
};
export const newCalcId = () => generateUUID('calc');
function _headline(rec, f, u) {
  if (rec.kind === 'fix') {
    return summaryRow('Remaining Batch', `${f(rec.remaining)} ${u}`) + summaryRow('New Total', `${f(rec.requiredTotal)} ${u}`, 'rev-val') + summaryRow('Total to Add', `${f(rec.addTotal)} ${u}`, 'cost-val');
  }
  return summaryRow('Units', fixed3(Number(rec.units) || 0)) + summaryRow('Total Batch Weight', `${f(rec.totalWeight)} ${u}`, 'rev-val');
}
function _ingredients(rec, f, u) {
  const rows = Array.isArray(rec.rows) ? rec.rows : [];
  if (rec.kind === 'fix') return rows.map((r) => summaryRow(esc(r.n), `${Number(r.a) > 0 ? '+' : ''}${f(r.a)} ${u}`)).join('');
  return rows.map((r) => summaryRow(esc(r.n), `${f(r.t)} ${u}`)).join('');
}
export function renderSavedList(records, editFn, deleteFn) {
  return records.map((rec) => {
    const u = rec.unit === 'g' ? 'g' : 'kg';
    const f = (v) => fmtAmt(Number(v) || 0, u);
    const id = esc(rec.id);
    const badge = rec.kind === 'fix' ? 'Correction' : 'Batch';
    return `<div class="factory-history-item"><div class="u-a7c79e8 d-flex"><div class="u-9af2403 d-flex"><span class="u-fs-sm2 u-text-muted">${esc(_when(rec.updatedAt || rec.createdAt))}</span></div><div class="u-832bae1 d-flex"><span class="factory-badge factory-badge-formula">${badge}</span></div></div><div class="bs-name">${esc(rec.name || 'Untitled')}</div>${_headline(rec, f, u)}<details class="bs-details"><summary>${rec.kind === 'fix' ? 'Ingredients to add' : 'Required ingredients'}</summary>${_ingredients(rec, f, u)}</details><div class="tbl-action-row"><button type="button" class="tbl-action-btn edit" onclick="${editFn}('${id}')">Edit</button><button type="button" class="tbl-action-btn danger" onclick="${deleteFn}('${id}')">Delete</button></div></div>`;
  }).join('');
}
export function setSaveButtons(btnId, cancelId, editing, noun) {
  const b = document.getElementById(btnId);
  if (b) b.textContent = `${editing ? 'Update' : 'Save'} ${noun}`;
  show(cancelId, editing);
}
