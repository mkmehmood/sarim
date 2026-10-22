import { openDialog } from './dialog.js';
import { esc, fmtAmt } from './business.js';
import { addExpenseItem, removeExpenseItem, expenseTotal, cleanExpenseItems } from './field-expense-items.js';

let items = [];

const el = (id) => document.getElementById(id);
const toast = (msg, type) => { if (typeof window.showToast === 'function') window.showToast(msg, type); };

const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v.01M18 14v.01"/></svg>';

export function getFieldExpenseItems() {
  return cleanExpenseItems(items);
}

function syncInput(recalculate) {
  const input = el('fieldExpenses');
  if (!input) return;
  const total = expenseTotal(items);
  input.value = total > 0 ? String(total) : '';
  if (recalculate && typeof window.calculateSales === 'function') window.calculateSales();
}

export function resetFieldExpenses() {
  items = [];
  syncInput(false);
}

function listHtml() {
  if (!items.length) return '<div class="fe-empty">No expenses added yet.</div>';
  const rows = items.map((it, i) => `<div class="fe-row"><span class="fe-name">${esc(it.name)}</span><span class="fe-amt cost-val">${esc(fmtAmt(it.amount))}</span><button type="button" class="fe-del" data-fe-del="${i}" aria-label="Remove ${esc(it.name)}">&times;</button></div>`).join('');
  return `${rows}<div class="fe-total"><span>Total paid</span><b>${esc(fmtAmt(expenseTotal(items)))}</b></div>`;
}

export function openFieldExpensePopup() {
  const body = `<div class="fe-form"><div class="dlg-field"><input id="fe-name" class="dlg-input" type="text" placeholder="Expense name (e.g. Fuel)" autocomplete="off" maxlength="60"></div><div class="dlg-field"><input id="fe-amount" class="dlg-input" type="number" inputmode="decimal" min="0" step="any" placeholder="Amount"></div></div><div id="fe-list" class="fe-list">${listHtml()}</div>`;
  const shown = openDialog({
    tone: 'primary',
    title: 'Field Expenses',
    eyebrow: 'Expenses',
    caption: 'Add each expense by name. The field shows the total paid.',
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
          if (!label) { toast('Enter an expense name.', 'warning'); nameEl.focus(); return { ok: false }; }
          if (!(value > 0)) { toast('Enter an amount greater than zero.', 'warning'); amountEl.focus(); return { ok: false }; }
          items = addExpenseItem(items, label, value);
          syncInput(true);
          overlay.querySelector('#fe-list').innerHTML = listHtml();
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
      items = removeExpenseItem(items, Number(del.dataset.feDel));
      syncInput(true);
      overlay.querySelector('#fe-list').innerHTML = listHtml();
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

window.openFieldExpensePopup = openFieldExpensePopup;
