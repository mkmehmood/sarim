import { showToast } from './customers.js';
import { getFormulaStore } from './formula-store.js';
export const el = (id) => document.getElementById(id);
export const fmtAmt = (v, unit) => String(unit === 'g' ? Math.round(v * 10) / 10 : Math.round(v * 1000) / 1000);
export const round6 = (v) => Math.round((Number(v) || 0) * 1e6) / 1e6;
export const show = (id, on) => {
  const e = document.getElementById(id);
  if (e) e.classList.toggle('d-none', !on);
};
export const summaryRow = (label, value, cls) => `<div class="factory-summary-row"><span class="factory-summary-label">${label}</span><span class="${cls || 'qty-val'}">${value}</span></div>`;
export const summaryBox = (inner) => `<div class="u-bg-accent-5 u-p-10 u-rounded-8 u-mb-15">${inner}</div>`;
export const sectionLabel = (text) => `<label class="u-5250855 d-block">${text}</label>`;
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
  if (old && window.Dropdown.isOpen(old)) { window.Dropdown.hide(old); return; }
  if (!formulas.length) return;
  window._mkPopover(btn.parentNode, popId, formulas.map((f) => ({ value: String(f.id), label: f.name || 'Untitled' })), onPick);
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
