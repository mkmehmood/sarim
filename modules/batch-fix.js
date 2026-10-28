import { esc } from './business.js';
import { MAX_SAVED_CALCS, calcsOf, defaultCalcName, formulaIngredients, planCorrection, removeCalc, upsertCalc } from './batch-calc.js';
import { convertValue, el, fmtAmt, loadFormulas, markActive, pickFormula, round6, setPickerLabel, show } from './batch-common.js';
import { newCalcId, renderSavedList, setSaveButtons } from './batch-saved.js';
import { showGlassConfirm, showToast } from './customers.js';
import { getFormulaStore, updateFormulaCalcs } from './formula-store.js';
const _state = { formulas: [], formula: null, manual: null, unit: 'g', plan: null, editingId: null };
const _fmt = (v) => `${fmtAmt(v, _state.unit)} ${_state.unit}`;
const _num = (id) => parseFloat((el(id) || {}).value) || 0;
function _actualAmounts() {
  const out = {};
  document.querySelectorAll('#bfActualRows input[data-id]').forEach((i) => { out[i.dataset.id] = i.value; });
  return out;
}
function _syncUnitUi() {
  markActive('[data-bf-unit]', 'data-bf-unit', _state.unit);
  document.querySelectorAll('#batch-fix-screen .bf-u').forEach((e) => { e.textContent = _state.unit; });
}
function _fieldHtml(i, oninput) {
  return `<div class="field"><label>${esc(i.name)} (<span class="bf-u">${_state.unit}</span>)</label><input class="form-ctl" type="number" inputmode="decimal" step="any" min="0" data-id="${esc(i.id)}" oninput="${oninput}"></div>`;
}
function _renderRows() {
  const ings = _state.formula ? formulaIngredients(_state.formula) : [];
  const rows = el('bfRows');
  if (rows) {
    rows.innerHTML = ings.map((i) => `<div class="card bf-card" data-id="${esc(i.id)}"><div class="bf-card-top"><div class="bf-name">${esc(i.name)}</div><label class="bf-add"><span class="bf-add-tag">Add</span><input class="form-ctl" type="number" inputmode="decimal" step="any" min="0" data-id="${esc(i.id)}" oninput="setBatchFixAdd(this)"><span class="bf-u">${_state.unit}</span></label></div><div class="bf-meta"><span>In remaining <b data-f="present"></b></span><span>Required <b data-f="target"></b></span></div></div>`).join('');
  }
  const actual = el('bfActualRows');
  if (actual) actual.innerHTML = ings.map((i) => _fieldHtml(i, 'resetBatchFixManual()')).join('');
  _syncUnitUi();
}
export function recomputeBatchFix(skipInput) {
  const f = _state.formula;
  const original = _num('bf-original');
  const used = _num('bf-used');
  const remainEl = el('bfRemaining');
  if (remainEl) remainEl.textContent = original > 0 ? _fmt(Math.max(0, original - used)) : _fmt(0);
  const r = f ? planCorrection(f, { original, used, actual: _actualAmounts(), manual: _state.manual }) : { ok: false, error: 'empty' };
  _state.plan = r.ok ? r : null;
  const empty = el('bfEmpty');
  if (empty) empty.textContent = r.error === 'nothing-left' ? 'Used / Lost must be less than the Original Batch' : (f ? 'Enter the original batch weight' : 'Select a formula');
  show('bfEmpty', !r.ok);
  show('bfBody', r.ok);
  if (!r.ok) return;
  r.rows.forEach((x) => {
    const card = document.querySelector(`#bfRows .bf-card[data-id="${CSS.escape(x.id)}"]`);
    if (!card) return;
    card.querySelector('[data-f="present"]').textContent = _fmt(x.present);
    card.querySelector('[data-f="target"]').textContent = _fmt(x.target);
    const input = card.querySelector('input[data-id]');
    if (input && input !== skipInput) input.value = fmtAmt(x.add, _state.unit);
  });
  el('bfNewTotal').textContent = _fmt(r.requiredTotal);
  el('bfTotalRemaining').textContent = _fmt(r.remaining);
  el('bfTotalRequired').textContent = _fmt(r.requiredTotal);
  const totalIn = el('bfTotalAdd');
  if (totalIn && totalIn !== skipInput) totalIn.value = fmtAmt(r.addTotal, _state.unit);
}
export function setBatchFixAdd(input) {
  const v = input.value.trim();
  _state.manual = v === '' ? null : { id: input.dataset.id, add: v };
  recomputeBatchFix(input);
}
export function setBatchFixTotal(input) {
  const v = input.value.trim();
  _state.manual = v === '' ? null : { total: v };
  recomputeBatchFix(input);
}
export function resetBatchFixManual() {
  _state.manual = null;
  recomputeBatchFix();
}
export function setBatchFixUnit(unit) {
  const next = unit === 'kg' ? 'kg' : 'g';
  const prev = _state.unit;
  if (next === prev) return;
  document.querySelectorAll('#bf-original, #bf-used, #bfActualRows input').forEach((i) => { i.value = convertValue(i.value, prev, next); });
  if (_state.manual) _state.manual = _state.manual.total !== undefined ? { total: convertValue(_state.manual.total, prev, next) } : { ..._state.manual, add: convertValue(_state.manual.add, prev, next) };
  _state.unit = next;
  _syncUnitUi();
  recomputeBatchFix();
}
function _exitEdit() {
  _state.editingId = null;
  const n = el('bf-save-name');
  if (n) n.value = '';
  setSaveButtons('bfSaveBtn', 'bfCancelBtn', false, 'Correction');
  _renderSaved();
}
function _renderSaved() {
  const recs = calcsOf(_state.formula).filter((c) => c.kind === 'fix');
  show('bfSavedWrap', recs.length > 0);
  const count = el('bfSavedCount');
  if (count) count.textContent = recs.length ? `(${recs.length})` : '';
  const box = el('bfSaved');
  if (box) box.innerHTML = renderSavedList(recs, 'editBatchFixSaved', 'deleteBatchFixSaved');
}
async function _reloadFormula() {
  _state.formulas = await getFormulaStore();
  const id = _state.formula ? String(_state.formula.id) : '';
  _state.formula = _state.formulas.find((x) => String(x.id) === id) || null;
}
export async function saveBatchFix() {
  const f = _state.formula;
  const r = _state.plan;
  if (!f || !r) { showToast('Enter the original batch weight first', 'warning'); return; }
  const now = Date.now();
  const actual = [];
  document.querySelectorAll('#bfActualRows input[data-id]').forEach((i) => {
    if (i.value.trim() !== '') actual.push({ i: i.dataset.id, v: i.value });
  });
  const rec = {
    id: _state.editingId || newCalcId(),
    kind: 'fix',
    name: (el('bf-save-name').value || '').trim() || defaultCalcName(f, 'fix', now),
    unit: _state.unit,
    original: String(el('bf-original').value),
    used: String(el('bf-used').value),
    actual,
    remaining: round6(r.remaining),
    requiredTotal: round6(r.requiredTotal),
    addTotal: round6(r.addTotal),
    rows: r.rows.map((x) => ({ n: x.name, p: round6(x.present), a: round6(x.add), t: round6(x.target) })),
    createdAt: now,
    updatedAt: now,
  };
  if (_state.manual && _state.manual.total !== undefined) rec.manualTotal = String(_state.manual.total);
  else if (_state.manual) rec.manual = { i: String(_state.manual.id), v: String(_state.manual.add) };
  const wasEditing = !!_state.editingId;
  const res = await updateFormulaCalcs(f.id, (cur) => upsertCalc(cur, rec));
  if (!res.ok) {
    showToast(res.error === 'limit' ? `You can keep up to ${MAX_SAVED_CALCS} saved calculations per formula. Delete an old one first.` : res.error, 'warning');
    return;
  }
  await _reloadFormula();
  _exitEdit();
  showToast(wasEditing ? 'Correction updated' : 'Correction saved', 'success');
}
export function editBatchFixSaved(id) {
  const rec = calcsOf(_state.formula).find((c) => String(c.id) === String(id) && c.kind === 'fix');
  if (!rec) return;
  _state.unit = rec.unit === 'kg' ? 'kg' : 'g';
  _state.editingId = rec.id;
  _state.manual = rec.manualTotal !== undefined ? { total: rec.manualTotal } : (rec.manual ? { id: rec.manual.i, add: rec.manual.v } : null);
  el('bf-original').value = rec.original || '';
  el('bf-used').value = rec.used || '';
  el('bf-save-name').value = rec.name || '';
  const byId = new Map((Array.isArray(rec.actual) ? rec.actual : []).map((a) => [String(a.i), a.v]));
  document.querySelectorAll('#bfActualRows input[data-id]').forEach((i) => { i.value = byId.has(i.dataset.id) ? byId.get(i.dataset.id) : ''; });
  const det = document.querySelector('#batch-fix-screen .bf-actual');
  if (det) det.open = byId.size > 0;
  _syncUnitUi();
  recomputeBatchFix();
  setSaveButtons('bfSaveBtn', 'bfCancelBtn', true, 'Correction');
  const top = el('bf-formula-btn');
  if (top && typeof top.scrollIntoView === 'function') top.scrollIntoView({ block: 'start' });
}
export function cancelBatchFixEdit() {
  _exitEdit();
}
export async function deleteBatchFixSaved(id) {
  const f = _state.formula;
  if (!f) return;
  const ok = await showGlassConfirm('Delete this saved correction?', { title: 'Delete Correction', confirmText: 'Delete', danger: true });
  if (!ok) return;
  const res = await updateFormulaCalcs(f.id, (cur) => ({ ok: true, list: removeCalc(cur, id) }));
  if (!res.ok) { showToast(res.error, 'warning'); return; }
  await _reloadFormula();
  if (_state.editingId === String(id)) _exitEdit();
  else _renderSaved();
  showToast('Correction deleted', 'success');
}
function _selectFormula(id) {
  _state.formula = _state.formulas.find((x) => String(x.id) === String(id)) || null;
  _state.manual = null;
  setPickerLabel('bf-formula-btn', 'bf-formula-select', _state.formula);
  _exitEdit();
  _renderRows();
  recomputeBatchFix();
}
export function openBatchFixFormulaPicker(btn) {
  pickFormula(btn, '_pop_batchFix', _state.formulas, _selectFormula);
}
export async function openBatchFix(formulaId) {
  const list = await loadFormulas();
  if (!list) return;
  _state.formulas = list;
  ['bf-original', 'bf-used'].forEach((id) => { const e = el(id); if (e) e.value = ''; });
  _selectFormula(formulaId || list[0].id);
  if (typeof window.openStandaloneScreen === 'function') window.openStandaloneScreen('batch-fix-screen');
}
Object.assign(window, { saveBatchFix, editBatchFixSaved, cancelBatchFixEdit, deleteBatchFixSaved, openBatchFix, openBatchFixFormulaPicker, setBatchFixAdd, setBatchFixTotal, setBatchFixUnit, resetBatchFixManual, recomputeBatchFix });
