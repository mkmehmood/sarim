import { openDialog } from './dialog.js';
import { esc, fmtAmt, sqliteStore } from './business.js';
import { addExpenseItem, removeExpenseItem, expenseTotal, cleanExpenseItems, addCategoryName, cleanCategoryNames } from './field-expense-items.js';

const el = (id) => document.getElementById(id);
const toast = (msg, type) => { if (typeof window.showToast === 'function') window.showToast(msg, type); };

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v.01M18 14v.01"/></svg>';

const SEARCH = "handleUniversalSearch('fe-name','fe-results','expense-category')";

const KINDS = {
  expense: {
    inputId: 'fieldExpenses',
    title: 'Field Expenses',
    eyebrow: 'Expenses',
    caption: 'Search or type a category, tap it, add the amount and save. The field shows the total paid.',
    placeholder: 'Search or type a category (e.g. Fuel)',
    totalLabel: 'Total paid',
    tag: 'Expense'
  },
  commission: {
    inputId: 'commissionPaid',
    title: 'Commission Paid',
    eyebrow: 'Commission',
    caption: 'Search or type a category, tap it, add the amount and save. The field shows the total paid.',
    placeholder: 'Search or type a category (e.g. Advance)',
    totalLabel: 'Total paid',
    tag: 'Commission'
  }
};

const lists = { expense: [], commission: [] };
let activeKind = 'expense';

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

const CATEGORY_KEY = 'expense_categories';

async function loadCategories(kind) {
  let stored = null;
  try { stored = await sqliteStore.get(CATEGORY_KEY); } catch (e) { stored = null; }
  return cleanCategoryNames(stored && stored[kind]);
}

async function rememberCategory(kind, name) {
  let stored = null;
  try { stored = await sqliteStore.get(CATEGORY_KEY); } catch (e) { stored = null; }
  const next = { expense: cleanCategoryNames(stored && stored.expense), commission: cleanCategoryNames(stored && stored.commission) };
  next[kind] = addCategoryName(next[kind], name);
  try { await sqliteStore.set(CATEGORY_KEY, next); } catch (e) { toast('Could not save the category.', 'warning'); }
}

export async function expenseCategorySearchItems(query) {
  const q = String(query || '').trim().toLowerCase();
  const merged = lists[activeKind].reduce((acc, it) => addCategoryName(acc, it.name), await loadCategories(activeKind));
  return merged.filter((name) => !q || name.toLowerCase().includes(q)).slice(0, 12).map((value) => ({ value, tag: KINDS[activeKind].tag }));
}

export function expenseCategoryOnPick() {
  const amount = document.getElementById('fe-amount');
  if (amount) amount.focus();
}

function openPopup(kind) {
  activeKind = kind;
  const cfg = KINDS[kind];
  const body = `<div class="fe-form"><div class="dlg-field"><input id="fe-name" class="dlg-input" type="text" placeholder="${esc(cfg.placeholder)}" autocomplete="off" maxlength="60" oninput="${SEARCH}" onfocus="${SEARCH}"><div id="fe-results" class="hidden dl-results st-background__e02427 st-border-bottom__e54b2f"></div></div><div class="dlg-field"><input id="fe-amount" class="dlg-input" type="number" inputmode="decimal" min="0" step="any" placeholder="Amount"></div></div><div id="fe-list" class="fe-list">${listHtml(kind)}</div>`;
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
          const nameEl = overlay.querySelector('#fe-name');
          const amountEl = overlay.querySelector('#fe-amount');
          const label = nameEl.value.trim();
          const value = parseFloat(amountEl.value);
          if (!label) { toast('Search and select a category, or type a new one.', 'warning'); nameEl.focus(); return { ok: false }; }
          if (!(value > 0)) { toast('Enter an amount greater than zero.', 'warning'); amountEl.focus(); return { ok: false }; }
          lists[kind] = addExpenseItem(lists[kind], label, value);
          await rememberCategory(kind, label);
          syncInput(kind, true);
          overlay.querySelector('#fe-list').innerHTML = listHtml(kind);
          overlay.querySelector('#fe-results').classList.add('hidden');
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
      overlay.querySelector('#fe-list').innerHTML = listHtml(kind);
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.closest('#fe-name, #fe-amount')) return;
      e.preventDefault();
      const save = overlay.querySelector('.dlg-btn--solid');
      if (save && !save.disabled) save.click();
    });
    setTimeout(() => { const n = overlay.querySelector('#fe-name'); if (n) n.focus(); }, 80);
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
