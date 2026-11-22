
// ==== module: formula-store-edit.js ====
import { formulaFormIssue } from '../../modules/formula-checks.js';
import { _el, _num, _fmt, getFormulaStore, _saveFormulaStore, _feedWrites } from '../../modules/formula-store.js';
import { LIMITS, duplicateName, nameIssue, numberIssue } from '../../modules/input-guards.js';
import { describeFormula, linkedPerKg, linkIngredient, isLink, canLink, formulaUsers } from '../../modules/formula-links.js';
import { esc, ensureArray, fmtNum, sqliteStore, getTimestamp, generateUUID } from '../../modules/business.js';
import { computeUnitPools } from '../../modules/formula-pools.js';
import { showToast, showGlassConfirm } from '../../modules/customers.js';
import { confirmGuard } from '../../modules/confirm-guard.js';
import { sendDeviceNotification } from '../../modules/notify.js';
import { getAppStores } from '../../modules/utilities-sales.js';
import { trashRecord } from '../../modules/store-recycle.js';
import { formulaIdOf } from '../../modules/store-keys.js';

let _editingId = null;
let _ctx = { list: [], inventory: [] };

function _createLinkRow(container, formulaId, qtyVal, savedName) {
  const sub = _ctx.list.find((f) => String(f.id) === String(formulaId));
  const name = sub ? (sub.name || 'Untitled') : (savedName || 'Formula');
  const perKg = sub ? linkedPerKg(sub, _ctx.list, _ctx.inventory) : 0;
  const notify = () => container.dispatchEvent(new CustomEvent('formularowchange'));
  const div = document.createElement('div');
  div.className = 'factory-formula-grid';
  window.setStyle(div, 'position', 'st-position__d461c9');
  const searchWrap = document.createElement('div');
  searchWrap.className = 'factory-mat-select';
  searchWrap.classList.add('st-position__d461c9');
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'form-ctl factory-mat-search-input factory-link-input';
  searchInput.value = `${name} · sub formula${sub ? '' : ' (removed)'}`;
  searchInput.readOnly = true;
  searchInput.dataset.matId = `formula:${formulaId}`;
  searchInput.dataset.kind = 'formula';
  searchInput.dataset.formulaId = String(formulaId);
  searchInput.dataset.formulaName = name;
  searchWrap.appendChild(searchInput);
  const costInput = document.createElement('input');
  costInput.type = 'number';
  costInput.className = 'form-ctl factory-mat-cost';
  costInput.value = perKg;
  costInput.readOnly = true;
  costInput.classList.add('st-background__e94d78', 'st-color__5872de', 'st-cursor__2a9295');
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.className = 'form-ctl factory-mat-qty';
  qtyInput.placeholder = 'Qty (kg)';
  qtyInput.value = qtyVal;
  qtyInput.addEventListener('input', notify);
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn factory-row-del-btn';
  delBtn.innerHTML = '&times;';
  delBtn.title = 'Remove row';
  delBtn.onclick = () => { div.remove(); notify(); };
  div.append(searchWrap, costInput, qtyInput, delBtn);
  container.appendChild(div);
  return div;
}

function _roField(cls, value) {
  const el = document.createElement('input');
  el.type = cls === 'name' ? 'text' : 'number';
  el.className = cls === 'name' ? 'form-ctl factory-link-child-name' : `form-ctl factory-mat-${cls}`;
  el.value = value;
  el.readOnly = true;
  el.tabIndex = -1;
  el.classList.add('st-background__e94d78', 'st-color__5872de', 'st-cursor__2a9295');
  return el;
}

function _refreshChildren(container) {
  container.querySelectorAll('.factory-link-child').forEach((r) => r.remove());
  [...container.querySelectorAll('.factory-formula-grid')].forEach((row) => {
    const inp = row.querySelector('.factory-mat-search-input');
    if (!inp || inp.dataset.kind !== 'formula') return;
    const sub = _ctx.list.find((f) => String(f.id) === String(inp.dataset.formulaId));
    const q = _num(row.querySelector('.factory-mat-qty').value, 0);
    if (!sub || !(q > 0)) return;
    const d = describeFormula(sub, _ctx.list, _ctx.inventory);
    if (!(d.weight > 0)) return;
    const scale = q / d.weight;
    let anchor = row;
    d.items.forEach((m) => {
      const child = document.createElement('div');
      child.className = 'factory-formula-grid factory-link-child';
      const wrap = document.createElement('div');
      wrap.className = 'factory-mat-select';
      wrap.appendChild(_roField('name', `\u21b3 ${m.name}`));
      child.append(wrap, _roField('cost', m.cost), _roField('qty', Math.round(m.quantity * scale * 1e6) / 1e6), document.createElement('span'));
      anchor.after(child);
      anchor = child;
    });
  });
}

