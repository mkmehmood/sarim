import { esc, generateUUID } from './business.js';
import { fmtAmt } from './batch-common.js';
const _when = (ts) => {
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? d.toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
};
export const newCalcId = () => generateUUID('calc');
function _table(rec) {
  const u = rec.unit === 'g' ? 'g' : 'kg';
  const f = (v) => fmtAmt(Number(v) || 0, u);
  const rows = Array.isArray(rec.rows) ? rec.rows : [];
  if (rec.kind === 'fix') {
    const body = rows.map((r) => `<tr><td>${esc(r.n)}</td><td>${f(r.p)}</td><td class="bm-strong">${Number(r.a) > 0 ? '+' + f(r.a) : '0'}</td><td>${f(r.t)}</td></tr>`).join('');
    return `<div class="bm-table-wrap"><table class="bm-table"><thead><tr><th>Ingredient</th><th>Now (${u})</th><th>Add (${u})</th><th>Final (${u})</th></tr></thead><tbody>${body}</tbody></table></div>`;
  }
  const body = rows.map((r) => `<tr><td>${esc(r.n)}</td><td>${f(r.p)}</td><td class="bm-strong">${f(r.t)}</td></tr>`).join('');
  return `<div class="bm-table-wrap"><table class="bm-table"><thead><tr><th>Ingredient</th><th>Per unit (${u})</th><th>Needed (${u})</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
function _headline(rec) {
  const u = rec.unit === 'g' ? 'g' : 'kg';
  if (rec.kind === 'fix') return `Add ${fmtAmt(Number(rec.addTotal) || 0, u)} ${u}`;
  return `${fmtAmt(Number(rec.totalWeight) || 0, u)} ${u}`;
}
export function renderSavedList(records, editFn, deleteFn) {
  return records.map((rec) => {
    const id = esc(rec.id);
    return `<details class="bs-item"><summary><span class="bs-sname">${esc(rec.name || 'Untitled')}</span><span class="bs-smeta">${esc(_headline(rec))}<br>${esc(_when(rec.updatedAt || rec.createdAt))}</span></summary><div class="bs-body">${_table(rec)}<div class="bs-actions"><button type="button" class="bs-btn" onclick="${editFn}('${id}')">Edit</button><button type="button" class="bs-btn bs-del" onclick="${deleteFn}('${id}')">Delete</button></div></div></details>`;
  }).join('');
}
export function setSaveButtons(btnId, cancelId, editing) {
  const b = document.getElementById(btnId);
  if (b) b.textContent = editing ? 'Update' : 'Save';
  const c = document.getElementById(cancelId);
  if (c) c.hidden = !editing;
}
