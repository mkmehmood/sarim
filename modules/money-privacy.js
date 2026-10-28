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
