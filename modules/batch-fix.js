import { esc } from './business.js';
import { formulaIngredients, planCorrection } from './batch-calc.js';
import { el, loadFormulas, pickFormula, setPickerLabel, trim1 } from './batch-common.js';
const _state = { formulas: [], formula: null, manual: null };
const _num = (id) => parseFloat((el(id) || {}).value) || 0;
function _actualAmounts() {
  const out = {};
  document.querySelectorAll('#bfActualRows input[data-id]').forEach((i) => { out[i.dataset.id] = i.value; });
  return out;
}
function _renderRows() {
  const f = _state.formula;
  const ings = f ? formulaIngredients(f) : [];
  const rows = el('bfRows');
  if (rows) {
    rows.innerHTML = ings.map((i) => `<div class="bf-card" data-id="${esc(i.id)}"><div class="bf-name">${esc(i.name)}</div><div class="bf-line"><span>In remaining</span><span data-f="present">0 g</span></div><div class="bf-line"><span>Required</span><span data-f="target">0 g</span></div><div class="field bf-add"><label>Add (g)</label><input type="number" inputmode="decimal" step="any" min="0" data-id="${esc(i.id)}" oninput="setBatchFixAdd(this)"></div></div>`).join('');
  }
  const actual = el('bfActualRows');
  if (actual) {
    actual.innerHTML = ings.map((i) => `<div class="bm-fix-row"><label>${esc(i.name)}</label><input type="number" inputmode="decimal" step="any" min="0" data-id="${esc(i.id)}" placeholder="g mixed" oninput="resetBatchFixManual()"></div>`).join('');
  }
}
export function recomputeBatchFix(skipInput) {
  const f = _state.formula;
  const empty = el('bfEmpty');
  const body = el('bfBody');
  const original = _num('bf-original');
  const used = _num('bf-used');
  const remainEl = el('bfRemaining');
  if (remainEl) remainEl.textContent = original > 0 ? `${trim1(Math.max(0, original - used))} g` : '0 g';
  const r = f ? planCorrection(f, { original, used, actual: _actualAmounts(), manual: _state.manual }) : { ok: false, error: 'empty' };
  if (empty) {
    empty.hidden = r.ok;
    empty.textContent = r.error === 'nothing-left' ? 'Used / lost must be less than the original batch' : (f ? 'Enter the original batch weight' : 'Select a formula');
  }
  if (body) body.hidden = !r.ok;
  if (!r.ok) return;
  const nt = el('bfNewTotal');
  if (nt) nt.textContent = `${trim1(r.requiredTotal)} g`;
  const bar = el('bfManualBar');
  if (bar) bar.hidden = !r.adjusted;
  r.rows.forEach((x) => {
    const card = document.querySelector(`#bfRows .bf-card[data-id="${CSS.escape(x.id)}"]`);
    if (!card) return;
    card.querySelector('[data-f="present"]').textContent = `${trim1(x.present)} g`;
    card.querySelector('[data-f="target"]').textContent = `${trim1(x.target)} g`;
    const input = card.querySelector('input[data-id]');
    if (input && input !== skipInput) input.value = trim1(x.add);
  });
  el('bfTotalRemaining').textContent = `${trim1(r.remaining)} g`;
  el('bfTotalRequired').textContent = `${trim1(r.requiredTotal)} g`;
  el('bfTotalAdd').textContent = `${trim1(r.addTotal)} g`;
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
export function resetBatchFixMinimum() {
  _state.manual = null;
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
Object.assign(window, { openBatchFix, openBatchFixFormulaPicker, setBatchFixAdd, resetBatchFixManual, resetBatchFixMinimum, recomputeBatchFix });