function _pickFormula(container, formula, sourceRow) {
  const taken = [...container.querySelectorAll('.factory-mat-search-input')].some((i) => i.dataset.kind === 'formula' && i.dataset.formulaId === String(formula.id));
  if (taken) { showToast(`"${formula.name || 'Formula'}" is already linked here. Change its quantity instead.`, 'warning'); return; }
  const weight = describeFormula(formula, _ctx.list, _ctx.inventory).weight;
  if (!(weight > 0)) { showToast(`"${formula.name || 'Formula'}" has no materials to link`, 'warning'); return; }
  const blank = sourceRow && sourceRow.querySelector('.factory-mat-search-input');
  if (sourceRow && blank && !blank.dataset.matId) sourceRow.remove();
  _createLinkRow(container, formula.id, Math.round(weight * 1e6) / 1e6, formula.name);
  container.dispatchEvent(new CustomEvent('formularowchange'));
}

function _createRow(container, selectedId, qtyVal, costVal, savedName, inventory, formulas = [], linkId = '') {
  if (linkId) return _createLinkRow(container, linkId, qtyVal, savedName);
  let currentCost = costVal !== null ? costVal : 0;
  const currentId = selectedId ? String(selectedId) : '';
  let currentName = savedName || '';
  if (currentId) {
    const match = inventory.find((i) => String(i.id) === currentId);
    if (match) {
      currentName = match.name;
      if (costVal === null) currentCost = match.cost;
    }
  }
  const notify = () => container.dispatchEvent(new CustomEvent('formularowchange'));
  const div = document.createElement('div');
  div.className = 'factory-formula-grid';
  window.setStyle(div, 'position', 'st-position__d461c9');
  const searchWrap = document.createElement('div');
  searchWrap.className = 'factory-mat-select';
  searchWrap.classList.add('st-position__d461c9');
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'form-ctl factory-mat-search-input';
  searchInput.placeholder = 'Search material…';
  searchInput.value = currentName;
  searchInput.dataset.matId = currentId;
  searchInput.dataset.matCost = String(currentCost);
  searchInput.autocomplete = 'off';
  searchInput.classList.add('u-4c8551b');
  const dropdown = document.createElement('div');
  dropdown.className = 'factory-mat-dropdown dd-menu dd-suggest hidden';
  const costInput = document.createElement('input');
  costInput.type = 'number';
  costInput.className = 'form-ctl factory-mat-cost';
  costInput.placeholder = 'Cost';
  costInput.value = currentCost;
  costInput.readOnly = true;
  costInput.classList.add('st-background__e94d78', 'st-color__5872de', 'st-cursor__2a9295');
  const renderDropdown = (query) => {
    const q = (query || '').toLowerCase();
    const filtered = q ? inventory.filter((i) => i.name && i.name.toLowerCase().includes(q)) : inventory;
    const typed = (query || '').trim();
    const fq = typed.toLowerCase();
    const formulaOpts = formulas.filter((f) => !fq || (f.name || 'Untitled').toLowerCase().includes(fq))
      .map((f) => `<div class="factory-mat-option factory-mat-formula" data-formula="${esc(String(f.id))}">Link formula: ${esc(f.name || 'Untitled')}</div>`).join('');
    if (!typed && !formulaOpts) { window.Dropdown.hide(dropdown); return; }
    if (!typed) {
      dropdown.innerHTML = formulaOpts;
      window.Dropdown.show(dropdown, searchInput);
      bindOptions();
      return;
    }
    const exact = typed && inventory.some((i) => i.name && i.name.trim().toLowerCase() === typed.toLowerCase());
    const customOpt = typed && !exact ? `<div class="factory-mat-option factory-mat-custom u-d7ba50a" data-custom="1" data-name="${esc(typed)}">+ Add "${esc(typed)}" (not in inventory)</div>` : '';
    if (!filtered.length) {
      dropdown.innerHTML = formulaOpts + (customOpt || (formulaOpts ? '' : '<div class="empty is-compact">No materials found</div>'));
    } else {
      dropdown.innerHTML = filtered.map((i) => `<div class="factory-mat-option u-a21e610 st-background__356c02" data-id="${esc(String(i.id))}" data-cost="${esc(String(i.cost))}" data-name="${esc(i.name)}">${esc(i.name)}</div>`).join('') + formulaOpts + customOpt;
    }
    window.Dropdown.show(dropdown, searchInput);
    bindOptions();
  };
  const bindOptions = () => {
    dropdown.querySelectorAll('.factory-mat-option').forEach((opt) => {
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        if (opt.dataset.formula) {
          const f = formulas.find((x) => String(x.id) === opt.dataset.formula);
          window.Dropdown.hide(dropdown);
          if (f) _pickFormula(container, f, div);
          return;
        }
        if (opt.dataset.custom === '1') {
          searchInput.value = opt.dataset.name;
          searchInput.dataset.matId = 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          searchInput.dataset.custom = '1';
          searchInput.dataset.matCost = '0';
          costInput.value = 0;
          window.Dropdown.hide(dropdown);
          notify();
          return;
        }
        delete searchInput.dataset.custom;
        searchInput.value = opt.dataset.name;
        searchInput.dataset.matId = opt.dataset.id;
        searchInput.dataset.matCost = opt.dataset.cost;
        costInput.value = opt.dataset.cost;
        window.Dropdown.hide(dropdown);
        notify();
      });
    });
  };
  searchInput.addEventListener('focus', () => renderDropdown(searchInput.value));
  searchInput.addEventListener('input', () => {
    if (searchInput.dataset.custom === '1') { searchInput.dataset.matId = ''; delete searchInput.dataset.custom; }
    renderDropdown(searchInput.value);
  });
  searchInput.addEventListener('blur', () => {
    setTimeout(() => window.Dropdown.hide(dropdown), 150);
    if (!searchInput.dataset.matId) {
      const typed = searchInput.value.trim();
      if (typed) {
        const inv = inventory.find((i) => i.name && i.name.trim().toLowerCase() === typed.toLowerCase());
        if (inv) {
          searchInput.value = inv.name;
          searchInput.dataset.matId = String(inv.id);
          searchInput.dataset.matCost = String(inv.cost);
          costInput.value = inv.cost;
        } else {
          searchInput.dataset.matId = 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          searchInput.dataset.custom = '1';
          costInput.value = 0;
        }
        notify();
      } else {
        costInput.value = '';
      }
    }
  });
  searchWrap.appendChild(searchInput);
  searchWrap.appendChild(dropdown);
  const qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.className = 'form-ctl factory-mat-qty';
  qtyInput.placeholder = 'Qty (kg)';
  qtyInput.value = qtyVal;
  qtyInput.addEventListener('input', notify);
  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'btn factory-row-del-btn';
  delBtn.innerHTML = '&times;';
  delBtn.title = 'Remove row';
  delBtn.onclick = () => {
    div.remove();
    notify();
  };
  div.appendChild(searchWrap);
  div.appendChild(costInput);
  div.appendChild(qtyInput);
  div.appendChild(delBtn);
  container.appendChild(div);
  return div;
}

