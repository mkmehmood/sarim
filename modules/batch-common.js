import { showToast } from './customers.js';
import { getFormulaStore } from './formula-store.js';
export const el = (id) => document.getElementById(id);
export const fmtAmt = (v, unit) => String(unit === 'g' ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000);
export const round6 = (v) => Math.round((Number(v) || 0) * 1e6) / 1e6;
export const fixed3 = (v) => (Math.round(v * 1000) / 1000).toFixed(3);
export function convertValue(raw, from, to) {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || from === to) return raw;
  return String(Math.round((to === 'g' ? n * 1000 : n / 1000) * 1e6) / 1e6);
}
export function markActive(selector, attr, value) {
  document.querySelectorAll(selector).forEach((b) => {
    const on = b.getAttribute(attr) === value;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
export async function loadFormulas() {
  const list = await getFormulaStore();
  if (!list.length) { showToast('Add a formula in the Formula Store first', 'warning'); return null; }
  return list;
}
export function pickFormula(btn, popId, formulas, onPick) {
  const old = el(popId);
  const wasOpen = !!old && old.style.display !== 'none';
  if (old) old.remove();
  if (wasOpen || !formulas.length) return;
  window._mkPopover(btn.parentNode, popId, formulas.map((f) => ({ value: String(f.id), label: f.name || 'Untitled' })), onPick);
  const pop = el(popId);
  if (pop) {
    pop.style.left = '0';
    pop.style.maxHeight = '220px';
    pop.style.overflowY = 'auto';
  }
}
export function setPickerLabel(btnId, inputId, formula) {
  const input = el(inputId);
  if (input) input.value = formula ? String(formula.id) : '';
  const btn = el(btnId);
  const sp = btn ? btn.querySelector('span') : null;
  if (sp) sp.textContent = formula ? (formula.name || 'Untitled') : 'Select formula';
}
export function toggleFormulaFab(force) {
  const dial = el('formulaFabDial');
  if (!dial) return;
  const open = typeof force === 'boolean' ? force : !dial.classList.contains('open');
  dial.classList.toggle('open', open);
  const fab = dial.querySelector('.formula-fab');
  if (fab) fab.setAttribute('aria-expanded', open ? 'true' : 'false');
}
export function formulaFabPick(kind) {
  toggleFormulaFab(false);
  if (kind === 'formula' && typeof window.openFormulaStoreEditor === 'function') window.openFormulaStoreEditor(null);
  else if (kind === 'batch' && typeof window.openBatchMix === 'function') window.openBatchMix();
  else if (kind === 'fix' && typeof window.openBatchFix === 'function') window.openBatchFix();
}
Object.assign(window, { toggleFormulaFab, formulaFabPick });
