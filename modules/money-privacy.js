const MONEY_RESTRICTED_MODES = new Set(['userrole']);

export function isMoneyRestricted(mode) {
  const m = mode === undefined ? (typeof window !== 'undefined' ? window.appMode : undefined) : mode;
  return MONEY_RESTRICTED_MODES.has(m);
}

function sessionTabs() {
  return typeof window !== 'undefined' && Array.isArray(window._userRoleAllowedTabs) ? window._userRoleAllowedTabs : [];
}

export function hasOwnRepAccess() {
  return sessionTabs().includes('rep');
}

export function hidesPaymentHistory(mode) {
  return isMoneyRestricted(mode) && sessionTabs().includes('payments');
}

export function scrubMoney(root) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope || !scope.querySelectorAll) return;
  const keepRep = hasOwnRepAccess();
  scope.querySelectorAll('[data-money]').forEach((el) => {
    if (keepRep && el.hasAttribute('data-money-rep')) return;
    if (el.children.length === 0 && el.textContent) el.textContent = '';
    else if (el.matches('.history-list, #all-stores-grid, #customers-table-body, #rep-customers-table-body')) el.replaceChildren();
  });
}

export function applyMoneyPrivacy(mode) {
  if (typeof document === 'undefined' || !document.documentElement) return false;
  const locked = isMoneyRestricted(mode);
  document.documentElement.toggleAttribute('data-money-locked', locked);
  const root = document.documentElement;
  if (locked && hasOwnRepAccess() && root.setAttribute) root.setAttribute('data-rep-own', '');
  else if (root.removeAttribute) root.removeAttribute('data-rep-own');
  if (locked) scrubMoney();
  return locked;
}

const RESTRICTED_SCREENS = new Set(['settings-screen', 'splash-screen', 'feedback-screen', 'recycle-bin-screen']);
const REP_OWN_SCREENS = new Set(['rep-customer-management-screen', 'rep-customer-edit-screen']);

export function isScreenAllowed(id, mode) {
  if (!isMoneyRestricted(mode) || RESTRICTED_SCREENS.has(id)) return true;
  return REP_OWN_SCREENS.has(id) && hasOwnRepAccess();
}

export function moneyLine(text) {
  return { money: true, text: String(text) };
}

export function redactMoney(full, safe) {
  return isMoneyRestricted() ? safe : full;
}

const keepLine = (restricted) => (item) => {
  if (item && typeof item === 'object' && item.money) return restricted ? null : item.text;
  return item;
};

export function sanitizeConfirmExtra(extra, mode) {
  const restricted = isMoneyRestricted(mode);
  const out = { ...(extra || {}) };
  ['lines', 'notes'].forEach((k) => {
    if (Array.isArray(out[k])) out[k] = out[k].map(keepLine(restricted)).filter((v) => v !== null && v !== undefined);
  });
  if (restricted && out.restrictedWarning !== undefined) out.warning = out.restrictedWarning;
  delete out.restrictedWarning;
  return out;
}

const RECYCLE_SCOPE = {
  prod: { filter: 'tab_production', collections: ['production'] },
  factory: { filter: 'tab_factory', collections: ['factory'] },
  sales: { filter: 'tab_sales', collections: ['sales'] },
  payments: { filter: 'tab_payments', collections: ['transactions', 'expenses'] },
};

const assignedTabs = () => {
  if (typeof window === 'undefined') return [];
  const t = window._userRoleAllowedTabs || window._assignedUserTabs;
  return Array.isArray(t) ? t : [];
};

export function recycleCollections(mode, tabs) {
  if (!isMoneyRestricted(mode)) return null;
  const out = new Set();
  (Array.isArray(tabs) ? tabs : assignedTabs()).forEach((t) => {
    const sc = RECYCLE_SCOPE[t];
    if (sc) sc.collections.forEach((c) => out.add(c));
  });
  return out;
}

export function recycleFilters(mode, tabs) {
  if (!isMoneyRestricted(mode)) return null;
  const out = new Set(['all']);
  (Array.isArray(tabs) ? tabs : assignedTabs()).forEach((t) => { if (RECYCLE_SCOPE[t]) out.add(RECYCLE_SCOPE[t].filter); });
  return out;
}

export function isRecycleRecordAllowed(rec, mode, tabs) {
  const allowed = recycleCollections(mode, tabs);
  if (!allowed) return true;
  const col = rec && (rec.collection || rec.recordType);
  return !!col && allowed.has(col);
}

export function recycleAmountText(text, mode) {
  if (!text) return null;
  if (!isMoneyRestricted(mode)) return text;
  return /^[\d.,\s-]+\s*(kg|units?)$/i.test(String(text).trim()) ? text : null;
}

if (typeof window !== 'undefined') {
  window.isScreenAllowed = isScreenAllowed;
  window.isRecycleRecordAllowed = isRecycleRecordAllowed;
}
