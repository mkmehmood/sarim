import { openDialog } from './dialog.js';
import { esc, fmtAmt, sqliteStore } from './business.js';
import { triggerAutoSync } from './utilities-core.js';
import { addExpenseItem, removeExpenseItem, expenseTotal, cleanExpenseItems, addCategoryName, cleanCategoryNames } from './field-expense-items.js';

const el = (id) => document.getElementById(id);
const toast = (msg, type) => { if (typeof window.showToast === 'function') window.showToast(msg, type); };

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v.01M18 14v.01"/></svg>';

const KINDS = {
  expense: {
    inputId: 'fieldExpenses',
    nameId: 'fe-name',
    resultsId: 'fe-results',
    source: 'field-expense-category',
    storeKey: 'field_expense_categories',
    title: 'Field Expenses',
    eyebrow: 'Expenses',
    caption: 'Search or type a category, tap it, add the amount and save. The field shows the total paid.',
    placeholder: 'Search or type a category (e.g. Fuel)',
    totalLabel: 'Total paid',
    tag: 'Expense'
  },
  commission: {
    inputId: 'commissionPaid',
    nameId: 'cp-name',
    resultsId: 'cp-results',
    source: 'commission-category',
    storeKey: 'commission_categories',
    title: 'Commission Paid',
    eyebrow: 'Commission',
    caption: 'Search or type a category, tap it, add the amount and save. The field shows the total paid.',
    placeholder: 'Search or type a category (e.g. Advance)',
    totalLabel: 'Total paid',
    tag: 'Commission'
  }
};

const lists = { expense: [], commission: [] };

export function getFieldExpenseItems() {
  return cleanExpenseItems(lists.expense);
}

export function getCommissionItems() {
  return cleanExpenseItems(lists.commission);
}

function syncInput(kind, recalculate) {
  const input = el(KINDS[kind].inputId);
  if (!input) return;
  const total = expenseTotal(lists[kind]);
  input.value = total > 0 ? String(total) : '';
  if (recalculate && typeof window.calculateSales === 'function') window.calculateSales();
}

export function resetFieldExpenses() {
  lists.expense = [];
  syncInput('expense', false);
}

export function resetCommissionPaid() {
  lists.commission = [];
  syncInput('commission', false);
}

function listHtml(kind) {
  const items = lists[kind];
  if (!items.length) return '<div class="fe-empty">Nothing added yet.</div>';
  const rows = items.map((it, i) => `<div class="fe-row"><span class="fe-name">${esc(it.name)}</span><span class="fe-amt cost-val">${esc(fmtAmt(it.amount))}</span><button type="button" class="fe-del" data-fe-del="${i}" aria-label="Remove ${esc(it.name)}">&times;</button></div>`).join('');
  return `${rows}<div class="fe-total"><span>${esc(KINDS[kind].totalLabel)}</span><b>${esc(fmtAmt(expenseTotal(items)))}</b></div>`;
}

async function loadCategories(kind) {
  let stored = null;
  try { stored = await sqliteStore.get(KINDS[kind].storeKey); } catch (e) { stored = null; }
  return cleanCategoryNames(stored);
}

async function rememberCategory(kind, name) {
  const key = KINDS[kind].storeKey;
  const current = await loadCategories(kind);
  const next = addCategoryName(current, name);
  if (next.length === current.length) return;
  try {
    await sqliteStore.setBatch([[key, next], [`${key}_timestamp`, Date.now()]]);
    if (typeof triggerAutoSync === 'function') triggerAutoSync();
  } catch (e) { toast('Could not save the category.', 'warning'); }
}

const kindOfSource = (source) => Object.keys(KINDS).find((k) => KINDS[k].source === source);

export async function expenseCategorySearchItems(source, query) {
  const kind = kindOfSource(source);
  if (!kind) return [];
  const q = String(query || '').trim().toLowerCase();
  const merged = lists[kind].reduce((acc, it) => addCategoryName(acc, it.name), await loadCategories(kind));
  return merged.filter((name) => !q || name.toLowerCase().includes(q)).slice(0, 12).map((value) => ({ value, tag: KINDS[kind].tag }));
}

