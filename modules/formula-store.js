import { ensureArray, esc, getTimestamp, sqliteStore } from './business.js';
import { showToast } from './customers.js';
import { notifyDataChange, triggerAutoSync } from './utilities-core.js';
import { resolveSelectedFormula } from './link-graph.js';
import { _invalidateStoresCache, _set_currentFactoryEntryStore, getAppStores } from './utilities-sales.js';
import { getDefaultStoreKey, formulaIdOf } from './store-keys.js';
import { feedsFromFormulas } from './formula-pools.js';
import { mergeRestored } from './store-recycle.js';
const STORE_KEY = 'formulas';
const STORE_TS_KEY = 'formulas_timestamp';
export const _el = (id) => document.getElementById(id);
export const _num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
export const _fmt = (v) => (typeof window.fmtNum === 'function' ? window.fmtNum(v) : String(v));
const _money = (v) => (typeof window.formatCurrency === 'function' ? window.formatCurrency(v) : _fmt(v));

export async function getFormulaStore() {
  return ensureArray(await sqliteStore.get(STORE_KEY)).filter((f) => f && f.id);
}

export async function getSelectedFormula(ref) {
  const b = await sqliteStore.getBatch([STORE_KEY, 'stores', 'inventory']);
  return resolveSelectedFormula({
    list: ensureArray(b.get(STORE_KEY)), stores: ensureArray(b.get('stores')), inventory: ensureArray(b.get('inventory')),
  }, ref);
}

export async function getFormulaNames() {
  const out = {};
  (await getFormulaStore()).forEach((f) => { out[String(f.id)] = f.name || 'Untitled'; });
  return out;
}

export async function getStoreFormulaNames() {
  const [stores, names] = await Promise.all([getAppStores(), getFormulaNames()]);
  const out = {};
  stores.forEach((s) => { if (names[formulaIdOf(s)]) out[s.key] = esc(names[formulaIdOf(s)]); });
  return out;
}

export function _feedWrites(list, now) {
  const f = feedsFromFormulas(list);
  return [['defaults', f.defaults], ['defaults_timestamp', now], ['costs', f.costs], ['costs_timestamp', now], ['adjustment', f.adjustment], ['adjustment_timestamp', now]];
}

function _afterChange() {
  notifyDataChange('all');
  if (typeof triggerAutoSync === 'function') triggerAutoSync();
  if (typeof window.updateAllTabsWithFactoryCosts === 'function') window.updateAllTabsWithFactoryCosts();
  if (typeof window.calculateFactoryProduction === 'function') window.calculateFactoryProduction();
  refreshFormulaDependentUI();
}

export async function commitStoresWithFormulas(stores) {
  const list = await getFormulaStore();
  const normalized = stores;
  const ids = normalized.map(formulaIdOf).filter(Boolean);
  if (ids.some((id) => !list.find((f) => String(f.id) === id))) return { ok: false, error: 'Selected formula no longer exists in the Formula Store' };
  const now = getTimestamp();
  await sqliteStore.setBatch([..._feedWrites(list, now), ['stores', normalized], ['stores_timestamp', Date.now()]]);
  _invalidateStoresCache();
  _afterChange();
  return { ok: true, stores: normalized };
}

export async function _saveFormulaStore(list, extraWrites) {
  const now = getTimestamp();
  await sqliteStore.setBatch([[STORE_KEY, list], [STORE_TS_KEY, now], ...(extraWrites || [])]);
  _afterChange();
}
export async function updateFormulaCalcs(formulaId, mutate) {
  const list = await getFormulaStore();
  const idx = list.findIndex((f) => String(f.id) === String(formulaId));
  if (idx < 0) return { ok: false, error: 'This formula no longer exists' };
  const res = mutate(ensureArray(list[idx].savedCalcs));
  if (!res || res.ok === false) return { ok: false, error: (res && res.error) || 'failed' };
  list[idx] = { ...list[idx], savedCalcs: res.list };
  await _saveFormulaStore(list);
  return { ok: true, formula: list[idx] };
}

