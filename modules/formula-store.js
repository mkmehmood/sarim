import { ensureArray, esc, generateUUID, getTimestamp, sqliteStore } from './business.js';
import { showGlassConfirm, showToast } from './customers.js';
import { notifyDataChange, triggerAutoSync } from './utilities-core.js';
const STORE_KEY = 'factory_formula_store';
const STORE_TS_KEY = 'factory_formula_store_timestamp';
let _editingId = null;
const _el = (id) => document.getElementById(id);
const _num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const _fmt = (v) => (typeof window.fmtNum === 'function' ? window.fmtNum(v) : String(v));
const _label = (t) => (t === 'asaan' ? 'Asaan' : 'Standard');
async function _ensureRowBuilder() {
  if (typeof window.createFactorySettingRow === 'function') return;
  await new Promise((resolve) => { if (typeof window._lazyLoadFactory === 'function') window._lazyLoadFactory(resolve); else resolve(); });
}
export async function getFormulaStore() {
  return ensureArray(await sqliteStore.get(STORE_KEY)).filter((f) => f && f.id);
}
async function _saveFormulaStore(list) {
  await sqliteStore.setBatch([[STORE_KEY, list], [STORE_TS_KEY, getTimestamp()]]);
  notifyDataChange('all');
  if (typeof triggerAutoSync === 'function') triggerAutoSync();
}
function _totals(ingredients, additionalCost, factor) {
  let raw = 0;
  let weight = 0;
  ingredients.forEach((i) => { raw += (_num(i.cost, 0) * _num(i.quantity, 0)); weight += _num(i.quantity, 0); });
  const perUnit = raw + additionalCost;
  const perKg = factor > 0 ? perUnit / factor : perUnit;
  return { raw, weight, perUnit, perKg };
}
function _liveCost(ing, inventory) {
  let live = inventory.find((i) => String(i.id) === String(ing.id));
  if (!live && ing.name) live = inventory.find((i) => i.name && i.name.trim().toLowerCase() === String(ing.name).trim().toLowerCase());
  const c = live ? Number(live.cost) : NaN;
  return Number.isFinite(c) && c > 0 ? c : _num(ing.cost, 0);
}
function _money(v) {
  return typeof window.formatCurrency === 'function' ? window.formatCurrency(v) : _fmt(v);
}
function _row(label, value, extra) {
  return `<div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:2px;${extra || ''}"><span>${label}</span><span>${value}</span></div>`;
}
function _card(f, inventory) {
  const ings = ensureArray(f.ingredients).map((i) => ({ ...i, cost: _liveCost(i, inventory) }));
  const addl = _num(f.additionalCost, 0);
  const factor = _num(f.costAdjustmentFactor, 1) || 1;
  const t = _totals(ings, addl, factor);
  let html = `<h4 style="margin:0 0 6px 0;font-size:0.9rem;">${esc(f.name || 'Untitled')} (1 Unit)</h4>`;
  html += ings.length ? ings.map((i) => _row(`${esc(i.name)} (${_fmt(_num(i.quantity, 0))} kg)`, _money(_num(i.cost, 0) * _num(i.quantity, 0)))).join('') : '<div class="u-text-muted">No ingredients.</div>';
  if (addl > 0) html += _row(`Additional Cost (${addl} per unit)`, _money(addl), 'color:var(--danger);');
  html += '<div style="border-top:1px dashed var(--glass-border);margin:8px 0 6px 0;"></div>';
  html += _row('Unit Weight', _fmt(t.weight) + ' kg');
  html += _row('Raw Material Cost per Unit', _money(t.raw));
  html += _row('Total Cost per Unit', _money(t.perUnit), 'font-weight:700;');
  html += _row('Cost per kg (Sales/Calc)', _money(t.perKg));
  html += '<div class="formula-store-edit-hint">Tap to edit or swap</div>';
  return `<div class="formula-display formula-store-card" onclick="openFormulaStoreEditor('${esc(String(f.id))}')">${html}</div>`;
}
export async function renderFormulaStoreList() {
  const box = _el('formulaStoreList');
  if (!box) return;
  const list = await getFormulaStore();
  if (!list.length) {
    box.innerHTML = '<div class="u-search-empty" style="padding:24px;text-align:center;">No formulas yet. Tap the + button to add one.</div>';
    return;
  }
  const inventory = ensureArray(await sqliteStore.get('factory_inventory_data'));
  box.innerHTML = list.map((f) => _card(f, inventory)).join('');
}
export async function openFormulaStore() {
  await renderFormulaStoreList();
}
async function _fillEditor(entry) {
  await _ensureRowBuilder();
  const inventory = ensureArray(await sqliteStore.get('factory_inventory_data'));
  const container = _el('fsEditContainer');
  if (!container) return;
  container.replaceChildren();
  for (const ing of ensureArray(entry.ingredients)) {
    await window.createFactorySettingRow(container, ing.id, ing.quantity, ing.cost, ing.name, inventory);
  }
  _el('fs-edit-name').value = entry.name || '';
  _el('fs-additional-cost').value = _num(entry.additionalCost, 0);
  _el('fs-cost-factor').value = _num(entry.costAdjustmentFactor, 1);
  updateFormulaStoreSummary();
}
function _collectEditor() {
  const container = _el('fsEditContainer');
  const ingredients = [];
  if (container) {
    container.querySelectorAll('.factory-formula-grid').forEach((row) => {
      const inp = row.querySelector('.factory-mat-search-input');
      const costIn = row.querySelector('.factory-mat-cost');
      const qtyIn = row.querySelector('.factory-mat-qty');
      const name = inp ? inp.value.trim() : '';
      if (inp && inp.dataset.matId && name && qtyIn && _num(qtyIn.value, 0) > 0) {
        ingredients.push({ id: inp.dataset.matId, name, cost: _num(costIn ? costIn.value : 0, 0), quantity: _num(qtyIn.value, 0) });
      }
    });
  }
  return {
    name: _el('fs-edit-name').value.trim(),
    ingredients,
    additionalCost: _num(_el('fs-additional-cost').value, 0),
    costAdjustmentFactor: _num(_el('fs-cost-factor').value, 1) || 1
  };
}
export function updateFormulaStoreSummary() {
  const c = _collectEditor();
  const t = _totals(c.ingredients, c.additionalCost, c.costAdjustmentFactor);
  const set = (id, v) => { const el = _el(id); if (el) el.innerText = v; };
  set('fsSummaryWeight', _fmt(t.weight) + ' kg');
  set('fsSummaryRaw', _fmt(t.raw));
  set('fsSummaryPerUnit', _fmt(t.perUnit));
  set('fsSummaryPerKg', _fmt(t.perKg));
}
function _bindContainer(id, refresh) {
  const container = _el(id);
  if (!container || container.dataset.bound === '1') return;
  container.dataset.bound = '1';
  const run = () => setTimeout(refresh, 0);
  ['input', 'mousedown', 'click', 'focusout'].forEach((evt) => container.addEventListener(evt, run));
}
function _bindEditor() {
  _bindContainer('fsEditContainer', updateFormulaStoreSummary);
  _bindContainer('factoryRawMaterialsContainerAsaan', () => { if (typeof window.updateFactoryFormulasSummaryAsaan === 'function') window.updateFactoryFormulasSummaryAsaan(); });
}
export async function openFormulaStoreEditor(id) {
  _editingId = id || null;
  const list = await getFormulaStore();
  const entry = id ? list.find((f) => String(f.id) === String(id)) : null;
  if (id && !entry) { showToast('Formula not found', 'warning'); return; }
  const del = _el('fs-delete-btn');
  if (del) del.style.display = entry ? '' : 'none';
  const panel = _el('fs-swap-panel');
  if (panel) panel.style.display = 'none';
  const title = _el('fs-edit-title');
  if (title) title.textContent = entry ? 'Edit Formula' : 'New Formula';
  _bindEditor();
  if (typeof window.openStandaloneScreen === 'function') window.openStandaloneScreen('formula-store-edit-screen');
  await _fillEditor(entry || { name: '', ingredients: [], additionalCost: 0, costAdjustmentFactor: 1 });
}
const _ROW_TARGETS = { standard: 'factoryRawMaterialsContainer', asaan: 'factoryRawMaterialsContainerAsaan', store: 'fsEditContainer' };
function _refreshFor(kind) {
  if (kind === 'store') updateFormulaStoreSummary();
  else if (kind === 'asaan' && typeof window.updateFactoryFormulasSummaryAsaan === 'function') window.updateFactoryFormulasSummaryAsaan();
  else if (typeof window.updateFactoryFormulasSummary === 'function') window.updateFactoryFormulasSummary();
}
export async function addFormulaIngredientRow(kind) {
  const container = _el(_ROW_TARGETS[kind]);
  if (!container) return;
  await _ensureRowBuilder();
  if (typeof window.createFactorySettingRow !== 'function') { showToast('Formula editor is still loading, try again', 'warning'); return; }
  _bindEditor();
  const before = container.children.length;
  await window.createFactorySettingRow(container, '', '', null, '', null);
  if (container.children.length === before) return;
  const row = container.lastElementChild;
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const inp = row.querySelector('.factory-mat-search-input');
  if (inp) setTimeout(() => inp.focus(), 200);
  _refreshFor(kind);
}
export function addFormulaStoreRow() {
  return addFormulaIngredientRow('store');
}
export async function saveFormulaStoreEntry(silent) {
  const c = _collectEditor();
  if (!c.name) { showToast('Enter a formula name', 'warning'); return false; }
  if (!c.ingredients.length) { showToast('Add at least one ingredient with quantity', 'warning'); return false; }
  const list = await getFormulaStore();
  const now = getTimestamp();
  const idx = _editingId ? list.findIndex((f) => String(f.id) === String(_editingId)) : -1;
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...c, updatedAt: now };
  } else {
    _editingId = generateUUID('formula');
    list.push({ id: _editingId, ...c, createdAt: now, updatedAt: now });
  }
  await _saveFormulaStore(list);
  if (!silent) {
    showToast('Formula saved', 'success');
    if (typeof window.closeStandaloneScreen === 'function') window.closeStandaloneScreen('formula-store-edit-screen');
    renderFormulaStoreList();
  }
  return true;
}
export function deleteFormulaStoreEntry() {
  if (!_editingId) return;
  showGlassConfirm('Delete this formula from the store?', { title: 'Delete Formula', confirmText: 'Delete', danger: true }).then(async (ok) => {
    if (!ok) return;
    const list = (await getFormulaStore()).filter((f) => String(f.id) !== String(_editingId));
    await _saveFormulaStore(list);
    _editingId = null;
    if (typeof window.closeStandaloneScreen === 'function') window.closeStandaloneScreen('formula-store-edit-screen');
    renderFormulaStoreList();
    showToast('Formula deleted', 'success');
  });
}
export function toggleFormulaStoreSwap() {
  const panel = _el('fs-swap-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
}
export async function swapFormulaStoreWith(type) {
  if (type !== 'standard' && type !== 'asaan') return;
  const c = _collectEditor();
  if (!c.name) { showToast('Enter a formula name first', 'warning'); return; }
  if (!c.ingredients.length) { showToast('Add at least one ingredient first', 'warning'); return; }
  const label = _label(type);
  const ok = await showGlassConfirm(`Swap this formula with the current ${label} formula?\n\nThis formula becomes the active ${label} formula and the current ${label} formula moves into the store.`, { title: `Swap with ${label}`, confirmText: 'Swap' });
  if (!ok) return;
  const batch = await sqliteStore.getBatch(['factory_default_formulas', 'factory_additional_costs', 'factory_cost_adjustment_factor']);
  const formulas = { standard: [], asaan: [], ...(batch.get('factory_default_formulas') || {}) };
  const costs = { standard: 0, asaan: 0, ...(batch.get('factory_additional_costs') || {}) };
  const factors = { standard: 1, asaan: 1, ...(batch.get('factory_cost_adjustment_factor') || {}) };
  const previous = { ingredients: ensureArray(formulas[type]), additionalCost: _num(costs[type], 0), costAdjustmentFactor: _num(factors[type], 1) || 1 };
  formulas[type] = c.ingredients;
  costs[type] = c.additionalCost;
  factors[type] = c.costAdjustmentFactor;
  const list = await getFormulaStore();
  const now = getTimestamp();
  const idx = _editingId ? list.findIndex((f) => String(f.id) === String(_editingId)) : -1;
  const swapped = { name: c.name, ...previous, updatedAt: now };
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...swapped };
  } else {
    _editingId = generateUUID('formula');
    list.push({ id: _editingId, ...swapped, createdAt: now });
  }
  await sqliteStore.setBatch([
    ['factory_default_formulas', formulas], ['factory_default_formulas_timestamp', now],
    ['factory_additional_costs', costs], ['factory_additional_costs_timestamp', now],
    ['factory_cost_adjustment_factor', factors], ['factory_cost_adjustment_factor_timestamp', now],
    [STORE_KEY, list], [STORE_TS_KEY, now]
  ]);
  notifyDataChange('all');
  if (typeof triggerAutoSync === 'function') triggerAutoSync();
  if (typeof window.updateAllTabsWithFactoryCosts === 'function') window.updateAllTabsWithFactoryCosts();
  if (typeof window.calculateFactoryProduction === 'function') window.calculateFactoryProduction();
  const panel = _el('fs-swap-panel');
  if (panel) panel.style.display = 'none';
  await _fillEditor({ ...swapped });
  renderFormulaStoreList();
  showToast(`Swapped with ${label} formula`, 'success');
}
export function refreshFormulaStoreScreens() {
  const listScreen = _el('formula-store-screen');
  if (listScreen && listScreen.style.display !== 'none') renderFormulaStoreList();
}
Object.assign(window, { addFormulaIngredientRow, ensureFormulaEditorReady: _ensureRowBuilder, openFormulaStore, renderFormulaStoreList, openFormulaStoreEditor, addFormulaStoreRow, saveFormulaStoreEntry, deleteFormulaStoreEntry, toggleFormulaStoreSwap, swapFormulaStoreWith, updateFormulaStoreSummary, refreshFormulaStoreScreens });
_bindEditor();