export function expenseCategoryOnPick(inputId) {
  const kind = Object.keys(KINDS).find((k) => KINDS[k].nameId === inputId);
  const amount = document.getElementById(kind ? `${KINDS[kind].nameId.slice(0, 2)}-amount` : '');
  if (amount) amount.focus();
}

function openPopup(kind) {
  const cfg = KINDS[kind];
  const pre = cfg.nameId.slice(0, 2);
  const search = `handleUniversalSearch('${cfg.nameId}','${cfg.resultsId}','${cfg.source}')`;
  const body = `<div class="fe-form"><div class="dlg-field"><input id="${cfg.nameId}" class="dlg-input" type="text" placeholder="${esc(cfg.placeholder)}" autocomplete="off" maxlength="60" oninput="${search}" onfocus="${search}"><div id="${cfg.resultsId}" class="hidden dl-results st-background__e02427 st-border-bottom__e54b2f"></div></div><div class="dlg-field"><input id="${pre}-amount" class="dlg-input" type="number" inputmode="decimal" min="0" step="any" placeholder="Amount"></div></div><div id="${pre}-list" class="fe-list">${listHtml(kind)}</div>`;
  const shown = openDialog({
    tone: 'primary',
    title: cfg.title,
    eyebrow: cfg.eyebrow,
    caption: cfg.caption,
    icon: ICON,
    body,
    actions: [
      { label: 'Done', variant: 'ghost', value: false },
      {
        label: 'Save',
        variant: 'solid',
        value: true,
        guard: async (overlay) => {
          const nameEl = overlay.querySelector(`#${cfg.nameId}`);
          const amountEl = overlay.querySelector(`#${pre}-amount`);
          const label = nameEl.value.trim();
          const value = parseFloat(amountEl.value);
          if (!label) { toast('Search and select a category, or type a new one.', 'warning'); nameEl.focus(); return { ok: false }; }
          if (!(value > 0)) { toast('Enter an amount greater than zero.', 'warning'); amountEl.focus(); return { ok: false }; }
          lists[kind] = addExpenseItem(lists[kind], label, value);
          await rememberCategory(kind, label);
          syncInput(kind, true);
          overlay.querySelector(`#${pre}-list`).innerHTML = listHtml(kind);
          overlay.querySelector(`#${cfg.resultsId}`).classList.add('hidden');
          nameEl.value = '';
          amountEl.value = '';
          toast(`${label} saved`, 'success');
          nameEl.focus();
          return { ok: false };
        }
      }
    ],
    dismissIndex: 0
  });
  const overlays = document.querySelectorAll('.dlg-overlay');
  const overlay = overlays[overlays.length - 1];
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      const del = e.target.closest('[data-fe-del]');
      if (!del) return;
      lists[kind] = removeExpenseItem(lists[kind], Number(del.dataset.feDel));
      syncInput(kind, true);
      overlay.querySelector(`#${pre}-list`).innerHTML = listHtml(kind);
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.closest(`#${cfg.nameId}, #${pre}-amount`)) return;
      e.preventDefault();
      const save = overlay.querySelector('.dlg-btn--solid');
      if (save && !save.disabled) save.click();
    });
    setTimeout(() => { const n = overlay.querySelector(`#${cfg.nameId}`); if (n) n.focus(); }, 80);
  }
  return shown;
}

export function openFieldExpensePopup() {
  return openPopup('expense');
}

export function openCommissionPaidPopup() {
  return openPopup('commission');
}

window.openFieldExpensePopup = openFieldExpensePopup;
window.openCommissionPaidPopup = openCommissionPaidPopup;
window.expenseCategorySearchItems = expenseCategorySearchItems;
window.expenseCategoryOnPick = expenseCategoryOnPick;
