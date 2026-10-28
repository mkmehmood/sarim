export const MONEY_MASK = '\u2022\u2022\u2022';

export function isTeamMode() {
  return typeof window !== 'undefined' && window.appMode === 'userrole';
}

export function isOwnRecord(rec) {
  const me = typeof window !== 'undefined' ? String(window._assignedManagerName || '').trim() : '';
  const by = rec && rec.createdBy ? String(rec.createdBy).trim() : '';
  return !!me && !!by && by === me;
}

export function hideMoney(rec) {
  return isTeamMode() && !isOwnRecord(rec);
}

export function anyHidden(records) {
  return isTeamMode() && (records || []).some((r) => !isOwnRecord(r));
}

export const maskIf = (hide, text) => (hide ? MONEY_MASK : text);
