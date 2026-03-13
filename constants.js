// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE SIGN-IN SETUP
// Set this to your Firebase project's OAuth 2.0 Web Client ID.
// Find it in: Firebase Console → Project Settings → General → Your apps
//   → Web app → OAuth 2.0 Client ID
//   OR Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs
//
// Format: XXXXXXXXXX-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.apps.googleusercontent.com
// ─────────────────────────────────────────────────────────────────────────────
window._GOOGLE_CLIENT_ID = '124313576124-408rl178jlpua4qgcb25lb85hbautsda.apps.googleusercontent.com';

const APP_CONFIG = Object.freeze({
  CACHE_VERSION: 'naswar-dealer-v13',
  // PBKDF2 iteration counts — OWASP 2023 recommendation for PBKDF2-HMAC-SHA-512
  PBKDF2_ITERATIONS: 210000,
  PBKDF2_ITERATIONS_SHA256: 310000,
  PBKDF2_ITERATIONS_LEGACY: 100000,
  PBKDF2_ITERATIONS_V1: 10000,
  // Crypto version tags — increment when changing key derivation parameters
  CRYPTO_VERSION: 4,
  IDB_CRYPTO_VERSION: 4,
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
});
