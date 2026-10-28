import { formatDayMonthYear } from './date-format.js';
import { esc, generateUUID } from './business.js';
import { fixed3, fmtAmt, show } from './batch-common.js';
import { hcCardHtml } from './history-card.js';
const _when = (ts) => {
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? `${formatDayMonthYear(d)} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : '';
};
export const newCalcId = () => generateUUID('calc');
function _metrics(rec, f, u) {
  if (rec.kind === 'fix') {
    return [
      { label: 'Remaining batch', value: `${f(rec.remaining)} ${u}`, cls: 'qty-val' },
      { label: 'New total', value: `${f(rec.requiredTotal)} ${u}`, cls: 'rev-val' },
      { label: 'Total to add', value: `${f(rec.addTotal)} ${u}`, cls: 'cost-val' }
    ];
  }
  return [
    { label: 'Units', value: fixed3(Number(rec.units) || 0), cls: 'qty-val' },
    { label: 'Total batch weight', value: `${f(rec.totalWeight)} ${u}`, cls: 'rev-val' }
  ];
}
function _ingredients(rec, f, u) {
  const rows = Array.isArray(rec.rows) ? rec.rows : [];
  if (rec.kind === 'fix') return rows.map((r) => ({ label: String(r.n ?? ''), value: `${Number(r.a) > 0 ? '+' : ''}${f(r.a)} ${u}`, cls: 'qty-val' }));
  return rows.map((r) => ({ label: String(r.n ?? ''), value: `${f(r.t)} ${u}`, cls: 'qty-val' }));
}
export function renderSavedList(records, editFn, deleteFn) {
  return records.map((rec) => {
    const u = rec.unit === 'g' ? 'g' : 'kg';
    const f = (v) => fmtAmt(Number(v) || 0, u);
    const id = esc(rec.id);
    const isFix = rec.kind === 'fix';
    return hcCardHtml({
      tone: isFix ? 'warn' : 'info', icon: 'calc', title: rec.name || 'Untitled',
      sub: esc(_when(rec.updatedAt || rec.createdAt)),
      amount: isFix ? `${f(rec.addTotal)} ${u}` : `${f(rec.totalWeight)} ${u}`,
      tag: isFix ? 'Correction' : 'Batch', tagTone: isFix ? 'warn' : 'info',
      metrics: _metrics(rec, f, u),
      sections: [{ title: isFix ? 'Ingredients to add' : 'Required ingredients', metrics: _ingredients(rec, f, u) }],
      actions: `<div class="tbl-action-row"><button type="button" class="btn btn-theme btn-sm" onclick="${editFn}('${id}')">Edit</button><button type="button" class="btn btn-danger btn-sm" onclick="${deleteFn}('${id}')">Delete</button></div>`
    }, { attrs: { 'data-id': rec.id } });
  }).join('');
}
export function setSaveButtons(btnId, cancelId, editing, noun) {
  const b = document.getElementById(btnId);
  if (b) b.textContent = `${editing ? 'Update' : 'Save'} ${noun}`;
  show(cancelId, editing);
}
