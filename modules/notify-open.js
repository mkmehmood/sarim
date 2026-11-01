import { ensureArray, sqliteStore } from './business.js';
import { hcToggle } from './history-card.js';
import { LEDGER_SCREEN, parseTarget, resolveView } from './notify-target.js';

const WAIT_MS = 60000;
const RETRY_MS = 500;
let pending = null;
let timer = null;

function toast(message, type) {
  if (typeof window.showToast === 'function') window.showToast(message, type);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(find, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const found = find();
    if (found) return found;
    await sleep(120);
  }
  return null;
}

async function openLedger(plan) {
  const openers = { cust: window.openCustomerManagement, rep: window.openRepCustomerManagement, ent: window.openEntityDetailsOverlay };
  const open = openers[plan.kind];
  if (typeof open !== 'function') return false;
  await open(plan.owner);
  if (!plan.row) return true;
  const screen = LEDGER_SCREEN[plan.kind];
  const row = await waitFor(() => Array.from(document.querySelectorAll('#' + screen + ' .cm-row')).find((r) => r.dataset.txid === plan.row));
  if (!row) return false;
  const month = row.closest('.cm-month');
  if (month && month.classList.contains('is-collapsed')) {
    month.classList.remove('is-collapsed');
    const head = month.querySelector('.cm-month-head');
    if (head) head.setAttribute('aria-expanded', 'true');
  }
  row.scrollIntoView({ block: 'center' });
  if (typeof window.openCustomerTxnSheet === 'function') window.openCustomerTxnSheet(row);
  return true;
}

async function openCard(id) {
  const card = await waitFor(() => Array.from(document.querySelectorAll('.hc-card[data-rec]')).find((c) => c.getAttribute('data-rec') === id));
  if (!card) return false;
  card.classList.remove('d-none', 'hidden');
  if (!card.classList.contains('is-open')) hcToggle(card);
  card.scrollIntoView({ block: 'center' });
  return true;
}

async function openExpense(plan) {
  const expenses = ensureArray(await sqliteStore.get('expenses'));
  const expense = expenses.find((e) => e && String(e.id) === plan.expenseId);
  if (!expense) return false;
  if (expense.category === 'operating') {
    if (typeof window.openOperatingExpenseOverlay !== 'function') return false;
    await window.openOperatingExpenseOverlay(expense.name);
    return true;
  }
  const entities = ensureArray(await sqliteStore.get('entities'));
  const name = String(expense.name || '').toLowerCase();
  const entity = entities.find((e) => e && String(e.name || '').toLowerCase() === name);
  if (!entity) return false;
  const transactions = ensureArray(await sqliteStore.get('transactions'));
  const linked = transactions.find((t) => t && String(t.expenseId) === String(expense.id));
  return openLedger({ kind: 'ent', owner: String(entity.id), row: linked ? String(linked.id) : '' });
}

async function openView(plan) {
  if (plan.type === 'ledger') return openLedger(plan);
  if (plan.type === 'expense') return openExpense(plan);
  if (plan.type === 'transfer') {
    if (typeof window.openStandaloneScreen === 'function') window.openStandaloneScreen(plan.screen);
    if (typeof window[plan.prepare] === 'function') await window[plan.prepare]();
    return openCard(plan.card);
  }
  if (plan.type === 'factory') {
    if (typeof window.showTab === 'function') await window.showTab('factory');
    return openCard(plan.card);
  }
  if (plan.type === 'prod') {
    if (typeof window.showTab === 'function') await window.showTab('prod');
    return openCard(plan.card);
  }
  if (plan.type === 'tab') {
    if (typeof window.showTab === 'function') await window.showTab(plan.tab);
    return true;
  }
  return false;
}

async function attempt(startedAt) {
  const target = pending;
  if (!target) return;
  const retry = () => {
    if (Date.now() - startedAt > WAIT_MS) {
      pending = null;
      toast('Could not open that transaction. Open it from its tab.', 'warning');
      return;
    }
    timer = setTimeout(() => attempt(startedAt), RETRY_MS);
  };
  let rows = [];
  try { rows = ensureArray(await sqliteStore.get(target.k)); } catch (_) { rows = []; }
  if (!rows.length || typeof window.openStandaloneScreen !== 'function') { retry(); return; }
  const record = rows.find((r) => r && String(r.id) === target.id);
  pending = null;
  if (!record) { toast('That transaction is no longer available.', 'warning'); return; }
  const plan = resolveView(target, record);
  let opened = false;
  try { opened = plan ? await openView(plan) : false; } catch (_) { opened = false; }
  if (!opened) toast('Opened the list, but could not find that transaction.', 'warning');
}

export function openNotificationTarget(raw) {
  const target = parseTarget(raw);
  if (!target) return;
  pending = target;
  clearTimeout(timer);
  attempt(Date.now());
}

function listenNative(tries) {
  const plugins = (window.Capacitor && window.Capacitor.Plugins) || {};
  const LocalNotifications = plugins.LocalNotifications;
  if (LocalNotifications && typeof LocalNotifications.addListener === 'function') {
    LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      openNotificationTarget(event && event.notification && event.notification.extra);
    });
    return;
  }
  if (tries > 0) setTimeout(() => listenNative(tries - 1), RETRY_MS);
}

export function initNotificationOpen() {
  listenNative(20);
  if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.addEventListener) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'OPEN_NOTIFICATION_TARGET') openNotificationTarget(event.data.target);
    });
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const open = params.get('open');
    if (open) {
      params.delete('open');
      const query = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
      openNotificationTarget(open);
    }
  } catch (_) {}
}

if (typeof window !== 'undefined' && window.document) initNotificationOpen();
