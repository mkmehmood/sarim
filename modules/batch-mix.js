import { esc } from './business.js';
import { MAX_SAVED_CALCS, calcsOf, defaultCalcName, formulaIngredients, planBatch, removeCalc, unitWeight, upsertCalc } from './batch-calc.js';
import { convertValue, el, fixed3, fmtAmt, loadFormulas, markActive, pickFormula, round6, sectionLabel, setPickerLabel, show, summaryBox, summaryRow } from './batch-common.js';
import { newCalcId, renderSavedList, setSaveButtons } from './batch-saved.js';
import { showGlassConfirm, showToast } from './customers.js';
import { getFormulaStore, updateFormulaCalcs } from './formula-store.js';
const _state = { formulas: [], formula: null, mode: 'total', unit: 'kg', plan: null, editingId: null };
const _toUnit = (kg) => (_state.unit === 'g' ? kg * 1000 : kg);
const _toKg = (v) => (_state.unit === 'g' ? v / 1000 : v);
const _fmt = (kg) => fmtAmt(_toUnit(kg), _state.unit);
const _label = (mode) => (mode === 'units' ? 'Number of Units' : mode === 'ingredient' ? `Ingredient on Hand (${_state.unit})` : `Total Batch Weight (${_state.unit})`);
const _hint = (text) => `<div class="u-fs-sm2 u-text-muted u-mb-15">${text}</div>`;
function _ingredients() {
  return _state.formula ? formulaIngredients(_state.formula) : [];
}
function _setIngredient(id, skipRecompute) {
  const ings = _ingredients();
  const pick = ings.find((i) => i.id === String(id)) || ings[0] || null;
  const input = el('bm-ing-select');
  if (input) input.value = pick ? pick.id : '';
  const btn = el('bm-ing-btn');
  const sp = btn ? btn.querySelector('span') : null;
  if (sp) sp.textContent = pick ? pick.name : 'Select ingredient';
  if (!skipRecompute) recomputeBatchMix();
}
function _renderIngredients() {
  const f = _state.formula;
  const ings = _ingredients();
  const input = el('bm-ing-select');
  _setIngredient(input ? input.value : '', true);
  const info = el('bmFormulaInfo');
  if (info) info.textContent = f ? `1 unit = ${_fmt(unitWeight(f))} ${_state.unit} · ${ings.length} ingredient${ings.length === 1 ? '' : 's'}` : '';
}
export function openBatchMixIngredientPicker(btn) {
  pickFormula(btn, '_pop_batchMixIng', _ingredients().map((i) => ({ id: i.id, name: `${i.name} (${_fmt(i.quantity)} ${_state.unit} / unit)` })), (v) => _setIngredient(v));
}
export function recomputeBatchMix() {
  const box = el('bmMakeResult');
  if (!box) return;
  const f = _state.formula;
  _state.plan = null;
  show('bmSaveBar', false);
  if (!f) { box.innerHTML = _hint('Select a formula'); return; }
  const raw = parseFloat(el('bm-value').value) || 0;
  const value = _state.mode === 'units' ? raw : _toKg(raw);
  const p = planBatch(f, _state.mode, value, el('bm-ing-select').value);
  if (!p.units) { box.innerHTML = _hint('Enter a value to build the batch'); return; }
  _state.plan = p;
  show('bmSaveBar', true);
  const u = _state.unit;
  const head = summaryRow('Units', fixed3(p.units)) + summaryRow('Weight per Unit', `${_fmt(p.unitWeight)} ${u}`) + summaryRow('Total Batch Weight', `${_fmt(p.totalWeight)} ${u}`, 'rev-val');
  const rows = p.rows.map((r) => summaryRow(esc(r.name), `${_fmt(r.total)} ${u}`)).join('');
  box.innerHTML = summaryBox(head) + sectionLabel('Required Ingredients') + summaryBox(rows);
}
export function setBatchMixMode(mode) {
  _state.mode = mode === 'units' || mode === 'ingredient' ? mode : 'total';
  markActive('[data-bm-mode]', 'data-bm-mode', _state.mode);
  show('bmIngWrap', _state.mode === 'ingredient');
  const label = el('bmValueLabel');
  if (label) label.textContent = _label(_state.mode);
  recomputeBatchMix();
}
export function setBatchMixUnit(unit) {
  const next = unit === 'g' ? 'g' : 'kg';
  const prev = _state.unit;
  if (next === prev) return;
  const v = el('bm-value');
  if (v && _state.mode !== 'units') v.value = convertValue(v.value, prev, next);
  _state.unit = next;
  markActive('[data-bm-unit]', 'data-bm-unit', next);
  const label = el('bmValueLabel');
  if (label) label.textContent = _label(_state.mode);
  _renderIngredients();
  recomputeBatchMix();
}
function _exitEdit() {
  _state.editingId = null;
  const n = el('bm-save-name');
  if (n) n.value = '';
  setSaveButtons('bmSaveBtn', 'bmCancelBtn', false, 'Calculation');
  _renderSaved();
}
function _renderSaved() {
  const recs = calcsOf(_state.formula).filter((c) => c.kind === 'batch');
  show('bmSavedWrap', recs.length > 0);
  const count = el('bmSavedCount');
  if (count) count.textContent = recs.length ? `(${recs.length})` : '';
  const box = el('bmSaved');
  if (box) box.innerHTML = renderSavedList(recs, 'editBatchMixSaved', 'deleteBatchMixSaved');
}
async function _reloadFormula() {
  _state.formulas = await getFormulaStore();
  const id = _state.formula ? String(_state.formula.id) : '';
  _state.formula = _state.formulas.find((x) => String(x.id) === id) || null;
}
export async function saveBatchMix() {
  const f = _state.formula;
  const p = _state.plan;
  if (!f || !p || !p.units) { showToast('Enter a value to build the batch first', 'warning'); return; }
  const now = Date.now();
  const rec = {
    id: _state.editingId || newCalcId(),
    kind: 'batch',
    name: (el('bm-save-name').value || '').trim() || defaultCalcName(f, 'batch', now),
    unit: _state.unit,
    mode: _state.mode,
    value: String(el('bm-value').value),
    ingredientId: el('bm-ing-select').value || '',
    units: round6(p.units),
    unitWeight: round6(_toUnit(p.unitWeight)),
    totalWeight: round6(_toUnit(p.totalWeight)),
    rows: p.rows.map((r) => ({ n: r.name, p: round6(_toUnit(r.perUnit)), t: round6(_toUnit(r.total)) })),
    createdAt: now,
    updatedAt: now,
  };
  const wasEditing = !!_state.editingId;
  const res = await updateFormulaCalcs(f.id, (cur) => upsertCalc(cur, rec));
  if (!res.ok) {
    showToast(res.error === 'limit' ? `You can keep up to ${MAX_SAVED_CALCS} saved calculations per formula. Delete an old one first.` : res.error, 'warning');
    return;
  }
  await _reloadFormula();
  _exitEdit();
  showToast(wasEditing ? 'Calculation updated' : 'Calculation saved', 'success');
}
export function editBatchMixSaved(id) {
  const rec = calcsOf(_state.formula).find((c) => String(c.id) === String(id) && c.kind === 'batch');
  if (!rec) return;
  _state.unit = rec.unit === 'g' ? 'g' : 'kg';
  markActive('[data-bm-unit]', 'data-bm-unit', _state.unit);
  _state.editingId = rec.id;
  el('bm-value').value = rec.value || '';
  el('bm-save-name').value = rec.name || '';
  _renderIngredients();
  if (rec.ingredientId) _setIngredient(rec.ingredientId, true);
  setBatchMixMode(rec.mode);
  setSaveButtons('bmSaveBtn', 'bmCancelBtn', true, 'Calculation');
  const top = el('bm-formula-btn');
  if (top && typeof top.scrollIntoView === 'function') top.scrollIntoView({ block: 'start' });
}
export function cancelBatchMixEdit() {
  _exitEdit();
}
export async function deleteBatchMixSaved(id) {
  const f = _state.formula;
  if (!f) return;
  const ok = await showGlassConfirm('Delete this saved calculation?', { title: 'Delete Calculation', confirmText: 'Delete', danger: true });
  if (!ok) return;
  const res = await updateFormulaCalcs(f.id, (cur) => ({ ok: true, list: removeCalc(cur, id) }));
  if (!res.ok) { showToast(res.error, 'warning'); return; }
  await _reloadFormula();
  if (_state.editingId === String(id)) _exitEdit();
  else _renderSaved();
  showToast('Calculation deleted', 'success');
}
function _selectFormula(id) {
  _state.formula = _state.formulas.find((x) => String(x.id) === String(id)) || null;
  setPickerLabel('bm-formula-btn', 'bm-formula-select', _state.formula);
  _exitEdit();
  _renderIngredients();
  recomputeBatchMix();
}
export function openBatchMixFormulaPicker(btn) {
  pickFormula(btn, '_pop_batchMix', _state.formulas, _selectFormula);
}
export async function openBatchMix(formulaId) {
  const list = await loadFormulas();
  if (!list) return;
  _state.formulas = list;
  const v = el('bm-value');
  if (v) v.value = '';
  _selectFormula(formulaId || list[0].id);
  markActive('[data-bm-unit]', 'data-bm-unit', _state.unit);
  setBatchMixMode('total');
  if (typeof window.openStandaloneScreen === 'function') window.openStandaloneScreen('batch-mix-screen');
}
Object.assign(window, { saveBatchMix, editBatchMixSaved, cancelBatchMixEdit, deleteBatchMixSaved, openBatchMix, openBatchMixFormulaPicker, openBatchMixIngredientPicker, setBatchMixMode, setBatchMixUnit, recomputeBatchMix });
