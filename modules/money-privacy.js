const MONEY_RESTRICTED_MODES = new Set(['userrole']);

export function isMoneyRestricted(mode) {
  const m = mode === undefined ? (typeof window !== 'undefined' ? window.appMode : undefined) : mode;
  return MONEY_RESTRICTED_MODES.has(m);
}

export function scrubMoney(root) {
  const scope = root || (typeof document !== 'undefined' ? document : null);
  if (!scope || !scope.querySelectorAll) return;
  scope.querySelectorAll('[data-money]').forEach((el) => {
    if (el.children.length === 0 && el.textContent) el.textContent = '';
    else if (el.matches('.history-list, #all-stores-grid, #customers-table-body, #rep-customers-table-body')) el.replaceChildren();
  });
}

export function applyMoneyPrivacy(mode) {
  if (typeof document === 'undefined' || !document.documentElement) return false;
  const locked = isMoneyRestricted(mode);
  document.documentElement.toggleAttribute('data-money-locked', locked);
  if (locked) scrubMoney();
  return locked;
}

const RESTRICTED_SCREENS = new Set(['settings-screen', 'splash-screen', 'feedback-screen']);

export function isScreenAllowed(id, mode) {
  return !isMoneyRestricted(mode) || RESTRICTED_SCREENS.has(id);
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

if (typeof window !== 'undefined') window.isScreenAllowed = isScreenAllowed;
