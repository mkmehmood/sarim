window._GOOGLE_CLIENT_ID = '124313576124-408rl178jlpua4qgcb25lb85hbautsda.apps.googleusercontent.com';
export let BRAND_LOGO_JPEG_BASE64 = '';
let _brandLogoPromise = null;
export function loadBrandLogo() {
  if (_brandLogoPromise) return _brandLogoPromise;
  _brandLogoPromise = fetch('brand-logo.jpg')
    .then(r => { if (!r.ok) throw new Error('logo http ' + r.status); return r.blob(); })
    .then(b => new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(b);
    }))
    .then(d => { BRAND_LOGO_JPEG_BASE64 = d; window.BRAND_LOGO_JPEG_BASE64 = d; })
    .catch(() => { _brandLogoPromise = null; });
  return _brandLogoPromise;
}
if (typeof window !== 'undefined' && typeof fetch === 'function') setTimeout(() => loadBrandLogo(), 3000);
export var entityListViewType;
export const APP_CONFIG = Object.freeze({
  CACHE_VERSION: 'V.29.09.2026',
  PBKDF2_ITERATIONS: 210000,
  PBKDF2_ITERATIONS_SHA256: 310000,
  CRYPTO_VERSION: 1,
  TOMBSTONE_EXPIRY_DAYS: 90,
  get TOMBSTONE_EXPIRY_MS() { return this.TOMBSTONE_EXPIRY_DAYS * 24 * 60 * 60 * 1000; },
  FIREBASE_INIT_RETRY_MAX:   5,
  FIREBASE_INIT_RETRY_DELAY: 2000,
  SYNC_RETRY_DELAY_MS:       2000,
  HEARTBEAT_INTERVAL_MS:     300000,
  TOMBSTONE_CLEANUP_INTERVAL_MS: 24 * 60 * 60 * 1000,
  OFFLINE_MAX_RETRIES:       10,
  OFFLINE_RETRY_DELAY_MS:    2000,
  OFFLINE_MAX_BACKOFF_MS:    30000,
  VISIBILITY_SYNC_COOLDOWN_MS: 5 * 60 * 1000,
  MIN_LISTENER_RECONNECT_MS:   30 * 1000,
});
window.BRAND_LOGO_JPEG_BASE64 = BRAND_LOGO_JPEG_BASE64;
window.entityListViewType = entityListViewType;
window.APP_CONFIG = APP_CONFIG;