async function _loadCtx() {
  const [list, inv] = await Promise.all([getFormulaStore(), sqliteStore.get('inventory')]);
  _ctx = { list, inventory: ensureArray(inv).filter((i) => !(i && i.isPurchaseLot)) };
  return _ctx;
}

function _pickableFormulas() {
  return _ctx.list.filter((f) => ensureArray(f.ingredients).length && (!_editingId || canLink(_ctx.list, _editingId, f.id)));
}

async function _fillEditor(entry) {
  const inventory = ensureArray(await sqliteStore.get('inventory')).filter((i) => !(i && i.isPurchaseLot));
  await _loadCtx();
  const formulas = _pickableFormulas();
  const container = _el('fsEditContainer');
  if (!container) return;
  container.replaceChildren();
  ensureArray(entry.ingredients).forEach((ing) => {
    if (isLink(ing)) { _createRow(container, '', ing.quantity, null, ing.name, inventory, formulas, ing.formulaId); return; }
    let id = ing.id;
    if (/^custom_/.test(String(id)) && ing.name) {
      const inv = inventory.find((i) => i.name && i.name.trim().toLowerCase() === String(ing.name).trim().toLowerCase());
      if (inv) id = inv.id;
    }
    const row = _createRow(container, id, ing.quantity, id === ing.id ? ing.cost : null, ing.name, inventory, formulas);
    if (/^custom_/.test(String(id))) { const inp = row.querySelector('.factory-mat-search-input'); if (inp) inp.dataset.custom = '1'; }
  });
  _el('fs-edit-name').value = entry.name || '';
  _el('fs-additional-cost').value = _num(entry.additionalCost, 0);
  _el('fs-cost-factor').value = _num(entry.costAdjustmentFactor, 1);
  _refreshChildren(container);
  updateFormulaStoreSummary();
}

