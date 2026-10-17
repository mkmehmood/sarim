import { esc } from './business.js';
import { formulaIngredients, planBatch, unitWeight } from './batch-calc.js';
import { el, fixed3, loadFormulas, pickFormula, setPickerLabel } from './batch-common.js';
const _state = { formulas: [], formula: null, mode: 'total' };
const MODE_LABELS = { total: 'Total batch weight (kg)', units: 'Number of units', ingredient: 'Amount of that ingredient on hand (kg)' };
const _line = (label, value, cls) => `<div class="bm-line${cls ? ' ' + cls : ''}"><span>${label}</span><span>${value}</span></div>`;
function _renderIngredients() {
  const f = _state.formula;
  const ings = f ? formulaIngredients(f) : [];
  const sel = el('bm-ing-select');
  if (sel) sel.innerHTML = ings.map((i) => `<option value="${esc(i.id)}">${esc(i.name)} (${fixed3(i.quantity)} kg / unit)</option>`).join('');
  const info = el('bmFormulaInfo');
  if (info) info.textContent = f ? `1 unit = ${fixed3(unitWeight(f))} kg · ${ings.length} ingredient${ings.length === 1 ? '' : 's'}` : '';
}
export function recomputeBatchMix() {
  const box = el('bmMakeResult');
  if (!box) return;
  const f = _state.formula;
  if (!f) { box.innerHTML = '<div class="bm-empty">Select a formula</div>'; return; }
  const p = planBatch(f, _state.mode, el('bm-value').value, el('bm-ing-select').value);
  if (!p.units) { box.innerHTML = '<div class="bm-empty">Enter a value to build the batch</div>'; return; }
  const head = _line('Units', fixed3(p.units)) + _line('Weight per unit', `${fixed3(p.unitWeight)} kg`) + _line('Total batch weight', `${fixed3(p.totalWeight)} kg`, 'bm-line-strong');
  const body = p.rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${fixed3(r.perUnit)}</td><td class="bm-strong">${fixed3(r.total)}</td></tr>`).join('');
  box.innerHTML = `<div class="bm-summary">${head}</div><div class="bm-table-wrap"><table class="bm-table"><thead><tr><th>Ingredient</th><th>Per unit (kg)</th><th>Needed (kg)</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
export function setBatchMixMode(mode) {
  _state.mode = MODE_LABELS[mode] ? mode : 'total';
  document.querySelectorAll('[data-bm-mode]').forEach((b) => {
    const on = b.getAttribute('data-bm-mode') === _state.mode;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const wrap = el('bmIngWrap');
  if (wrap) wrap.hidden = _state.mode !== 'ingredient';
  const label = el('bmValueLabel');
  if (label) label.textContent = MODE_LABELS[_state.mode];
  recomputeBatchMix();
}
function _selectFormula(id) {
  _state.formula = _state.formulas.find((x) => String(x.id) === String(id)) || null;
  setPickerLabel('bm-formula-btn', 'bm-formula-select', _state.formula);
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
  setBatchMixMode('total');
  if (typeof window.openStandaloneScreen === 'function') window.openStandaloneScreen('batch-mix-screen');
}
Object.assign(window, { openBatchMix, openBatchMixFormulaPicker, setBatchMixMode, recomputeBatchMix });
