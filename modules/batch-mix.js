import { esc } from './business.js';
import { showToast } from './customers.js';
import { getFormulaStore } from './formula-store.js';
import { formulaIngredients, planBatch, planCorrection, unitWeight } from './batch-calc.js';
const _el = (id) => document.getElementById(id);
const _f = (v) => (Math.round(v * 1000) / 1000).toFixed(3);
const _state = { formulas: [], formula: null, tab: 'make', mode: 'total' };
const MODE_LABELS = { total: 'Total batch weight (kg)', units: 'Number of units', ingredient: 'Amount of that ingredient on hand (kg)' };
const _line = (label, value, cls) => `<div class="bm-line${cls ? ' ' + cls : ''}"><span>${label}</span><span>${value}</span></div>`;
const _empty = (text) => `<div class="bm-empty">${text}</div>`;
function _toggleActive(selector, attr, value) {
  document.querySelectorAll(selector).forEach((b) => {
    const on = b.getAttribute(attr) === value;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
function _renderIngredients() {
  const f = _state.formula;
  const ings = f ? formulaIngredients(f) : [];
  const sel = _el('bm-ing-select');
  if (sel) sel.innerHTML = ings.map((i) => `<option value="${esc(i.id)}">${esc(i.name)} (${_f(i.quantity)} kg / unit)</option>`).join('');
  const rows = _el('bmFixRows');
  if (rows) rows.innerHTML = ings.map((i) => `<div class="bm-fix-row"><label>${esc(i.name)}</label><input type="number" inputmode="decimal" step="any" min="0" data-id="${esc(i.id)}" placeholder="kg mixed" oninput="recomputeBatchMix()"></div>`).join('');
  const info = _el('bmFormulaInfo');
  if (info) info.textContent = f ? `1 unit = ${_f(unitWeight(f))} kg · ${ings.length} ingredient${ings.length === 1 ? '' : 's'}` : '';
}
function _recomputeMake() {
  const box = _el('bmMakeResult');
  if (!box) return;
  const f = _state.formula;
  if (!f) { box.innerHTML = _empty('Select a formula'); return; }
  const p = planBatch(f, _state.mode, _el('bm-value').value, _el('bm-ing-select').value);
  if (!p.units) { box.innerHTML = _empty('Enter a value to build the batch'); return; }
  const head = _line('Units', _f(p.units)) + _line('Weight per unit', `${_f(p.unitWeight)} kg`) + _line('Total batch weight', `${_f(p.totalWeight)} kg`, 'bm-line-strong');
  const body = p.rows.map((r) => `<tr><td>${esc(r.name)}</td><td>${_f(r.perUnit)}</td><td class="bm-strong">${_f(r.total)}</td></tr>`).join('');
  box.innerHTML = `<div class="bm-summary">${head}</div><div class="bm-table-wrap"><table class="bm-table"><thead><tr><th>Ingredient</th><th>Per unit (kg)</th><th>Needed (kg)</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
function _recomputeFix() {
  const box = _el('bmFixResult');
  if (!box) return;
  const f = _state.formula;
  if (!f) { box.innerHTML = _empty('Select a formula'); return; }
  const mixed = Array.from(document.querySelectorAll('#bmFixRows input[data-id]')).map((i) => ({ id: i.dataset.id, amount: i.value }));
  const r = planCorrection(f, mixed, _el('bm-remaining').value, _el('bm-capacity').value);
  if (!r.ok) {
    box.innerHTML = _empty(r.error === 'remaining-too-large' ? 'Weight left cannot be more than the total mixed' : 'Enter the amount of each ingredient that was mixed');
    return;
  }
  const head = _line('In vessel now', `${_f(r.currentWeight)} kg`) + _line('Total to add', `${_f(r.addTotal)} kg`, 'bm-line-strong') + _line('Final weight', `${_f(r.finalWeight)} kg`) + _line('Final units', _f(r.finalUnits)) + (r.driver ? _line('Limiting ingredient', esc(r.driver)) : '');
  const warn = r.exceedsCapacity ? '<div class="bm-warn">Final weight is more than the vessel capacity</div>' : '';
  const ok = r.addTotal === 0 ? '<div class="bm-ok">Mixture already matches the formula</div>' : '';
  const body = r.rows.map((x) => `<tr><td>${esc(x.name)}</td><td>${_f(x.present)}</td><td class="bm-strong">${x.add > 0 ? '+' + _f(x.add) : '0.000'}</td><td>${_f(x.target)}</td></tr>`).join('');
  box.innerHTML = `${warn}${ok}<div class="bm-summary">${head}</div><div class="bm-table-wrap"><table class="bm-table"><thead><tr><th>Ingredient</th><th>Now (kg)</th><th>Add (kg)</th><th>Final (kg)</th></tr></thead><tbody>${body}</tbody></table></div>`;
}
export function recomputeBatchMix() {
  if (_state.tab === 'make') _recomputeMake();
  else _recomputeFix();
}
export function setBatchMixTab(tab) {
  _state.tab = tab === 'fix' ? 'fix' : 'make';
  _toggleActive('[data-bm-tab]', 'data-bm-tab', _state.tab);
  const make = _el('bmMakePanel');
  const fix = _el('bmFixPanel');
  if (make) make.hidden = _state.tab !== 'make';
  if (fix) fix.hidden = _state.tab !== 'fix';
  recomputeBatchMix();
}
export function setBatchMixMode(mode) {
  _state.mode = MODE_LABELS[mode] ? mode : 'total';
  _toggleActive('[data-bm-mode]', 'data-bm-mode', _state.mode);
  const wrap = _el('bmIngWrap');
  if (wrap) wrap.hidden = _state.mode !== 'ingredient';
  const label = _el('bmValueLabel');
  if (label) label.textContent = MODE_LABELS[_state.mode];
  recomputeBatchMix();
}
function _selectFormula(id) {
  const f = _state.formulas.find((x) => String(x.id) === String(id)) || null;
  _state.formula = f;
  const input = _el('bm-formula-select');
  if (input) input.value = f ? String(f.id) : '';
  const btn = _el('bm-formula-btn');
  const sp = btn ? btn.querySelector('span') : null;
  if (sp) sp.textContent = f ? (f.name || 'Untitled') : 'Select formula';
  _renderIngredients();
  _recomputeMake();
  _recomputeFix();
}
export async function openBatchMixFormulaPicker(btn) {
  const old = _el('_pop_batchMix');
  const wasOpen = !!old && old.style.display !== 'none';
  if (old) old.remove();
  if (wasOpen) return;
  if (!_state.formulas.length) _state.formulas = await getFormulaStore();
  if (!_state.formulas.length) { showToast('Add a formula in the Formula Store first', 'warning'); return; }
  window._mkPopover(btn.parentNode, '_pop_batchMix', _state.formulas.map((f) => ({ value: String(f.id), label: f.name || 'Untitled' })), (v) => _selectFormula(v));
  const pop = _el('_pop_batchMix');
  if (pop) {
    pop.style.left = '0';
    pop.style.maxHeight = '220px';
    pop.style.overflowY = 'auto';
  }
}
export async function openBatchMix(formulaId) {
  _state.formulas = await getFormulaStore();
  if (!_state.formulas.length) { showToast('Add a formula in the Formula Store first', 'warning'); return; }
  ['bm-value', 'bm-remaining', 'bm-capacity'].forEach((id) => { const el = _el(id); if (el) el.value = ''; });
  _selectFormula(formulaId || _state.formulas[0].id);
  setBatchMixMode('total');
  setBatchMixTab('make');
  if (typeof window.openStandaloneScreen === 'function') window.openStandaloneScreen('batch-mix-screen');
}
Object.assign(window, { openBatchMix, openBatchMixFormulaPicker, setBatchMixTab, setBatchMixMode, recomputeBatchMix });
