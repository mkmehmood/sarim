import { esc } from './business.js';
import { formulaIngredients, planCorrection } from './batch-calc.js';
import { convertValue, el, fmtAmt, loadFormulas, markActive, pickFormula, setPickerLabel } from './batch-common.js';
const _state = { formulas: [], formula: null, manual: null, unit: 'g' };
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
  document.querySelectorAll('#bfActualRows input').forEach((i) => { i.placeholder = `Amount (${_state.unit})`; });
}
function _renderRows() {
  const f = _state.formula;
  const ings = f ? formulaIngredients(f) : [];
  const rows = el('bfRows');
  if (rows) {
    rows.innerHTML = ings.map((i) => `<div class="bf-card" data-id="${esc(i.id)}"><div class="bf-card-top"><div class="bf-name">${esc(i.name)}</div><label class="bf-add"><span class="bf-add-tag">Add</span><input type="number" inputmode="decimal" step="any" min="0" data-id="${esc(i.id)}" oninput="setBatchFixAdd(this)"><span class="bf-u">${_state.unit}</span></label></div><div class="bf-meta"><span>In remaining <b data-f="present"></b></span><span>Required <b data-f="target"></b></span></div></div>`).join('');
  }
  const actual = el('bfActualRows');
  if (actual) {
    actual.innerHTML = ings.map((i) => `<div class="bm-fix-row"><label>${esc(i.name)}</label><input type="number" inputmode="decimal" step="any" min="0" data-id="${esc(i.id)}" oninput="resetBatchFixManual()"></div>`).join('');
  }
  _syncUnitUi();
}
export function recomputeBatchFix(skipInput) {
  const f = _state.formula;
  const empty = el('bfEmpty');
  const body = el('bfBody');
  const original = _num('bf-original');
  const used = _num('bf-used');
  const remainEl = el('bfRemaining');
  if (remainEl) remainEl.textContent = original > 0 ? _fmt(Math.max(0, original - used)) : _fmt(0);
  const r = f ? planCorrection(f, { original, used, actual: _actualAmounts(), manual: _state.manual }) : { ok: false, error: 'empty' };
  if (empty) {
    empty.hidden = r.ok;
    empty.textContent = r.error === 'nothing-left' ? 'Used / lost must be less than the original batch' : (f ? 'Enter the original batch weight' : 'Select a formula');
  }
  if (body) body.hidden = !r.ok;
  if (!r.ok) return;
  el('bfNewTotal').textContent = _fmt(r.requiredTotal);
  r.rows.forEach((x) => {
    const card = document.querySelector(`#bfRows .bf-card[data-id="${CSS.escape(x.id)}"]`);
    if (!card) return;
    card.querySelector('[data-f="present"]').textContent = _fmt(x.present);
    card.querySelector('[data-f="target"]').textContent = _fmt(x.target);
    const input = card.querySelector('input[data-id]');
    if (input && input !== skipInput) input.value = fmtAmt(x.add, _state.unit);
  });
  el('bfTotalRemaining').textContent = _fmt(r.remaining);
  el('bfTotalRequired').textContent = _fmt(r.requiredTotal);
  el('bfTotalAdd').textContent = _fmt(r.addTotal);
}
export function setBatchFixAdd(input) {
  const v = input.value.trim();
  _state.manual = v === '' ? null : { id: input.dataset.id, add: v };
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
  if (_state.manual) _state.manual = { ..._state.manual, add: convertValue(_state.manual.add, prev, next) };
  _state.unit = next;
  _syncUnitUi();
  recomputeBatchFix();
}
function _selectFormula(id) {
  _state.formula = _state.formulas.find((x) => String(x.id) === String(id)) || null;
  _state.manual = null;
  setPickerLabel('bf-formula-btn', 'bf-formula-select', _state.formula);
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
Object.assign(window, { openBatchFix, openBatchFixFormulaPicker, setBatchFixAdd, setBatchFixUnit, resetBatchFixManual, recomputeBatchFix });
