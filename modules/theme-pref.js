export const THEME_PREF_KEY = 'sarim_theme_pref';
export const THEME_PREFS = ['auto', 'light', 'dark'];

export function normalizePref(value) {
  return THEME_PREFS.includes(value) ? value : 'dark';
}

export function systemTheme() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch (_) {
    return 'dark';
  }
}

export function resolveTheme(pref) {
  const p = normalizePref(pref);
  return p === 'auto' ? systemTheme() : p;
}

export function nextPref(pref) {
  return THEME_PREFS[(THEME_PREFS.indexOf(normalizePref(pref)) + 1) % THEME_PREFS.length];
}

export function prefLabel(pref) {
  const p = normalizePref(pref);
  return p === 'auto' ? 'Auto' : p === 'light' ? 'Light' : 'Dark';
}

export function readStoredPref() {
  try {
    const v = localStorage.getItem(THEME_PREF_KEY);
    return THEME_PREFS.includes(v) ? v : null;
  } catch (_) {
    return null;
  }
}

export function writeStoredPref(pref) {
  try {
    localStorage.setItem(THEME_PREF_KEY, normalizePref(pref));
  } catch (_) {}
}
