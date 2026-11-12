import { appMode, ensureRecordIntegrity, esc, fmtAmt, formatTime12, generateUUID, getTimestamp, loadCollections, localDateStr, round2, validateUUID } from './business.js';
import { openDialog, dialogIcons, notifyBlocking } from './dialog.js';
import { unifiedSave } from './sync.js';
import { isMoneyRestricted } from './money-privacy.js';
import { notifyDataChange, triggerAutoSync } from './utilities-core.js';
import { calculateCashTracker, calculateNetCash, refreshCustomerSales } from './utilities-sales.js';
import { refreshPaymentTab } from './utilities-payments.js';
import { currentManagingCustomer, renderCustomerTransactions, renderCustomersTable, showToast } from './customers.js';

const FIELD = 'cust-money-out';

export function buildMoneyOutRecord({ name, amount, date, note, createdBy }) {
  const stamp = getTimestamp();
  return {
    id: generateUUID('sale'),
    timestamp: stamp,
    createdAt: stamp,
    updatedAt: stamp,
    date,
    time: formatTime12(new Date()),
    customerName: name,
    customerPhone: '',
    quantity: 0,
    supplyStore: null,
    paymentType: 'MONEY_OUT',
    salesRep: 'NONE',
    currentRepProfile: 'admin',
    totalCost: 0,
    totalValue: round2(amount),
    profit: 0,
    creditReceived: true,
    isMoneyOut: true,
    affectsInventory: false,
    notes: note || '',
    gps: null,
    syncedAt: new Date().toISOString(),
    createdBy: createdBy || null
  };
}

function askMoneyOut(name) {
  const body = `<p>Cash paid out to <strong>${esc(name)}</strong>. It is added to what the customer owes (or reduces their credit).</p>
<div class="dlg-field"><input type="number" inputmode="decimal" min="0" step="1" id="${FIELD}-amt" class="form-ctl dlg-input" placeholder="Amount (₨)"></div>
<div class="dlg-field"><input type="date" id="${FIELD}-date" class="form-ctl dlg-input" value="${localDateStr()}"></div>
<div class="dlg-field"><input type="text" id="${FIELD}-note" class="form-ctl dlg-input" placeholder="Note (optional)" maxlength="120" autocomplete="off"></div>
<div class="dlg-error" id="${FIELD}-err" role="alert"></div>`;
  const guard = async (overlay) => {
    const amount = parseFloat(overlay.querySelector(`#${FIELD}-amt`).value);
    const date = overlay.querySelector(`#${FIELD}-date`).value;
    const note = overlay.querySelector(`#${FIELD}-note`).value.trim();
    const err = overlay.querySelector(`#${FIELD}-err`);
    if (!(amount > 0)) { err.textContent = 'Enter an amount greater than zero.'; return { ok: false }; }
    if (!date) { err.textContent = 'Select a date.'; return { ok: false }; }
    err.textContent = '';
    return { ok: true, value: { amount, date, note } };
  };
  return openDialog({
    tone: 'primary',
    title: 'Money Out',
    caption: 'Pay money to customer',
    icon: dialogIcons.lock,
    body,
    actions: [{ label: 'Cancel', variant: 'ghost', value: null }, { label: 'Save', variant: 'solid', value: null, guard }],
    dismissIndex: 0,
    dismissOnBackdrop: false
  });
}

export async function recordCustomerMoneyOut(nameArg) {
  const name = String(nameArg || currentManagingCustomer || '').trim();
  if (!name) { notifyBlocking('Open a customer first.', 'warning', 'Warning'); return; }
  if (isMoneyRestricted()) { notifyBlocking('You do not have access to record money.', 'warning', 'Not allowed'); return; }
  const input = await askMoneyOut(name);
  if (!input) return;
  const id = generateUUID('sale');
  if (!validateUUID(id)) { notifyBlocking('Error generating transaction ID. Please try again.', 'error', 'Something went wrong'); return; }
  const createdBy = (appMode === 'userrole' && window._assignedManagerName) ? window._assignedManagerName : null;
  const rec = ensureRecordIntegrity(buildMoneyOutRecord({ name, ...input, createdBy }), false);
  const { sales } = await loadCollections('sales');
  const snapshot = [...sales];
  try {
    sales.push(rec);
    await unifiedSave('sales', sales, rec);
    notifyDataChange('sales');
    triggerAutoSync();
    if (typeof calculateCashTracker === 'function') calculateCashTracker();
    if (typeof calculateNetCash === 'function') calculateNetCash();
    if (typeof refreshPaymentTab === 'function') await refreshPaymentTab();
    if (typeof refreshCustomerSales === 'function') await refreshCustomerSales();
    renderCustomersTable();
    await renderCustomerTransactions(name);
    showToast(`Money out of ${fmtAmt(rec.totalValue)} recorded for ${name}`, 'success');
  } catch (e) {
    sales.length = 0; sales.push(...snapshot);
    try { await unifiedSave('sales', sales); } catch (_) {}
    notifyBlocking('Failed to save money out. Please try again.', 'error', 'Something went wrong');
  }
}

window.recordCustomerMoneyOut = recordCustomerMoneyOut;