function _collectEditor() {
  const container = _el('fsEditContainer');
  const ingredients = [];
  if (container) {
    container.querySelectorAll('.factory-formula-grid:not(.factory-link-child)').forEach((row) => {
      const inp = row.querySelector('.factory-mat-search-input');
      const costIn = row.querySelector('.factory-mat-cost');
      const qtyIn = row.querySelector('.factory-mat-qty');
      const name = inp ? inp.value.trim() : '';
      if (inp && inp.dataset.kind === 'formula') {
        if (qtyIn && _num(qtyIn.value, 0) > 0) ingredients.push({ ...linkIngredient({ id: inp.dataset.formulaId, name: inp.dataset.formulaName }, _num(qtyIn.value, 0)) });
        return;
      }
      if (inp && inp.dataset.matId && name && qtyIn && _num(qtyIn.value, 0) > 0) {
        ingredients.push({ id: inp.dataset.matId, name, cost: _num(costIn ? costIn.value : 0, 0), quantity: _num(qtyIn.value, 0), ...(inp.dataset.custom === '1' ? { custom: true } : {}) });
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
  const d = describeFormula({ id: _editingId || '__new__', ingredients: c.ingredients, additionalCost: c.additionalCost, costAdjustmentFactor: c.costAdjustmentFactor }, _ctx.list, _ctx.inventory);
  const set = (id, v) => { const el = _el(id); if (el) el.innerText = v; };
  set('fsSummaryWeight', _fmt(d.weight) + ' kg');
  set('fsSummaryRaw', _fmt(d.raw));
  set('fsSummaryPerUnit', _fmt(d.perUnit));
  set('fsSummaryPerKg', _fmt(d.perKg));
}

function _bindEditor() {
  const container = _el('fsEditContainer');
  if (!container || container.dataset.bound === '1') return;
  container.dataset.bound = '1';
  container.addEventListener('formularowchange', () => setTimeout(() => { _refreshChildren(container); updateFormulaStoreSummary(); }, 0));
}

export async function openFormulaStoreEditor(id) {
  _editingId = id || null;
  const list = await getFormulaStore();
  const entry = id ? list.find((f) => String(f.id) === String(id)) : null;
  if (id && !entry) { showToast('Formula not found', 'warning'); return; }
  const del = _el('fs-delete-btn');
  if (del) window.setDisplay(del, entry ? '' : 'none');
  const title = _el('fs-edit-title');
  if (title) title.textContent = entry ? 'Edit Formula' : 'New Formula';
  _bindEditor();
  if (typeof window.openStandaloneScreen === 'function') window.openStandaloneScreen('formula-store-edit-screen');
  await _fillEditor(entry || { name: '', ingredients: [], additionalCost: 0, costAdjustmentFactor: 1 });
}

export async function addFormulaIngredientRow() {
  const container = _el('fsEditContainer');
  if (!container) return;
  _bindEditor();
  const inventory = ensureArray(await sqliteStore.get('inventory')).filter((i) => !(i && i.isPurchaseLot));
  await _loadCtx();
  const row = _createRow(container, '', '', null, '', inventory, _pickableFormulas());
  row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const inp = row.querySelector('.factory-mat-search-input');
  if (inp) setTimeout(() => inp.focus(), 200);
  updateFormulaStoreSummary();
}

export function saveFormulaStoreEntry(...a) { return confirmGuard('saveFormulaStoreEntry', () => _saveFormulaStoreEntryRaw(...a), { label: 'Formula', late: true, isUpdate: () => !!_editingId }); }

function _editorRows() {
  const out = [];
  const container = _el('fsEditContainer');
  if (!container) return out;
  container.querySelectorAll('.factory-formula-grid:not(.factory-link-child)').forEach((row) => {
    const inp = row.querySelector('.factory-mat-search-input');
    const qtyIn = row.querySelector('.factory-mat-qty');
    out.push({
      label: inp ? inp.value : '',
      matId: inp && inp.dataset.kind !== 'formula' ? (inp.dataset.matId || '') : '',
      formulaId: inp && inp.dataset.kind === 'formula' ? (inp.dataset.formulaId || '') : '',
      qty: qtyIn ? qtyIn.value : '',
    });
  });
  return out;
}
async function _saveFormulaStoreEntryRaw() {
  const _issue = formulaFormIssue({ rows: _editorRows() });
  if (_issue) { window.notifyBlocking(_issue, 'warning', 'Warning'); return false; }
  const c = _collectEditor();
  if (!c.name) { window.notifyBlocking('Enter a formula name', 'warning', 'Warning'); return false; }
  if (!c.ingredients.length) { window.notifyBlocking('Add at least one ingredient with quantity', 'warning', 'Warning'); return false; }
const fresh = await getFormulaStore();
  const _fi = nameIssue(c.name, 'Formula name')
    || numberIssue(_el('fs-additional-cost').value, { label: 'Additional cost', min: 0, max: LIMITS.UNIT_COST_MAX, allowBlank: true })
    || numberIssue(_el('fs-cost-factor').value, { label: 'Cost factor', min: 0, minExclusive: true, max: LIMITS.COST_FACTOR_MAX, allowBlank: true })
    || (c.ingredients.find((i) => i.quantity < LIMITS.QTY_MIN || i.quantity > LIMITS.QTY_MAX) ? `Each ingredient quantity must be between ${LIMITS.QTY_MIN} and ${LIMITS.QTY_MAX.toLocaleString('en-US')} kg.` : '');
  if (_fi) { window.notifyBlocking(_fi, 'warning', 'Warning'); return false; }
  const _dupFormula = duplicateName(c.name, fresh, _editingId);
  if (_dupFormula) { window.notifyBlocking(`A formula named "${_dupFormula.name}" already exists. Choose a different name or edit that formula.`, 'warning', 'Warning'); return false; }
  for (const ing of c.ingredients.filter(isLink)) {
    if (!fresh.some((f) => String(f.id) === String(ing.formulaId))) { window.notifyBlocking(`The linked formula "${ing.name}" no longer exists. Remove that row.`, 'warning', 'Warning'); return false; }
    if (_editingId && !canLink(fresh, _editingId, ing.formulaId)) { window.notifyBlocking(`"${ing.name}" already uses this formula, so it can't be linked back.`, 'warning', 'Warning'); return false; }
  }
if (!(await window.gcCommit({}))) return false;
  const list = await getFormulaStore();
  const now = getTimestamp();
  const idx = _editingId ? list.findIndex((f) => String(f.id) === String(_editingId)) : -1;
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...c, updatedAt: now };
  } else {
    _editingId = generateUUID('formula');
    list.push({ id: _editingId, ...c, createdAt: now, updatedAt: now });
  }
  await _saveFormulaStore(list, _feedWrites(list, now));
  sendDeviceNotification(idx >= 0 ? 'Formula updated' : 'Formula created', `"${c.name}" was saved with ${c.ingredients.length} ingredient${c.ingredients.length === 1 ? '' : 's'}.`, 'formula-' + _editingId, { target: { k: 'view', id: 'formula-store' } }).catch(() => {});
  if (typeof window.closeStandaloneScreen === 'function') window.closeStandaloneScreen('formula-store-edit-screen');
  return true;
}

export async function deleteFormulaStoreEntry() {
  if (!_editingId) return;
  const stores = await getAppStores();
  const users = stores.filter((s) => formulaIdOf(s) === String(_editingId)).map((s) => s.name);
  if (users.length) {
    window.notifyBlocking(`In use by ${users.join(', ')}. Assign those stores another formula first.`, 'warning', 'Warning');
    return;
  }
  const linkedBy = formulaUsers(await getFormulaStore(), _editingId).map((f) => f.name || 'Untitled');
  if (linkedBy.length) {
    window.notifyBlocking(`Linked inside ${linkedBy.join(', ')}. Remove that link first.`, 'warning', 'Warning');
    return;
  }
  const _factory = ensureArray(await sqliteStore.get('factory'));
  const _production = ensureArray(await sqliteStore.get('production'));
  const _left = computeUnitPools(_factory, _production)[String(_editingId)];
  if (_left && _left.available > 0.0005) {
    window.notifyBlocking(`${fmtNum(_left.available)} unit${_left.available === 1 ? '' : 's'} made with this formula are still unused. Use them in production or delete those factory batches first.`, 'warning', 'Warning');
    return;
  }
  const _past = _factory.filter((e) => e && !e.deletedAt && String(e.formulaId) === String(_editingId)).length;
  const ok = await showGlassConfirm('Delete this formula from the store?' + (_past ? `\n\nIt was used for ${_past} factory batch${_past === 1 ? '' : 'es'}. Their recorded costs stay as they are.` : ''), { title: 'Delete Formula', confirmText: 'Delete', danger: true });
  if (!ok) return;
  const fullList = await getFormulaStore();
  const removed = fullList.find((f) => String(f.id) === String(_editingId));
  const list = fullList.filter((f) => String(f.id) !== String(_editingId));
  if (removed) await trashRecord('formulas', removed);
  await _saveFormulaStore(list, _feedWrites(list, getTimestamp()));
  sendDeviceNotification('Formula deleted', removed && removed.name ? `"${removed.name}" was removed from your formulas.` : 'A formula was removed.', 'formula-del-' + _editingId, { target: { k: 'view', id: 'formula-store' } }).catch(() => {});
  _editingId = null;
  if (typeof window.closeStandaloneScreen === 'function') window.closeStandaloneScreen('formula-store-edit-screen');
}

Object.assign(window, { openFormulaStoreEditor, addFormulaIngredientRow, saveFormulaStoreEntry, deleteFormulaStoreEntry, updateFormulaStoreSummary });

export const __screenHtml = "<div id=\"formula-store-edit-screen\" class=\"standalone-screen d-none\">\n  <div class=\"shell-bar screen-topbar\">\n    <h2 class=\"screen-title\" id=\"fs-edit-title\">Edit Formula</h2>\n  </div>\n  <div class=\"screen-body\" id=\"formula-store-edit-body\">\n    <div class=\"field u-mb-15\">\n      <label>Formula Name</label>\n      <input class=\"form-ctl\" type=\"text\" id=\"fs-edit-name\" maxlength=\"60\" placeholder=\"e.g. Premium Blend\">\n    </div>\n    <div class=\"grid-inputs u-mb-15\">\n      <div class=\"field\">\n        <label>Additional Cost (Per Unit)</label>\n        <input class=\"form-ctl\" type=\"number\" id=\"fs-additional-cost\" step=\"0.01\" min=\"0\" value=\"0\" oninput=\"updateFormulaStoreSummary()\">\n      </div>\n      <div class=\"field\">\n        <label>Cost Adjustment for Sales &amp; Calc (X)</label>\n        <input class=\"form-ctl\" type=\"number\" id=\"fs-cost-factor\" step=\"0.01\" min=\"1\" value=\"1\" oninput=\"updateFormulaStoreSummary()\">\n      </div>\n    </div>\n    <div class=\"factory-formula-header\">\n      <span>Material</span>\n      <span>Cost / Unit</span>\n      <span>Qty (kg)</span>\n      <span></span>\n    </div>\n    <div id=\"fsEditContainer\"></div>\n    <button type=\"button\" class=\"btn btn-theme u-add-row-btn\" onclick=\"addFormulaIngredientRow()\">+ Add Ingredient Row</button>\n    <div class=\"formula-store-edit-hint\">Tip: search a material, or link a Formula so its materials follow any later changes to it.</div>\n    <div class=\"u-bg-accent-5 u-p-10 u-rounded-8 u-mb-15 u-4bb9003\">\n      <div class=\"factory-summary-row\"><span class=\"factory-summary-label\">Unit Weight:</span><span class=\"qty-val\" id=\"fsSummaryWeight\">0 kg</span></div>\n      <div class=\"factory-summary-row\"><span class=\"factory-summary-label\">Raw Material Cost per Unit:</span><span class=\"cost-val\" id=\"fsSummaryRaw\">0</span></div>\n      <div class=\"factory-summary-row\"><span class=\"factory-summary-label\">Total Cost per Unit:</span><span class=\"cost-val\" id=\"fsSummaryPerUnit\">0</span></div>\n      <div class=\"factory-summary-row\"><span class=\"factory-summary-label\">Cost per kg (Sales/Calc):</span><span class=\"cost-val\" id=\"fsSummaryPerKg\">0</span></div>\n    </div>\n    <div class=\"btn-split\">\n      <button class=\"btn btn-danger u-81e32d3 d-none\" id=\"fs-delete-btn\" onclick=\"deleteFormulaStoreEntry()\">Delete Formula</button>\n      <button class=\"btn btn-main u-mt-8 u-16000cc\" onclick=\"(async()=>{await saveFormulaStoreEntry()})()\">Save Formula</button>\n    </div>\n  </div>\n</div>";
export const __screenCss = "\n";