export function _totals(ingredients, additionalCost, factor) {
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

function _row(label, value, extra) {
  return `<div class="d-flex st-font-size__c95659 u-8c130fb${extra ? ' ' + extra : ''}"><span>${label}</span><span>${value}</span></div>`;
}

function _card(f, inventory, usedBy) {
  const ings = ensureArray(f.ingredients).map((i) => ({ ...i, cost: _liveCost(i, inventory) }));
  const addl = _num(f.additionalCost, 0);
  const factor = _num(f.costAdjustmentFactor, 1) || 1;
  const t = _totals(ings, addl, factor);
  let html = `<h4 class="u-c2d830a">${esc(f.name || 'Untitled')} (1 Unit)</h4>`;
  html += ings.length ? ings.map((i) => _row(`${esc(i.name)} (${_fmt(_num(i.quantity, 0))} kg)`, _money(_num(i.cost, 0) * _num(i.quantity, 0)))).join('') : '<div class="u-text-muted">No ingredients.</div>';
  if (addl > 0) html += _row(`Additional Cost (${addl} per unit)`, _money(addl), 'st-color__497726');
  html += '<div class="u-0bee203"></div>';
  html += _row('Unit Weight', _fmt(t.weight) + ' kg');
  html += _row('Raw Material Cost per Unit', _money(t.raw));
  html += _row('Total Cost per Unit', _money(t.perUnit), 'st-font-weight__e3ec02');
  html += _row('Cost per kg (Sales/Calc)', _money(t.perKg));
  html += `<div class="formula-store-edit-hint">${usedBy.length ? 'Used by ' + esc(usedBy.join(', ')) + ' · ' : ''}Tap to edit</div>`;
  return `<div class="callout formula-display formula-store-card" onclick="openFormulaStoreEditor('${esc(String(f.id))}')">${html}</div>`;
}

export async function renderFormulaStoreList() {
  const box = _el('formulaStoreList');
  if (!box) return;
  const [list, stores] = await Promise.all([getFormulaStore(), getAppStores()]);
  if (!list.length) {
    box.innerHTML = '<div class="empty is-compact u-83094ef">No formulas yet. Tap the + button to add one.</div>';
    return;
  }
  const inventory = ensureArray(await sqliteStore.get('inventory')).filter((i) => !(i && i.isPurchaseLot));
  box.innerHTML = list.map((f) => _card(f, inventory, stores.filter((s) => formulaIdOf(s) === String(f.id)).map((s) => s.name))).join('');
}

export async function openFormulaStore() {
  await renderFormulaStoreList();
}

export async function restoreFormulaEntry(record) {
  if (!record || !record.id) return false;
  const list = mergeRestored(await getFormulaStore(), record);
  await _saveFormulaStore(list, _feedWrites(list, getTimestamp()));
  return true;
}
function _renderChoice(hostId, items, active, onPick, emptyText) {
  const host = _el(hostId);
  if (!host) return;
  host.textContent = '';
  if (items.length < 2) {
    const only = document.createElement('span');
    only.className = 'formula-label';
    only.textContent = items.length ? items[0].label : emptyText;
    host.appendChild(only);
    return;
  }
  const group = document.createElement('div');
  group.className = 'toggle-group';
  group.setAttribute('role', 'group');
  items.forEach((it) => {
    const on = it.value === String(active);
    const opt = document.createElement('button');
    opt.type = 'button';
    opt.className = 'toggle-opt' + (on ? ' active' : '');
    opt.setAttribute('aria-pressed', on ? 'true' : 'false');
    opt.textContent = it.label;
    opt.addEventListener('click', () => onPick(it.value));
    group.appendChild(opt);
  });
  host.appendChild(group);
}

export async function setStoreFormulaSelection(id) {
  const list = await getFormulaStore();
  const f = list.find((x) => String(x.id) === String(id));
  const input = _el('store-formula-select');
  if (input) input.value = f ? String(f.id) : '';
  const btn = _el('store-formula-btn');
  const sp = btn ? btn.querySelector('span') : null;
  if (sp) sp.textContent = f ? (f.name || 'Untitled') : 'Select formula';
}

export async function openStoreFormulaPicker(btn) {
  const pop = document.getElementById('_pop_storeFormula');
  if (pop && window.Dropdown.isOpen(pop)) { window.Dropdown.hide(pop); return; }
  const list = await getFormulaStore();
  if (!list.length) { showToast('Add a formula in the Formula Store first', 'warning'); return; }
  window._mkPopover(btn.parentNode, '_pop_storeFormula', list.map((f) => ({ value: String(f.id), label: f.name || 'Untitled' })), (v) => {
    const input = _el('store-formula-select');
    if (input) input.value = v;
  });
}

function _items(view, order) {
  return view ? order.map((k) => ({ value: k, label: view.labels[k] || 'Formula' })) : [];
}

export function syncFactoryFormulaPicker(pool) {
  const view = window._formulaPickerView;
  const input = _el('factory-formula-value');
  if (input) input.value = pool || '';
  _renderChoice('factoryFormulaToggle', _items(view, view ? view.entryOrder : []), pool, (k) => { if (typeof window.selectFactoryFormula === 'function') window.selectFactoryFormula(k); }, 'No formula');
  if (typeof window.refreshFactoryFormulaFilter === 'function') Promise.resolve(window.refreshFactoryFormulaFilter()).catch(() => {});
}

export function syncFactoryAvailPicker(pool) {
  const view = window._formulaPickerView;
  const input = _el('factory-avail-value');
  if (input) input.value = pool || '';
  _renderChoice('factoryAvailToggle', _items(view, view ? view.availOrder : []), pool, (k) => { if (typeof window.setFactoryAvailableStore === 'function') window.setFactoryAvailableStore(k); }, 'No formula');
}

export async function refreshFormulaDependentUI() {
  const [names, stores, tracking] = await Promise.all([getFormulaNames(), getAppStores(), sqliteStore.get('tracking')]);
  const poolOfStore = {};
  stores.forEach((s) => { if (names[formulaIdOf(s)]) poolOfStore[s.key] = formulaIdOf(s); });
  const used = new Set(Object.values(poolOfStore));
  const known = Object.keys(names);
  const entryOrder = known.filter((id) => used.has(id));
  const availOrder = known.filter((id) => used.has(id) || _num(tracking && tracking[id] && tracking[id].available, 0) > 0);
  window._formulaNames = names;
  window._formulaPickerView = { labels: names, entryOrder, availOrder };
  let active = poolOfStore[window.currentFactoryEntryStore || getDefaultStoreKey()];
  if (!entryOrder.includes(active)) active = entryOrder[0] || '';
  const rep = stores.find((s) => poolOfStore[s.key] === active);
  if (rep && poolOfStore[window.currentFactoryEntryStore] !== active) _set_currentFactoryEntryStore(rep.key);
  syncFactoryFormulaPicker(active);
  const availInput = _el('factory-avail-value');
  let availPool = availInput ? availInput.value : (availOrder[0] || '');
  if (!availOrder.includes(availPool)) availPool = availOrder[0] || '';
  if (typeof window.setFactoryAvailableStore === 'function') await window.setFactoryAvailableStore(availPool);
  else syncFactoryAvailPicker(availPool);
  refreshFormulaStoreScreens();
  if (typeof window.renderStoreList === 'function' && _el('store-manager-screen') && window.getDisplay(_el('store-manager-screen')) !== 'none') window.renderStoreList();
  if (typeof window.calculateFactoryProduction === 'function') window.calculateFactoryProduction();
  if (typeof window.renderFactoryHistory === 'function') window.renderFactoryHistory();
}

export function refreshFormulaStoreScreens() {
  const listScreen = _el('formula-store-screen');
  if (listScreen && window.getDisplay(listScreen) !== 'none') renderFormulaStoreList();
}

Object.assign(window, { restoreFormulaEntry, openFormulaStore, renderFormulaStoreList, refreshFormulaStoreScreens, refreshFormulaDependentUI, syncFactoryFormulaPicker, syncFactoryAvailPicker, commitStoresWithFormulas, updateFormulaCalcs, setStoreFormulaSelection, openStoreFormulaPicker, getStoreFormulaNames, getFormulaNames, getFormulaStore });
