async function checkAuthState() {
scheduleAutoBackup();
}
function createAuthOverlay() {
const existing = document.getElementById('auth-overlay');
if (existing) existing.remove();
const overlay = document.createElement('div');
overlay.id = 'auth-overlay';
overlay.style.cssText = `
position: fixed; inset: 0;
background: linear-gradient(135deg, rgba(240, 248, 255, 0.95) 0%, rgba(230, 240, 255, 0.95) 100%);
z-index: 99999; display: flex; align-items: center; justify-content: center;
`;
if (document.body.classList.contains('dark-mode')) {
overlay.style.background = 'linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(30, 41, 59, 0.98) 100%)';
}
overlay.innerHTML = `
<div class="liquid-card" style="max-width: 400px; width: 90%; padding: 40px 30px; text-align: center; border: 1px solid var(--glass-border); box-shadow: 0 20px 50px rgba(37, 99, 235, 0.15); position: relative;">
<h2 class="shimmer-text" style="font-family: 'Bricolage Grotesque', system-ui, sans-serif; font-size: 2rem; margin: 0 0 6px 0; letter-spacing: -0.03em; font-weight: 800;">
GULL AND ZUBAIR NASWAR DEALER'S
</h2>
<div style="display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:20px;">
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1de9b6" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
<span style="font-size:0.7rem;color:var(--accent);font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">Login Required</span>
</div>
<p style="color: var(--text-muted); margin-bottom: 26px; font-size: 0.82rem; line-height: 1.5;">
Your account protects your data with enterprise-grade encryption.<br><strong style="color:var(--text-main)"></strong>.
</p>
<form id="auth-form" style="display: flex; flex-direction: column; gap: 13px;">
<input type="email" id="auth-email" placeholder="Email Address" required autocomplete="username"
style="width: 100%; padding: 13px; background: var(--input-bg); border: 1px solid var(--glass-border); border-radius: 12px; box-sizing: border-box; color: var(--text-main); font-size:0.9rem;">
<input type="password" id="auth-password" placeholder="Password" required autocomplete="current-password"
style="width: 100%; padding: 13px; background: var(--input-bg); border: 1px solid var(--glass-border); border-radius: 12px; box-sizing: border-box; color: var(--text-main); font-size:0.9rem;">
<div style="display: flex; gap: 10px; margin-top: 8px;">
<button type="submit" class="btn btn-main" style="
flex: 1; padding: 13px; font-size: 1rem; border-radius: 12px;
background-color: #1de9b6 !important;
background-image: none !important;
color: #003d2e !important;
font-weight:700;
">
Sign In
</button>
<button type="button" id="auth-signup-btn" class="btn" style="flex: 1; padding: 13px; font-size: 1rem; border-radius: 12px; background: var(--input-bg); border: 1px solid var(--glass-border); color: var(--text-main);">
Sign Up
</button>
</div>
</form>
<div id="auth-message" style="font-size: 0.8rem; margin-top: 15px; min-height: 20px;"></div>
<div style="margin-top:18px;padding:10px 14px;background:var(--input-bg);border-radius:10px;border:1px solid var(--glass-border);">
<div style="font-size:0.65rem;color:var(--text-muted);line-height:1.6;">
<strong style="color:var(--text-main)">AES-256-GCM</strong> encrypted backups &nbsp;·&nbsp;
<strong style="color:var(--text-main)"></strong> &nbsp;·&nbsp;
<strong style="color:var(--text-main)"></strong>
</div>
</div>
</div>
`;
document.body.appendChild(overlay);
const form = document.getElementById('auth-form');
if(form) form.addEventListener('submit', handleSignIn);
const signupBtn = document.getElementById('auth-signup-btn');
if(signupBtn) signupBtn.addEventListener('click', (e) => {
e.preventDefault();
handleSignUp();
});
OfflineAuth.getSavedEmail().then(email => {
if (email) {
const emailInput = document.getElementById('auth-email');
if (emailInput) { emailInput.value = email; }
}
}).catch(() => {});
}
function showAuthOverlay() {
let overlay = document.getElementById('auth-overlay');
if (!overlay) {
createAuthOverlay();
} else {
overlay.style.display = 'flex';
}
document.body.style.overflow = 'hidden';
}
function hideAuthOverlay() {
if (!currentUser) return;
const overlay = document.getElementById('auth-overlay');
if (overlay) {
overlay.style.display = 'none';
}
document.body.style.overflow = '';
}
const LoginRateLimiter = (() => {
const KEY_ATTEMPTS = '_gznd_login_attempts';
const KEY_LOCKOUT  = '_gznd_login_lockout';
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000;
const BACKOFF_BASE = 1000;
function getAttempts() {
try { return parseInt(sessionStorage.getItem(KEY_ATTEMPTS) || '0', 10); } catch(e) { return 0; }
}
function setAttempts(n) {
try { sessionStorage.setItem(KEY_ATTEMPTS, String(n)); } catch(e) {}
}
function getLockoutUntil() {
try { return parseInt(sessionStorage.getItem(KEY_LOCKOUT) || '0', 10); } catch(e) { return 0; }
}
function setLockoutUntil(ts) {
try { sessionStorage.setItem(KEY_LOCKOUT, String(ts)); } catch(e) {}
}
return {
isLockedOut() {
const until = getLockoutUntil();
return until > Date.now();
},
lockoutRemainingMs() {
return Math.max(0, getLockoutUntil() - Date.now());
},
attempts() { return getAttempts(); },
backoffMs() {
const n = getAttempts();
return n > 0 ? Math.min(BACKOFF_BASE * Math.pow(2, n - 1), 8000) : 0;
},
recordFailure() {
const n = getAttempts() + 1;
setAttempts(n);
if (n >= MAX_ATTEMPTS) { setLockoutUntil(Date.now() + LOCKOUT_DURATION); }
},
recordSuccess() {
try { sessionStorage.removeItem(KEY_ATTEMPTS); sessionStorage.removeItem(KEY_LOCKOUT); } catch(e) {}
},
};
})();
async function handleSignIn(e) {
if(e) e.preventDefault();
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const messageDiv = document.getElementById('auth-message');
if (!emailInput || !passwordInput || !messageDiv) return;
const email = emailInput.value.trim();
const password = passwordInput.value;
if (!email || !password) {
messageDiv.textContent = 'Please enter both email and password';
messageDiv.style.color = 'var(--warning)';
return;
}
if (LoginRateLimiter.isLockedOut()) {
const remainSec = Math.ceil(LoginRateLimiter.lockoutRemainingMs() / 1000);
const mins = Math.floor(remainSec / 60);
const secs = String(remainSec % 60).padStart(2,'0');
messageDiv.textContent = `Too many failed attempts. Try again in ${mins}m ${secs}s.`;
messageDiv.style.color = 'var(--danger)';
return;
}
const _loginBackoff = LoginRateLimiter.backoffMs();
if (_loginBackoff > 0) {
const _submitBtn = document.querySelector('#auth-form button[type="submit"]');
if (_submitBtn) _submitBtn.disabled = true;
messageDiv.textContent = `Too many attempts — waiting ${Math.round(_loginBackoff/1000)}s…`;
messageDiv.style.color = 'var(--warning)';
await new Promise(r => setTimeout(r, _loginBackoff));
if (_submitBtn) _submitBtn.disabled = false;
if (LoginRateLimiter.isLockedOut()) {
const remainSec2 = Math.ceil(LoginRateLimiter.lockoutRemainingMs() / 1000);
const mins2 = Math.floor(remainSec2 / 60);
const secs2 = String(remainSec2 % 60).padStart(2,'0');
messageDiv.textContent = `Too many failed attempts. Try again in ${mins2}m ${secs2}s.`;
messageDiv.style.color = 'var(--danger)';
return;
}
}
messageDiv.textContent = 'Verifying credentials...';
messageDiv.style.color = 'var(--accent)';
if (typeof firebase !== 'undefined' && !firebase.apps.length) {
try { firebase.initializeApp(firebaseConfig); } catch(initErr) { console.warn('Firebase init on sign-in:', initErr); }
}
if (!auth && typeof firebase !== 'undefined' && firebase.apps.length) {
try {
auth = firebase.auth();
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
} catch(authInitErr) { console.warn('Auth init on sign-in:', authInitErr); }
}
try {
if (typeof firebase !== 'undefined' && firebase.apps.length && navigator.onLine) {
const firebaseAuth = auth || firebase.auth();
const _signInCred = await firebaseAuth.signInWithEmailAndPassword(email, password);
await OfflineAuth.saveCredentials(email, password);
idb.setUserPrefix(_signInCred.user.uid);
await IDBCrypto.setSessionKey(email, password);
try { sessionStorage.setItem('_gznd_session_active', '1'); } catch(e) {}
LoginRateLimiter.recordSuccess();
messageDiv.textContent = 'Success! Loading...';
messageDiv.style.color = 'var(--accent-emerald)';
setTimeout(() => {
hideAuthOverlay();
if(typeof performOneClickSync === 'function') performOneClickSync();
}, 1000);
} else {
const hasStored = await OfflineAuth.hasStoredCredentials();
if (!hasStored) {
messageDiv.textContent = 'No offline account found. Please connect to internet for first-time login.';
messageDiv.style.color = 'var(--danger)';
return;
}
const valid = await OfflineAuth.verifyCredentials(email, password);
if (!valid) {
messageDiv.textContent = 'Incorrect email or password.';
messageDiv.style.color = 'var(--danger)';
return;
}
currentUser = {
id: email.replace(/[^a-zA-Z0-9]/g, '_'),
uid: email.replace(/[^a-zA-Z0-9]/g, '_'),
email: email,
offlineMode: true
};
idb.setUserPrefix(currentUser.uid);
await IDBCrypto.setSessionKey(email, password);
try { sessionStorage.setItem('_gznd_session_active', '1'); } catch(e) {}
LoginRateLimiter.recordSuccess();
messageDiv.textContent = '✓ Offline Login Successful';
messageDiv.style.color = 'var(--accent-emerald)';
setTimeout(() => {
if (currentUser) {
const overlay = document.getElementById('auth-overlay');
if (overlay) { overlay.style.display = 'none'; }
document.body.style.overflow = '';
}
}, 1000);
}
} catch (error) {
console.error('Sign in failed.', error);
let errorMessage = 'Sign in failed. ';
if (error.code === 'auth/invalid-email') errorMessage = 'Invalid email address.';
else if (error.code === 'auth/user-disabled') errorMessage = 'Account disabled.';
else if (error.code === 'auth/user-not-found') errorMessage = 'No account found.';
else if (error.code === 'auth/wrong-password') errorMessage = 'Incorrect password.';
else if (error.code === 'auth/network-request-failed') {
const valid = await OfflineAuth.verifyCredentials(email, password).catch(() => false);
if (valid) {
currentUser = { id: email.replace(/[^a-zA-Z0-9]/g, '_'), uid: email.replace(/[^a-zA-Z0-9]/g, '_'), email, offlineMode: true };
idb.setUserPrefix(currentUser.uid);
await IDBCrypto.setSessionKey(email, password);
try { sessionStorage.setItem('_gznd_session_active', '1'); } catch(e) {}
messageDiv.textContent = '✓ Offline Login (Network unavailable)';
messageDiv.style.color = 'var(--accent-emerald)';
setTimeout(() => { if(currentUser){const o=document.getElementById('auth-overlay');if(o)o.style.display='none';document.body.style.overflow='';} }, 1000);
return;
}
errorMessage = 'Network error. If you have logged in before, ensure correct credentials for offline access.';
}
else errorMessage += (error.message || '');
LoginRateLimiter.recordFailure();
if (LoginRateLimiter.isLockedOut()) {
const remainSec = Math.ceil(LoginRateLimiter.lockoutRemainingMs() / 1000);
const mins = Math.floor(remainSec / 60);
const secs = String(remainSec % 60).padStart(2,'0');
errorMessage = `Too many failed attempts. Account temporarily locked. Try again in ${mins}m ${secs}s.`;
}
messageDiv.textContent = errorMessage;
messageDiv.style.color = 'var(--danger)';
}
}
async function handleSignUp() {
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const messageDiv = document.getElementById('auth-message');
if (!emailInput || !passwordInput || !messageDiv) return;
const email = emailInput.value.trim();
const password = passwordInput.value;
if (!email || !password) {
messageDiv.textContent = 'Please enter email and password';
messageDiv.style.color = 'var(--danger)';
return;
}
if (password.length < 8) {
messageDiv.textContent = 'Password must be at least 8 characters';
messageDiv.style.color = 'var(--danger)';
return;
}
messageDiv.textContent = 'Creating account...';
messageDiv.style.color = 'var(--accent)';
try {
if (typeof firebase !== 'undefined' && firebase.auth) {
const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
currentUser = {
id: userCredential.user.uid,
uid: userCredential.user.uid,
email: userCredential.user.email,
displayName: userCredential.user.displayName
};
await OfflineAuth.saveCredentials(email, password);
idb.setUserPrefix(currentUser.uid);
await IDBCrypto.setSessionKey(email, password);
try { sessionStorage.setItem('_gznd_session_active', '1'); } catch(e) {}
if (database) {
await firebaseDB.collection('users').doc(currentUser.uid).set({
email: email,
createdAt: Date.now(),
role: 'admin'
});
}
messageDiv.textContent = 'Account created successfully!';
messageDiv.style.color = 'var(--accent-emerald)';
setTimeout(() => {
hideAuthOverlay();
performOneClickSync();
}, 1500);
} else {
messageDiv.textContent = 'Internet required to create a new account.';
messageDiv.style.color = 'var(--danger)';
}
} catch (error) {
console.error('Sign up failed.', error);
let errorMessage = 'Sign up failed. ';
if (error.code === 'auth/email-already-in-use') errorMessage += 'Email already registered.';
else if (error.code === 'auth/invalid-email') errorMessage += 'Invalid email address.';
else if (error.code === 'auth/weak-password') errorMessage += 'Password too weak (min 8 chars).';
else errorMessage += error.message || 'Try again.';
messageDiv.textContent = '' + errorMessage;
messageDiv.style.color = 'var(--danger)';
}
}
async function signOut() {
try {
stopDatabaseHeartbeat();
clearAutoBackup();
if (typeof OfflineQueue !== 'undefined') OfflineQueue.cancelRetry();
if (window._fbOfflineHandler) { window.removeEventListener('offline', window._fbOfflineHandler); window._fbOfflineHandler = null; }
if (window._fbVisibilityHandler) { document.removeEventListener('visibilitychange', window._fbVisibilityHandler); window._fbVisibilityHandler = null; }
window._firebaseListenersRegistered = false;
if (seamlessBackupTimer) { clearTimeout(seamlessBackupTimer); seamlessBackupTimer = null; }
if (socketReconnectTimer) { clearTimeout(socketReconnectTimer); socketReconnectTimer = null; }
if (listenerReconnectTimer) { clearTimeout(listenerReconnectTimer); listenerReconnectTimer = null; }
if (autoSyncTimeout) { clearTimeout(autoSyncTimeout); autoSyncTimeout = null; }
if (window._connectionCheckInterval) { clearInterval(window._connectionCheckInterval); window._connectionCheckInterval = null; }
if (window._syncUpdatesCleanupInterval) { clearInterval(window._syncUpdatesCleanupInterval); window._syncUpdatesCleanupInterval = null; }
if (window._tombstoneCleanupInterval) { clearInterval(window._tombstoneCleanupInterval); window._tombstoneCleanupInterval = null; }
if (window._perfMonitorInterval) { clearInterval(window._perfMonitorInterval); window._perfMonitorInterval = null; }
if (typeof syncState !== 'undefined' && syncState.syncInterval) { clearInterval(syncState.syncInterval); syncState.syncInterval = null; }
if (auth) {
await auth.signOut();
currentUser = null;
IDBCrypto.clearSessionKey();
idb.clearUserPrefix();
try { sessionStorage.removeItem('_gznd_session_active'); } catch(e) {}
DeltaSync.clearAllTimestamps().catch(e => console.warn("[DeltaSync] clearAllTimestamps on signout:", e));
showToast(' Signed out successfully', 'success');
} else {
currentUser = null;
IDBCrypto.clearSessionKey();
idb.clearUserPrefix();
try { sessionStorage.removeItem('_gznd_session_active'); } catch(e) {}
DeltaSync.clearAllTimestamps().catch(e => console.warn("[DeltaSync] clearAllTimestamps on signout:", e));
showToast(' Signed out', 'success');
}
setTimeout(() => {
createAuthOverlay();
showAuthOverlay();
}, 500);
} catch (error) {
showToast(' Error signing out', 'danger');
}
}
function updateSyncButton() {
const syncBtn = document.getElementById('sync-btn');
if (!syncBtn) return;
if (!currentUser) {
syncBtn.innerHTML = ' LOGIN TO SYNC';
syncBtn.onclick = () => {
closeDataMenu();
showAuthOverlay();
};
syncBtn.style.removeProperty('background');
syncBtn.style.setProperty('background-color', '#ff9f0a', 'important');
syncBtn.style.setProperty('background-image', 'linear-gradient(135deg, #ff9f0a 0%, #ff375f 100%)', 'important');
syncBtn.style.color = '#fff';
} else {
syncBtn.innerHTML = ' SYNC DATA';
syncBtn.onclick = () => {
performOneClickSync();
};
syncBtn.style.removeProperty('background');
syncBtn.style.setProperty('background-color', '#2563eb', 'important');
syncBtn.style.setProperty('background-image', 'linear-gradient(135deg, #2563eb 0%, #059669 100%)', 'important');
syncBtn.style.color = '#fff';
}
}
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', updateSyncButton);
} else {
updateSyncButton();
}
function addSignOutButton() {
removeSignOutButton();
const systemControls = document.querySelector('.system-controls');
if (systemControls && currentUser) {
const btnContainer = systemControls.querySelector('div');
if (btnContainer) {
const signOutBtn = document.createElement('button');
}
}
}
function removeSignOutButton() {
const btn = document.getElementById('cloud-signout-btn');
if (btn) btn.remove();
}
function handleReturnQtyInput() {
const retQty = parseFloat(document.getElementById('returnedQuantity').value) || 0;
const section = document.getElementById('returnStoreSection');
if (retQty > 0) {
section.classList.remove('hidden');
} else {
section.classList.add('hidden');
}
if (typeof calculateSales === 'function') calculateSales();
}
function handleTripleTap(el, targetTab) {
const now = Date.now();
const TAP_WINDOW = 600;
if (!el._tapTimes) el._tapTimes = [];
el._tapTimes.push(now);
el._tapTimes = el._tapTimes.filter(t => now - t < TAP_WINDOW);
if (el._tapTimes.length >= 3) {
el._tapTimes = [];
showTab(targetTab);
}
}
async function saveTransaction() {
const seller = document.getElementById('sellerSelect').value;
const date = document.getElementById('sale-date').value;
const sold = parseFloat(document.getElementById('totalSold').value) || 0;
const ret = parseFloat(document.getElementById('returnedQuantity').value) || 0;
const cred = parseFloat(document.getElementById('creditSales').value) || 0;
const prev = parseFloat(document.getElementById('prevCreditReceived').value) || 0;
const rec = parseFloat(document.getElementById('receivedCash').value) || 0;
let selectedStore = null;
if (ret > 0) {
if (!window._returnStore) {
showToast('Please select a store (ZUBAIR or MAHMOOD) for the returned stock!', 'warning', 3000);
return;
}
selectedStore = { value: window._returnStore };
}
const costPerKg = getCostPriceForStore('STORE_A') || 0; 
const salePrice = getSalePriceForStore('STORE_A'); 
if(!date) return showToast('Please select a date', 'warning', 3000);
if(salePrice <= 0) return showToast('Please set a sale price in Factory Formulas first', 'warning', 3000);
if(ret > sold) return showToast('Returned quantity cannot exceed total sold', 'warning', 3000);
const netSold = Math.max(0, sold - ret);
const cashQty = Math.max(0, netSold - cred);
const creditValue = cred * salePrice;
const revenue = netSold * salePrice;
const totalCost = netSold * costPerKg;
const profit = revenue - totalCost;
const totalExpected = (cashQty * salePrice) + prev;
const diff = rec - totalExpected;
let statusText = "PERFECT MATCH ";
let statusClass = "result-box discrepancy-ok";
if (Math.abs(diff) > 0.01) {
if (diff < 0) {
statusText = `SHORT: ${safeNumber(Math.abs(diff), 0).toFixed(2)}`;
statusClass = "result-box discrepancy-alert";
} else {
statusText = `OVER: ${safeNumber(diff, 0).toFixed(2)}`;
statusClass = "result-box discrepancy-ok";
}
}
if (ret > 0 && selectedStore) {
await processReturnToProduction(selectedStore.value, ret, date, seller);
}
let calcId = generateUUID('calc');
if (!validateUUID(calcId)) {
calcId = generateUUID('calc');
}
const calcCreatedAt = getTimestamp();
let entry = {
id: calcId,
seller: seller,
date: date,
createdAt: calcCreatedAt,
updatedAt: calcCreatedAt,
timestamp: calcCreatedAt,
unitPrice: Number(safeNumber(salePrice, 0).toFixed(2)),
costPrice: Number(safeNumber(costPerKg, 0).toFixed(2)),
revenue: Number(safeNumber(revenue, 0).toFixed(2)),
profit: Number(safeNumber(profit, 0).toFixed(2)),
totalCost: Number(safeNumber(totalCost, 0).toFixed(2)),
totalSold: Number(safeNumber(sold, 0).toFixed(2)),
returned: Number(safeNumber(ret, 0).toFixed(2)),
returnStore: selectedStore ? selectedStore.value : null,
creditQty: Number(safeNumber(cred, 0).toFixed(2)),
cashQty: Number(safeNumber(cashQty, 0).toFixed(2)),
creditValue: Number(safeNumber(creditValue, 0).toFixed(2)),
prevColl: Number(safeNumber(prev, 0).toFixed(2)),
totalExpected: Number(safeNumber(totalExpected, 0).toFixed(2)),
received: Number(safeNumber(rec, 0).toFixed(2)),
statusText: statusText,
statusClass: statusClass,
linkedSalesIds: [],
linkedRepSalesIds: [],
syncedAt: new Date().toISOString()
};
entry = ensureRecordIntegrity(entry, false);
const linkedIds = await markSalesEntriesAsReceived(seller, sold);
entry.linkedSalesIds = linkedIds;
const linkedRepIds = await markRepSalesEntriesAsUsed(seller, date, calcId);
entry.linkedRepSalesIds = linkedRepIds;
try {
let history = await idb.get('noman_history', []);
if (!Array.isArray(history)) history = [];
history.push(entry);
await unifiedSave('noman_history', history, entry);
notifyDataChange('calculator');
emitSyncUpdate({ noman_history: history });
if (Array.isArray(salesHistory)) {
salesHistory.push(entry);
}
document.getElementById('totalSold').value = '';
document.getElementById('returnedQuantity').value = '';
document.getElementById('creditSales').value = '';
document.getElementById('prevCreditReceived').value = '';
document.getElementById('receivedCash').value = '';
document.getElementById('returnStoreSection').classList.add('hidden');
showToast(`Transaction saved! ${linkedIds.length} sales entries reconciled.`, 'success');
await loadSalesData(currentCompMode);
if (typeof refreshCustomerSales === 'function') await refreshCustomerSales(1, true);
if (entry.returned > 0 && entry.returnStore) {
if (typeof refreshUI === 'function') await refreshUI();
}
} catch (error) {
showToast('Failed to save transaction. Please try again.', 'error', 4000);
}
}
async function exportCustomerData(type) {
showToast("Generating PDF...", "info");
try {
if (!window.jspdf) {
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js');
}
if (!window.jspdf || !window.jspdf.jsPDF) {
throw new Error("Failed to load PDF library. Please refresh and try again.");
}
const fileName = type === 'rep' ? "My_Customer_List.pdf" : "All_Customers_List.pdf";
const customerMap = new Map();
const initCust = (name) => ({ name, phone:"N/A", address:"N/A", debt:0, paid:0, qty:0, lastDate:"", lastType:"" });
const salesData = type === 'rep' ? repSales : customerSales;
let hasMergedEntries = false;
salesData.forEach(sale => {
if (type === 'rep' && (sale.salesRep !== currentRepProfile)) return;
if (type === 'admin' && (sale.isRepModeEntry === true || (sale.salesRep && sale.salesRep !== 'NONE'))) return;
const name = sale.customerName;
if (!name) return;
if (!customerMap.has(name)) customerMap.set(name, initCust(name));
const cust = customerMap.get(name);
if (sale.customerPhone) cust.phone = sale.customerPhone;
if (sale.customerAddress) cust.address = sale.customerAddress;
if (sale.isMerged === true) {
  hasMergedEntries = true;
  const ms = sale.mergedSummary || {};
  const net = ms.netOutstanding != null ? ms.netOutstanding : (sale.totalValue || 0);
  const cash = ms.cashSales || 0;
  cust.debt += (net + cash);
  cust.paid += cash;
  cust.qty  += (sale.quantity || 0);
  if (sale.date > cust.lastDate) { cust.lastDate = sale.date; cust.lastType = 'MERGED'; }
  return;
}
const sp = sale.totalValue && sale.quantity && sale.quantity > 0 && !['COLLECTION','PARTIAL_PAYMENT'].includes(sale.paymentType)
? sale.totalValue / sale.quantity
: (sale.supplyStore === 'STORE_C' ? (factorySalePrices?.asaan||0) : (factorySalePrices?.standard||0));
if (sale.paymentType === 'CREDIT' && !sale.creditReceived) {
const val = sale.totalValue || (sale.quantity||0) * sp;
cust.debt += val;
cust.paid += parseFloat(sale.partialPaymentReceived) || 0;
cust.qty += (sale.quantity || 0);
} else if (sale.paymentType === 'CASH') {
const val = sale.totalValue || (sale.quantity||0) * sp;
cust.debt += val; cust.paid += val; cust.qty += (sale.quantity || 0);
} else if (sale.paymentType === 'CREDIT' && sale.creditReceived) {
const val = sale.totalValue || (sale.quantity||0) * sp;
cust.debt += val; cust.paid += val; cust.qty += (sale.quantity || 0);
} else if (sale.paymentType === 'COLLECTION') {
cust.paid += (sale.totalValue || 0);
} else if (sale.paymentType === 'PARTIAL_PAYMENT') {
cust.paid += (sale.totalValue || 0);
}
if (sale.date > cust.lastDate) { cust.lastDate = sale.date; cust.lastType = sale.paymentType; }
});
if (type === 'admin') {
paymentEntities.forEach(entity => {
const entityTxs = paymentTransactions.filter(t => String(t.entityId) === String(entity.id));
const hasIN = entityTxs.some(t => t.type === 'IN');
const hasOUT = entityTxs.some(t => t.type === 'OUT');
const isDerivedPayor = hasIN && !hasOUT;
if (!isDerivedPayor) return;
if (!customerMap.has(entity.name)) {
const nc = initCust(entity.name);
nc.phone = entity.phone || "N/A";
nc.address = entity.address || "N/A";
customerMap.set(entity.name, nc);
} else {
const ex = customerMap.get(entity.name);
if (ex.phone === "N/A" && entity.phone) ex.phone = entity.phone;
if (ex.address === "N/A" && entity.address) ex.address = entity.address;
}
});
}
if (customerMap.size === 0) { showToast("No customers found to export.", "warning"); return; }
const { jsPDF } = window.jspdf;
const doc = new jsPDF('l', 'mm', 'a4');
const pageW = doc.internal.pageSize.getWidth();
const pageH = doc.internal.pageSize.getHeight();
const hdrColor = [40, 167, 69];
doc.setFillColor(...hdrColor);
doc.rect(0, 0, pageW, 22, 'F');
doc.setFontSize(16); doc.setFont(undefined,'bold'); doc.setTextColor(255,255,255);
doc.text('GULL AND ZUBAIR NASWAR DEALERS', pageW/2, 10, { align:'center' });
doc.setFontSize(9); doc.setFont(undefined,'normal');
doc.text('Naswar Manufacturers & Dealers', pageW/2, 17, { align:'center' });
doc.setFontSize(12); doc.setFont(undefined,'bold'); doc.setTextColor(50,50,50);
const titleText = type === 'rep' ? `My Customers — ${currentRepProfile || ''}` : 'All Customers — Complete List';
doc.text(titleText, pageW/2, 30, { align:'center' });
doc.setFontSize(8.5); doc.setFont(undefined,'normal'); doc.setTextColor(100,100,100);
doc.text(`Generated: ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})} at ${new Date().toLocaleTimeString('en-US')}`, pageW/2, 36, { align:'center' });
doc.setDrawColor(...hdrColor); doc.setLineWidth(0.5);
doc.line(14, 39, pageW - 14, 39);
const customerRows = [];
let totDebt = 0, totPaid = 0, totQty = 0, totNet = 0;
let cntDebtors = 0, cntSettled = 0;
const sortedCustomers = [...customerMap.values()].sort((a,b) => (b.debt - b.paid) - (a.debt - a.paid));
sortedCustomers.forEach(cust => {
const net = cust.debt - cust.paid;
totDebt += cust.debt; totPaid += cust.paid; totQty += cust.qty; totNet += net;
if (net > 0.01) cntDebtors++; else cntSettled++;
customerRows.push([
cust.name,
cust.phone,
cust.address.substring(0, 35),
cust.debt > 0 ? 'Rs ' + safeToFixed(cust.debt, 2) : '-',
cust.paid > 0 ? 'Rs ' + safeToFixed(cust.paid, 2) : '-',
Math.abs(net) < 0.01 ? 'SETTLED'
: (net > 0 ? 'Rs ' + safeToFixed(net, 2) : 'OVERPAID\nRs ' + safeToFixed(Math.abs(net), 2)),
safeToFixed(cust.qty, 2),
formatDisplayDate(cust.lastDate) || '-'
]);
});
customerRows.push([
'TOTAL (' + customerMap.size + ' customers)',
'', '',
'Rs ' + safeToFixed(totDebt, 2),
'Rs ' + safeToFixed(totPaid, 2),
'Rs ' + safeToFixed(Math.abs(totNet), 2) + (totNet > 0 ? '\n(DUE)' : totNet < 0 ? '\n(OVERPAID)' : '\nSETTLED'),
safeToFixed(totQty, 2),
''
]);
doc.autoTable({
startY: 43,
head: [['Customer Name', 'Phone', 'Address', 'Total Debit', 'Total Credit', 'Net Balance', 'Qty (kg)', 'Last Sale']],
body: customerRows,
theme: 'grid',
headStyles: { fillColor: hdrColor, textColor: 255, fontSize: 8.5, fontStyle:'bold', halign:'center' },
styles: { fontSize: 7.5, cellPadding: 2, lineWidth: 0.15, lineColor:[180,180,180], overflow:'linebreak' },
columnStyles: {
0: { cellWidth: 42 },
1: { cellWidth: 26, halign:'center' },
2: { cellWidth: 44 },
3: { cellWidth: 26, halign:'right', textColor:[220,53,69], fontStyle:'bold' },
4: { cellWidth: 26, halign:'right', textColor:[40,167,69], fontStyle:'bold' },
5: { cellWidth: 30, halign:'center', fontStyle:'bold' },
6: { cellWidth: 20, halign:'right' },
7: { cellWidth: 22, halign:'center' }
},
didParseCell: function(data) {
const isTotal = data.row.index === customerRows.length - 1;
if (isTotal) {
data.cell.styles.fontStyle = 'bold';
data.cell.styles.fillColor = [235, 255, 235];
data.cell.styles.fontSize = 8.5;
}
if (data.column.index === 5 && !isTotal) {
const txt = (data.cell.text || []).join('');
if (txt === 'SETTLED') data.cell.styles.textColor = [100,100,100];
else if (txt.includes('OVERPAID')) data.cell.styles.textColor = [40,167,69];
else data.cell.styles.textColor = [220,53,69];
}
},
margin: { left: 14, right: 14 }
});
const afterY = doc.lastAutoTable.finalY + 6;
if (afterY < pageH - 25) {
doc.setFontSize(8); doc.setFont(undefined,'normal'); doc.setTextColor(100,100,100);
doc.text(`Customers with outstanding debt: ${cntDebtors} | Settled accounts: ${cntSettled} | Total outstanding: Rs ${safeToFixed(Math.max(totNet, 0), 2)}`, 14, afterY);
if (hasMergedEntries) {
  const noteY = afterY + 6;
  if (noteY < pageH - 12) {
    doc.setFillColor(245, 235, 255);
    doc.roundedRect(14, noteY, pageW - 28, 9, 1.5, 1.5, 'F');
    doc.setFontSize(7.5); doc.setFont(undefined,'bold'); doc.setTextColor(126, 34, 206);
    doc.text('\u2605 Balances include year-end opening balance records (MERGED) from Close Financial Year — these represent carried-forward net positions.', 18, noteY + 6);
    doc.setFont(undefined,'normal'); doc.setTextColor(80,80,80);
  }
}
}
const pageCount = doc.internal.getNumberOfPages();
for (let i = 1; i <= pageCount; i++) {
doc.setPage(i);
doc.setFontSize(7); doc.setTextColor(160);
doc.text(
`Generated on ${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})} at ${new Date().toLocaleTimeString('en-US')} | GULL AND ZUBAIR NASWAR DEALERS`,
pageW/2, pageH - 5, { align:'center' }
);
doc.text(`Page ${i} of ${pageCount}`, pageW/2, pageH - 9, { align:'center' });
}
doc.save(fileName);
showToast(`Exported ${customerMap.size} customers successfully!`, "success");
} catch (error) {
showToast('Error generating PDF: ' + error.message, 'error');
}
}
async function markSalesEntriesAsReceived(seller, quantityToMark) {
if (!seller || seller === 'COMBINED' || quantityToMark <= 0) return [];
const linkedIds = [];
let remainingQty = quantityToMark;
const pendingSales = customerSales
.filter(sale =>
sale.salesRep === seller &&
sale.paymentType === 'CREDIT' &&
!sale.creditReceived
)
.sort((a, b) => a.timestamp - b.timestamp);
for (const sale of pendingSales) {
if (remainingQty <= 0) break;
if (sale.quantity <= remainingQty) {
sale.creditReceived = true;
sale.creditReceivedDate = new Date().toISOString().split('T')[0];
sale.creditReceivedTime = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
sale.paymentType = 'CASH';
linkedIds.push(sale.id);
remainingQty -= sale.quantity;
} else {
break;
}
}
if (linkedIds.length > 0) {
await saveWithTracking('customer_sales', customerSales);
const modifiedSales = customerSales.filter(s => linkedIds.includes(s.id));
for (const sale of modifiedSales) {
await saveRecordToFirestore('customer_sales', sale);
}
if (typeof refreshCustomerSales === 'function') {
refreshCustomerSales(1, true);
}
}
return linkedIds;
}
async function markRepSalesEntriesAsUsed(seller, date, calcId) {
if (!seller || seller === 'COMBINED' || !date || !calcId) return [];
const linkedRepIds = [];
repSales.forEach(sale => {
if (
sale.salesRep === seller &&
sale.date === date &&
!sale.usedInCalcId &&
(sale.paymentType === 'CREDIT' || sale.paymentType === 'COLLECTION')
) {
sale.usedInCalcId = calcId;
sale.updatedAt = getTimestamp();
linkedRepIds.push(sale.id);
}
});
if (linkedRepIds.length > 0) {
await saveWithTracking('rep_sales', repSales);
const modifiedSales = repSales.filter(s => linkedRepIds.includes(s.id));
for (const sale of modifiedSales) {
await saveRecordToFirestore('rep_sales', sale);
}
}
return linkedRepIds;
}
async function revertRepSalesEntries(repSaleIds) {
if (!repSaleIds || repSaleIds.length === 0) return 0;
let revertedCount = 0;
repSaleIds.forEach(saleId => {
const saleIndex = repSales.findIndex(s => s.id === saleId);
if (saleIndex !== -1) {
delete repSales[saleIndex].usedInCalcId;
repSales[saleIndex].updatedAt = getTimestamp();
revertedCount++;
}
});
if (revertedCount > 0) {
await saveWithTracking('rep_sales', repSales);
const revertedSales = repSales.filter(s => repSaleIds.includes(s.id));
for (const sale of revertedSales) {
await saveRecordToFirestore('rep_sales', sale);
}
notifyDataChange('rep');
triggerAutoSync();
}
return revertedCount;
}
function togglePercentage(chartId) {
let btnId = '';
if (chartId === 'mfgPieChart') {
btnId = 'mfgPiePercentageToggle';
} else if (chartId === 'custPaymentChart') {
btnId = 'custPaymentPercentageToggle';
} else if (chartId === 'compositionChart') {
btnId = 'compositionPercentageToggle';
}
const btn = document.getElementById(btnId);
if (!btn) {
return;
}
switch(chartId) {
case 'mfgPieChart':
mfgPieChartShowPercentage = !mfgPieChartShowPercentage;
btn.textContent = mfgPieChartShowPercentage ? 'Show Values' : 'Show %';
updateMfgPieChart();
break;
case 'custPaymentChart':
custPaymentChartShowPercentage = !custPaymentChartShowPercentage;
btn.textContent = custPaymentChartShowPercentage ? 'Show Values' : 'Show %';
updateCustomerPieChart();
break;
case 'compositionChart':
compositionChartShowPercentage = !compositionChartShowPercentage;
btn.textContent = compositionChartShowPercentage ? 'Show Values' : 'Show %';
updateCompositionChart();
break;
}
}
function updateMfgPieChart() {
if (!mfgPieChart) return;
const data = mfgPieChart.data.datasets[0].data;
const total = data.reduce((a, b) => a + b, 0);
if (mfgPieChartShowPercentage) {
mfgPieChart.data.datasets[0].data = data.map(value => total > 0 ? ((value / total) * 100).toFixed(2) : 0);
mfgPieChart.options.plugins.tooltip = {
callbacks: {
label: function(context) {
return `${context.label}: ${context.parsed}%`;
}
}
};
} else {
updateMfgCharts();
}
mfgPieChart.update();
}
function updateCustomerPieChart() {
if (!custPaymentChart) return;
const data = custPaymentChart.data.datasets[0].data;
const total = data.reduce((a, b) => a + b, 0);
if (custPaymentChartShowPercentage) {
custPaymentChart.data.datasets[0].data = data.map(value => total > 0 ? ((value / total) * 100).toFixed(2) : 0);
custPaymentChart.options.plugins.tooltip = {
callbacks: {
label: function(context) {
return `${context.label}: ${context.parsed}%`;
}
}
};
} else {
updateCustomerCharts();
}
custPaymentChart.update();
}
async function updateCompositionChart() {
if (!salesCompChart) return;
const data = salesCompChart.data.datasets[0].data;
const total = data.reduce((a, b) => a + b, 0);
if (compositionChartShowPercentage) {
salesCompChart.data.datasets[0].data = data.map(value => total > 0 ? ((value / total) * 100).toFixed(2) : 0);
salesCompChart.options.plugins.tooltip = {
callbacks: {
label: function(context) {
return `${context.label}: ${context.parsed}%`;
}
}
};
} else {
const seller = document.getElementById('sellerSelect').value;
if (seller === 'COMBINED') {
const comp = await calculateComparisonData();
updateSalesCharts(comp);
}
}
salesCompChart.update();
}
async function setIndChartMode(mode) {
currentIndMode = mode;
document.getElementById('ind-week-btn').className = `toggle-opt ${mode === 'week' ? 'active' : ''}`;
document.getElementById('ind-month-btn').className = `toggle-opt ${mode === 'month' ? 'active' : ''}`;
document.getElementById('ind-year-btn').className = `toggle-opt ${mode === 'year' ? 'active' : ''}`;
document.getElementById('ind-all-btn').className = `toggle-opt ${mode === 'all' ? 'active' : ''}`;
await updateIndChart();
}
async function setIndChartMetric(metric) {
currentIndMetric = metric;
await updateIndChart();
}
async function updateIndChart() {
if (typeof Chart === 'undefined') return;
const seller = document.getElementById('sellerSelect').value;
if (seller === 'COMBINED') return;
if(indPerformanceChart) indPerformanceChart.destroy();
let history; history = await idb.get('noman_history', []);
const sellerHistory = history.filter(h => h.seller === seller);
const now = new Date(document.getElementById('sale-date').value);
const selectedYear = now.getFullYear();
const selectedMonth = now.getMonth();
const selectedDay = now.getDate();
let labels = [];
let data = [];
if (currentIndMode === 'week') {
for(let i=6; i>=0; i--) {
const d = new Date(now);
d.setDate(now.getDate() - i);
const dateStr = d.toISOString().split('T')[0];
labels.push(d.toLocaleDateString('en-US', {weekday:'short'}));
let metricValue = 0;
sellerHistory.forEach(h => {
if(h.date === dateStr) {
metricValue += getMetricValue(h, currentIndMetric);
}
});
data.push(metricValue);
}
} else if (currentIndMode === 'month') {
const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
labels = Array.from({length: daysInMonth}, (_, i) => i + 1);
data = new Array(daysInMonth).fill(0);
sellerHistory.forEach(h => {
const d = new Date(h.date);
if(d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
const day = d.getDate();
data[day - 1] += getMetricValue(h, currentIndMetric);
}
});
} else if (currentIndMode === 'year') {
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
labels = months;
data = new Array(12).fill(0);
sellerHistory.forEach(h => {
const d = new Date(h.date);
if(d.getFullYear() === now.getFullYear()) {
const month = d.getMonth();
data[month] += getMetricValue(h, currentIndMetric);
}
});
} else if (currentIndMode === 'all') {
const allMonths = [];
const monthData = {};
sellerHistory.forEach(h => {
const d = new Date(h.date);
const monthYear = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = `${d.toLocaleDateString('en-US', {month:'short'})} ${d.getFullYear()}`;
if (!monthData[monthYear]) {
monthData[monthYear] = {
label: monthLabel,
value: 0
};
}
monthData[monthYear].value += getMetricValue(h, currentIndMetric);
});
const sortedMonths = Object.keys(monthData).sort();
sortedMonths.forEach(monthKey => {
labels.push(monthData[monthKey].label);
data.push(monthData[monthKey].value);
});
if (labels.length > 12) {
labels = labels.slice(-12);
data = data.slice(-12);
}
}
const colors = {
text: '#1e3a8a',
grid: 'rgba(37, 99, 235, 0.1)'
};
const repChartColorsInd = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2'];
const sellerColor = repChartColorsInd[salesRepsList.indexOf(seller) >= 0 ? salesRepsList.indexOf(seller) : 0];
const chartElement = document.getElementById('indPerformanceChart');
if (!chartElement) {
return;
}
const ctx = chartElement.getContext('2d');
if (!ctx) {
return;
}
indPerformanceChart = new Chart(ctx, {
type: 'bar',
data: {
labels: labels,
datasets: [{
label: getMetricLabel(currentIndMetric),
data: data,
backgroundColor: sellerColor + '80',
borderColor: sellerColor,
borderWidth: 1,
borderRadius: 4
}]
},
options: {
responsive: true,
maintainAspectRatio: false,
plugins: {
legend: { display: false },
title: {
display: true,
text: `${getMetricLabel(currentIndMetric)} - ${currentIndMode === 'all' ? 'All Times' : currentIndMode.charAt(0).toUpperCase() + currentIndMode.slice(1) + 'ly'} View`,
color: colors.text,
font: { size: 13, weight: 'bold' }
}
},
scales: {
y: {
beginAtZero: true,
grid: { color: colors.grid },
ticks: { color: colors.text }
},
x: {
ticks: { color: colors.text, maxRotation: 45 }
}
}
}
});
}
function setStoreComparisonMetric(metric, event) {
if (event) {
event.preventDefault();
}
currentStoreComparisonMetric = metric;
document.querySelectorAll('.metric-btn').forEach(btn => {
btn.classList.remove('active');
});
if (event && event.target) {
event.target.classList.add('active');
}
updateStoreComparisonChart(currentOverviewMode);
}
function updateStoreComparisonChart(mode = 'day') {
if (typeof Chart === 'undefined') return;
if(storeComparisonChart) storeComparisonChart.destroy();
const selectedDate = document.getElementById('sys-date').value;
const selectedDateObj = new Date(selectedDate);
const selectedYear = selectedDateObj.getFullYear();
const selectedMonth = selectedDateObj.getMonth();
const selectedDay = selectedDateObj.getDate();
const stores = ['STORE_A', 'STORE_B', 'STORE_C'];
const storeLabels = ['ZUBAIR', 'MAHMOOD', 'ASAAN'];
const storeColors = ['#3b82f6', '#8b5cf6', '#10b981'];
let data = [];
let metricLabel = '';
stores.forEach(store => {
let storeData = {
weight: 0,
value: 0,
cost: 0,
profit: 0
};
db.forEach(item => {
const itemDate = new Date(item.date);
const itemYear = itemDate.getFullYear();
const itemMonth = itemDate.getMonth();
const itemDay = itemDate.getDate();
let includeItem = false;
if (mode === 'day' && item.date === selectedDate) {
includeItem = true;
} else if (mode === 'week') {
const weekStart = new Date(selectedDateObj);
weekStart.setDate(selectedDay - 6);
if (itemDate >= weekStart && itemDate <= selectedDateObj) {
includeItem = true;
}
} else if (mode === 'month' && itemYear === selectedYear && itemMonth === selectedMonth) {
includeItem = true;
} else if (mode === 'year' && itemYear === selectedYear) {
includeItem = true;
} else if (mode === 'all') {
includeItem = true;
}
if (includeItem && item.store === store) {
storeData.weight += (item.net || 0);
storeData.value += (item.totalSale || 0);
storeData.cost += (item.totalCost || 0);
storeData.profit += (item.profit || 0);
}
});
data.push(storeData[currentStoreComparisonMetric]);
});
switch(currentStoreComparisonMetric) {
case 'weight': metricLabel = 'Weight (kg)'; break;
case 'value': metricLabel = 'Total Value ()'; break;
case 'cost': metricLabel = 'Total Cost ()'; break;
case 'profit': metricLabel = 'Net Profit ()'; break;
}
const colors = {
text: '#1e3a8a',
grid: 'rgba(37, 99, 235, 0.1)'
};
const storeChartElement = document.getElementById('storeComparisonChart');
if (!storeChartElement) {
return;
}
const storeCtx = storeChartElement.getContext('2d');
if (!storeCtx) {
return;
}
storeComparisonChart = new Chart(storeCtx, {
type: 'bar',
data: {
labels: storeLabels,
datasets: [{
label: metricLabel,
data: data,
backgroundColor: storeColors,
borderColor: storeColors,
borderWidth: 1,
borderRadius: 6
}]
},
options: {
responsive: true,
maintainAspectRatio: false,
plugins: {
legend: { display: false },
title: {
display: true,
text: `Store Comparison by ${metricLabel} (${mode === 'all' ? 'All Times' : mode.charAt(0).toUpperCase() + mode.slice(1)})`,
color: colors.text,
font: { size: 13, weight: 'bold' }
}
},
scales: {
y: {
beginAtZero: true,
grid: { color: colors.grid },
ticks: { color: colors.text }
},
x: {
ticks: { color: colors.text }
}
}
}
});
}
async function refreshUI(page = 1, force = false) {
const selectedDate = document.getElementById('sys-date').value;
if (!selectedDate) return;
if (idb && idb.get) {
try {
let freshProduction = await idb.get('mfg_pro_pkr', []);
if (freshProduction && freshProduction.length > 0) {
let fixedCount = 0;
freshProduction = freshProduction.map(record => {
if (!record.id || !validateUUID(record.id) ||
!record.createdAt || !validateTimestamp(record.createdAt) ||
!record.updatedAt || !validateTimestamp(record.updatedAt)) {
record = ensureRecordIntegrity(record, false, true);
fixedCount++;
}
return record;
});
if (fixedCount > 0) {
await idb.set('mfg_pro_pkr', freshProduction);
}
db = freshProduction;
}
} catch (error) {
console.error('Failed to save data locally.', error);
showToast('Failed to save data locally.', 'error');
}
}
const [sYear, sMonth, sDay] = selectedDate.split('-').map(Number);
const selectedDateObj = new Date(sYear, sMonth - 1, sDay);
const weekStart = new Date(selectedDateObj);
weekStart.setDate(selectedDateObj.getDate() - 6);
weekStart.setHours(0,0,0,0);
let stats = {
day: {q:0, p:0, c:0, v:0, fu:0, fc:0},
week: {q:0, p:0, c:0, v:0, fu:0, fc:0},
month: {q:0, p:0, c:0, v:0, fu:0, fc:0},
year: {q:0, p:0, c:0, v:0, fu:0, fc:0},
all: {q:0, p:0, c:0, v:0, fu:0, fc:0}
};
let filteredData = currentProductionView === 'combined' ? db : db.filter(item => item.store === currentStore);
const sortedDb = [...filteredData].sort((a, b) => {
if (a.date === selectedDate && b.date !== selectedDate) return -1;
if (a.date !== selectedDate && b.date === selectedDate) return 1;
return b.timestamp - a.timestamp;
});
sortedDb.forEach(item => {
if(!item.date) return;
if(item.isReturn) return; 
const [rowYear, rowMonth, rowDay] = item.date.split('-').map(Number);
const rowDateObj = new Date(rowYear, rowMonth - 1, rowDay);
rowDateObj.setHours(0,0,0,0);
if(item.date === selectedDate) {
stats.day.q += (item.net || 0); stats.day.p += (item.profit || 0); stats.day.c += (item.totalCost || 0);
stats.day.v += (item.totalSale || 0); stats.day.fu += (item.formulaUnits || 0); stats.day.fc += (item.formulaCost || 0);
}
if(rowDateObj >= weekStart && rowDateObj <= selectedDateObj) {
stats.week.q += (item.net || 0); stats.week.p += (item.profit || 0); stats.week.c += (item.totalCost || 0);
stats.week.v += (item.totalSale || 0); stats.week.fu += (item.formulaUnits || 0); stats.week.fc += (item.formulaCost || 0);
}
if(rowYear === sYear && rowMonth === sMonth) {
stats.month.q += (item.net || 0); stats.month.p += (item.profit || 0); stats.month.c += (item.totalCost || 0);
stats.month.v += (item.totalSale || 0); stats.month.fu += (item.formulaUnits || 0); stats.month.fc += (item.formulaCost || 0);
}
if(rowYear === sYear) {
stats.year.q += (item.net || 0); stats.year.p += (item.profit || 0); stats.year.c += (item.totalCost || 0);
stats.year.v += (item.totalSale || 0); stats.year.fu += (item.formulaUnits || 0); stats.year.fc += (item.formulaCost || 0);
}
stats.all.q += (item.net || 0); stats.all.p += (item.profit || 0); stats.all.c += (item.totalCost || 0);
stats.all.v += (item.totalSale || 0); stats.all.fu += (item.formulaUnits || 0); stats.all.fc += (item.formulaCost || 0);
});
const histMode = (currentProductionView === 'store') ? 'day' : (currentOverviewMode || 'day');
const pageData = sortedDb.filter(item => {
if (!item.date) return true;
const [rowY, rowM, rowD] = item.date.split('-').map(Number);
const rowDateObj = new Date(rowY, rowM - 1, rowD);
rowDateObj.setHours(0, 0, 0, 0);
if (histMode === 'day') return item.date === selectedDate;
if (histMode === 'week') return rowDateObj >= weekStart && rowDateObj <= selectedDateObj;
if (histMode === 'month') return rowY === sYear && rowM === sMonth;
if (histMode === 'year') return rowY === sYear;
return true;
});
const validPage = 1;
const totalPages = 1;
const totalItems = pageData.length;
const cacheData = {
pageData, stats, selectedDate, totalPages, totalItems, validPage
};
renderProductionFromCache(cacheData);
}
function renderProductionFromCache(cached) {
const { pageData, stats, selectedDate, totalPages, totalItems, validPage } = cached;
const histContainer = document.getElementById('prodHistoryList');
histContainer.innerHTML = '';
if (totalItems === 0) {
histContainer.innerHTML = `<p style="text-align:center; color:var(--text-muted); width:100%; font-size:0.85rem;">No records found for this selection.</p>`;
} else {
const fragment = document.createDocumentFragment();
pageData.forEach(item => {
const isSelected = item.date === selectedDate;
const highlightClass = isSelected ? 'highlight-card' : '';
const dateDisplay = isSelected ? `${formatDisplayDate(item.date)} (Selected)` : formatDisplayDate(item.date);
const storeBadgeClass = item.store === 'STORE_A' ? 'store-a' : item.store === 'STORE_B' ? 'store-b' : 'store-c';
const storeLabel = item.store === 'STORE_A' ? 'ZUBAIR' : item.store === 'STORE_B' ? 'MAHMOOD' : 'ASAAN';
let returnBadge = '';
if (item.isReturn) {
returnBadge = `<span class="payment-badge" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); top: 35px; right: 12px;"> RETURN</span>`;
}
let paymentBadge = '';
if (item.store === 'STORE_C' && item.paymentStatus === 'CREDIT' && !item.isReturn) {
paymentBadge = `<span class="payment-badge credit" style="top: 35px; right: 12px;">CREDIT</span>`;
}
let mergedBadge = '';
if (item.isMerged) {
mergedBadge = _mergedBadgeHtml(item, {inline:true});
}
const div = document.createElement('div');
div.className = `card liquid-card ${highlightClass}`;
if (item.date) div.setAttribute('data-date', item.date);
let returnsByStoreHtml = '';
if (item.isMerged && item.isReturn && item.returnsByStore && Object.keys(item.returnsByStore).length > 1) {
  const storeLabels2 = { STORE_A:'ZUBAIR', STORE_B:'MAHMOOD', STORE_C:'ASAAN' };
  returnsByStoreHtml = Object.entries(item.returnsByStore).map(([s,q]) =>
    `<p><span style="color:var(--text-muted);">${esc(storeLabels2[s]||s)}:</span> <span class="qty-val">${safeValue(q).toFixed(2)} kg</span></p>`
  ).join('');
}
div.innerHTML = `
${currentProductionView === 'combined' ? `<span class="store-badge ${storeBadgeClass}">${esc(storeLabel)}</span>` : ''}
${returnBadge}
${item.isMerged ? '' : paymentBadge}
<h4>${dateDisplay} @ ${esc(item.time || '')}${mergedBadge}</h4>
${item.managedBy ? `<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 0 5px;padding:2px 9px;font-size:0.65rem;font-weight:700;letter-spacing:0.04em;color:var(--warning);background:rgba(255,179,0,0.10);border:1px solid rgba(255,179,0,0.28);border-radius:999px;">${esc(item.managedBy)}</span><br>` : ''}
${item.isReturn ? `<p style="color:var(--accent-emerald); font-size:0.75rem; font-style:italic;">${item.isMerged ? 'Merged returns by' : 'Returned by'} ${esc(item.returnedBy || 'Representative')}</p>` : ''}
<p><span>Net Weight:</span> <span class="qty-val">${safeValue(item.net).toFixed(2)} kg</span></p>
<p><span>Cost Price:</span> <span class="cost-val">${safeValue(item.cp).toFixed(2)}/kg</span></p>
<p><span>Sale Price:</span> <span class="rev-val">${safeValue(item.sp).toFixed(2)}/kg</span></p>
<hr>
<p><span>Total Cost:</span> <span class="cost-val">${safeValue(item.totalCost).toFixed(2)}</span></p>
<p><span>Total Value:</span> <span class="rev-val">${safeValue(item.totalSale).toFixed(2)}</span></p>
<p><span>Net Profit:</span> <span class="profit-val">${safeValue(item.profit).toFixed(2)}</span></p>
${!item.isMerged && item.paymentStatus === 'CREDIT' && !item.isReturn ? `<p><span>Payment:</span> <span class="cost-val" style="color:var(--credit-color);">Credit</span></p>` : ''}
${returnsByStoreHtml}
${item.formulaUnits && !item.isReturn ? `<p><span>Formula Units:</span> <span class="qty-val">${safeValue(item.formulaUnits).toFixed(2)}</span></p>` : ''}
${item.formulaCost && !item.isReturn ? `<p><span>Formula Cost:</span> <span class="cost-val">${safeValue(item.formulaCost).toFixed(2)}</span></p>` : ''}
${item.isMerged ? '' : `<button class="tbl-action-btn danger u-w-full u-mt-8" onclick="(async () => { await deleteProdEntry('${esc(item.id)}') })()">Delete</button>`}
`;
fragment.appendChild(div);
});
histContainer.appendChild(fragment);
}
const updateStats = (idPrefix, statObj) => {
const _st = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
_st(`${idPrefix}-qty`, `${safeValue(statObj.q).toFixed(2)} kg`);
_st(`${idPrefix}-value`, `${safeValue(statObj.v).toFixed(2)}`);
_st(`${idPrefix}-cost`, `${safeValue(statObj.c).toFixed(2)}`);
_st(`${idPrefix}-profit`, `${safeValue(statObj.p).toFixed(2)}`);
_st(`${idPrefix}-formula-units`, `${safeValue(statObj.fu).toFixed(2)}`);
_st(`${idPrefix}-formula-cost`, `${safeValue(statObj.fc).toFixed(2)}`);
};
updateStats('day', stats.day);
updateStats('week', stats.week);
updateStats('month', stats.month);
updateStats('year', stats.year);
updateStats('all', stats.all);
updateMfgCharts();
if (currentProductionView === 'combined') {
updateAllStoresOverview(currentOverviewMode);
}
updateUnitsAvailableIndicator();
}
function filterProductionHistory() {
const searchTerm = document.getElementById('production-search').value.toLowerCase();
const allCards = document.querySelectorAll('#prodHistoryList .card');
allCards.forEach(card => {
const cardText = card.textContent.toLowerCase();
if (cardText.includes(searchTerm)) {
card.style.display = '';
} else {
card.style.display = 'none';
}
});
}
function filterCalculatorHistory() {
const searchTerm = document.getElementById('calculator-search').value.toLowerCase();
const allCards = document.querySelectorAll('#historyList .card');
allCards.forEach(card => {
const cardText = card.textContent.toLowerCase();
const sellerElement = card.querySelector('.seller-badge');
const sellerText = sellerElement ? sellerElement.textContent.toLowerCase() : '';
if (cardText.includes(searchTerm) || sellerText.includes(searchTerm)) {
card.style.display = '';
} else {
card.style.display = 'none';
}
});
}
function filterCustomerTransactions() {
const searchTerm = document.getElementById('customer-search').value.toLowerCase();
const allCards = document.querySelectorAll('#custHistoryList .card');
allCards.forEach(card => {
const customerName = card.querySelector('.customer-name')?.textContent.toLowerCase() || '';
if (customerName.includes(searchTerm)) {
card.style.display = '';
} else {
card.style.display = 'none';
}
});
}
let currentEntityId = null;
let currentQuickType = 'OUT';
let currentExpenseOverlayName = null;
async function renderEntityTable(page = 1) {
const tbody = document.getElementById('entity-table-body');
const filterInput = document.getElementById('entity-list-filter');
const filter = filterInput ? String(filterInput.value).toLowerCase() : '';
if (!tbody) return;
try {
const freshEntities = await idb.get('payment_entities', []);
if (Array.isArray(freshEntities)) {
const entityMap = new Map(freshEntities.map(e => [e.id, e]));
if (Array.isArray(paymentEntities)) {
paymentEntities.forEach(e => {
if (!entityMap.has(e.id)) {
entityMap.set(e.id, e);
}
});
}
paymentEntities = Array.from(entityMap.values());
}
const freshTransactions = await idb.get('payment_transactions', []);
if (Array.isArray(freshTransactions)) {
const txMap = new Map(freshTransactions.map(t => [t.id, t]));
if (Array.isArray(paymentTransactions)) {
paymentTransactions.forEach(t => {
if (!txMap.has(t.id)) {
txMap.set(t.id, t);
}
});
}
paymentTransactions = Array.from(txMap.values());
}
} catch (error) {
console.error('Payment transaction failed.', error);
showToast('Payment transaction failed.', 'error');
}
const balances = calculateEntityBalances();
let totalReceivables = 0;
let totalPayables = 0;
const filteredEntities = paymentEntities.filter(e => !e.isExpenseEntity);
const sortedEntities = [...filteredEntities].sort((a, b) => {
const balA = Math.abs(balances[a.id] || 0);
const balB = Math.abs(balances[b.id] || 0);
return balB - balA;
});
const matchedEntities = sortedEntities.filter(entity => {
const safeName = String(entity.name || 'Unknown Entity');
return !filter || safeName.toLowerCase().includes(filter);
});
matchedEntities.forEach(entity => {
const balance = balances[entity.id] || 0;
if (balance > 0) totalPayables += balance;
else totalReceivables += Math.abs(balance);
});
const pageEntities = matchedEntities;
const validPage = 1;
const totalPages = 1;
const totalItems = matchedEntities.length;
const startIndex = 0;
const endIndex = matchedEntities.length;
const entitiesData = {
pageEntities,
balances,
totalReceivables,
totalPayables,
totalItems,
totalPages,
validPage
};
if (entitiesData && entitiesData.pageEntities) {
renderEntitiesFromCache(entitiesData, tbody);
} else {
tbody.innerHTML = `<tr><td class="u-text-center u-text-danger" colspan="4" >Failed to load entity data</td></tr>`;
}
}
function renderEntitiesFromCache(data, tbody) {
if (!data) {
tbody.innerHTML = `<tr><td class="u-text-center u-text-danger" colspan="4" >Error loading entities</td></tr>`;
return;
}
const { pageEntities, balances, totalReceivables, totalPayables, totalItems, totalPages, validPage } = data;
if (!pageEntities || !Array.isArray(pageEntities) || !balances) {
tbody.innerHTML = `<tr><td class="u-text-center u-text-danger" colspan="4" >Invalid entity data</td></tr>`;
return;
}
tbody.innerHTML = '';
if (totalItems === 0) {
tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:15px; color:var(--text-muted);">No entities found</td></tr>`;
} else {
const fragment = document.createDocumentFragment();
pageEntities.forEach(entity => {
const safeName = String(entity.name || 'Unknown Entity');
const balance = balances[entity.id] || 0;
let balanceHtml = '';
if (balance > 0.01) {
balanceHtml = `<span class="u-danger-bold" >Payable: ${balance.toFixed(2)}</span>`;
} else if (balance < -0.01) {
balanceHtml = `<span class="u-text-emerald u-fw-800" >Receivable: ${Math.abs(balance).toFixed(2)}</span>`;
} else {
balanceHtml = `<span class="u-text-muted" >Settled</span>`;
}
const tr = document.createElement('tr');
const safeNameForClick = safeName.replace(/'/g, "\\'");
tr.innerHTML = `
<td style="text-align:left;">
<div class="u-fw-700" >${esc(safeName)}</div>
</td>
<td style="text-align:right;">${balanceHtml}</td>
<td style="text-align:right; font-size:0.75rem;">${phoneActionHTML(entity.phone)}</td>
<td class="u-text-center" >
<button class="btn-theme" style="padding:4px 12px; font-size:0.75rem; border-radius:999px; margin-right: 5px;"
onclick="editEntityBasicInfo('${esc(entity.id)}')" title="Edit entity details">
Edit
</button>
<button class="btn-theme" style="padding:4px 12px; font-size:0.75rem; border-radius:999px; background: var(--accent); color: white; border:none;"
onclick="openEntityDetailsOverlay('${esc(entity.id)}')" title="View transactions">
Transactions
</button>
</td>
`;
fragment.appendChild(tr);
});
tbody.appendChild(fragment);
}
const recEl = document.getElementById('total-receivables');
const payEl = document.getElementById('total-payables');
if(recEl) recEl.innerText = `${totalReceivables.toFixed(2)}`;
if(payEl) payEl.innerText = `${totalPayables.toFixed(2)}`;
}
function filterEntityList() {
const searchTerm = document.getElementById('entity-list-search')?.value.toLowerCase() || '';
if (entityListViewType === 'table') {
const rows = document.querySelectorAll('#entityListBody tr');
rows.forEach(row => {
const entityName = row.querySelector('strong')?.textContent.toLowerCase() || '';
const phone = row.querySelector('div[style*="font-size:0.7rem"]')?.textContent.toLowerCase() || '';
if (entityName.includes(searchTerm) || phone.includes(searchTerm)) {
row.style.display = '';
} else {
row.style.display = 'none';
}
});
} else {
const cards = document.querySelectorAll('#entityListBody .entity-card');
cards.forEach(card => {
const cardText = card.textContent.toLowerCase();
if (cardText.includes(searchTerm)) {
card.style.display = '';
} else {
card.style.display = 'none';
}
});
}
}
function viewEntityTransactions(entityId) {
const entity = paymentEntities.find(e => String(e.id) === String(entityId));
if (!entity) return;
const entityTransactions = paymentTransactions.filter(t => String(t.entityId) === String(entityId));
let message = `Transactions for ${entity.name}\n\n`;
if (entityTransactions.length === 0) {
message += "No transactions found.";
} else {
entityTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
let totalIn = 0, totalOut = 0;
entityTransactions.forEach((t, index) => {
const typeText = t.type === 'IN' ? 'RECEIVED' : 'PAID';
const amount = t.amount.toFixed(2);
message += `${index + 1}. ${t.date} ${t.time || ''}\n`;
message += ` ${typeText}: ${amount}\n`;
message += ` Description: ${t.description}\n`;
message += ` ---\n`;
if (t.type === 'IN') totalIn += t.amount;
else totalOut += t.amount;
});
const netBalance = totalIn - totalOut;
message += `\nSUMMARY:\n`;
message += `Total Received: ${totalIn.toFixed(2)}\n`;
message += `Total Paid: ${totalOut.toFixed(2)}\n`;
message += `Net Balance: ${netBalance.toFixed(2)}\n`;
}
showToast(message, 'info', 5000);
}
async function syncSuppliersToEntities() {
factoryInventoryData.forEach(material => {
if (!material.supplierName) return;
const existingEntity = paymentEntities.find(e =>
(e.name === material.supplierName && e.type === 'payee') ||
(material.supplierId && String(e.id) === String(material.supplierId))
);
if (!existingEntity) {
const entityId = material.supplierId || generateUUID('supp');
paymentEntities.push({
id: entityId,
name: material.supplierName,
type: 'payee',
phone: material.supplierContact || '',
wallet: '',
createdAt: Date.now(),
updatedAt: Date.now(),
isSupplier: true,
supplierCategory: 'raw_materials'
});
} else if (material.supplierId && existingEntity.id !== material.supplierId) {
material.supplierId = existingEntity.id;
}
});
await saveWithTracking('payment_entities', paymentEntities);
await saveWithTracking('factory_inventory_data', factoryInventoryData);
}

async function verifyAccountPassword(password) {
  if (!currentUser || !password) return false;
  const email = currentUser.email;

  if (navigator.onLine && typeof firebase !== 'undefined' && firebase.apps.length) {
    try {
      const firebaseAuth = auth || firebase.auth();
      await firebaseAuth.signInWithEmailAndPassword(email, password);
      return true;
    } catch (fbErr) {

      if (fbErr.code && fbErr.code.startsWith('auth/')) return false;

      console.warn('Firebase reauth network error, falling back to offline check:', fbErr.message);
    }
  }

  try {
    return await OfflineAuth.verifyCredentials(email, password);
  } catch (e) {
    console.error('OfflineAuth verification error:', e);
    return false;
  }
}

async function promptVerifiedBackupPassword({ title = 'Confirm Password', subtitle = 'Enter your account password to encrypt this backup file.', inputId = '_bkp_pwd_modal_input' } = {}) {
  if (!currentUser) return null;
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);display:flex;align-items:center;justify-content:center;z-index:200001;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);';
    modal.innerHTML = `
    <div class="liquid-card" style="max-width:370px;width:92%;padding:28px 24px;text-align:center;">
      <div style="font-size:1.6rem;margin-bottom:8px;">🔐</div>
      <h3 style="margin:0 0 6px;color:var(--text-main);font-size:1rem;font-weight:800;font-family:'Bricolage Grotesque',system-ui,sans-serif;">${esc(title)}</h3>
      <p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:6px;line-height:1.5;">${esc(subtitle)}</p>
      <p style="font-size:0.72rem;color:var(--accent);margin-bottom:14px;">Account: <strong>${esc(currentUser.email)}</strong></p>
      <div style="position:relative;margin-bottom:8px;">
        <input type="password" id="${inputId}" placeholder="Your account password" autocomplete="current-password"
          style="width:100%;padding:11px 40px 11px 12px;background:var(--input-bg);border:1.5px solid var(--glass-border);border-radius:10px;box-sizing:border-box;color:var(--text-main);font-size:0.9rem;outline:none;transition:border-color 0.2s;"
          onfocus="this.style.borderColor='rgba(52,217,116,0.5)'" onblur="this.style.borderColor='var(--glass-border)'">
        <button type="button" tabindex="-1"
          onclick="(function(btn){const inp=document.getElementById('${inputId}');inp.type=inp.type==='password'?'text':'password';btn.querySelector('svg').style.opacity=inp.type==='text'?'1':'0.45';})(this)"
          style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;padding:2px;color:var(--text-muted);line-height:0;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.45;transition:opacity 0.2s;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        </button>
      </div>
      <div id="${inputId}_err" style="font-size:0.74rem;color:var(--danger);min-height:18px;margin-bottom:10px;text-align:left;padding-left:2px;"></div>
      <div style="display:flex;gap:10px;">
        <button id="${inputId}_ok" style="flex:1;padding:11px;background:var(--accent);border:none;border-radius:10px;color:#003d2e;font-weight:700;cursor:pointer;font-size:0.88rem;transition:opacity 0.2s;">Encrypt &amp; Download</button>
        <button id="${inputId}_cancel" style="flex:1;padding:11px;background:var(--input-bg);border:1px solid var(--glass-border);border-radius:10px;color:var(--text-main);cursor:pointer;font-size:0.88rem;">Cancel</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    const inp = document.getElementById(inputId);
    const errEl = document.getElementById(inputId + '_err');
    const okBtn = document.getElementById(inputId + '_ok');
    setTimeout(() => { if (inp) inp.focus(); }, 100);

    if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') okBtn.click(); });
    okBtn.onclick = async () => {
      const pwd = inp ? inp.value : '';
      if (!pwd) { errEl.textContent = 'Please enter your password.'; return; }
      okBtn.disabled = true;
      okBtn.style.opacity = '0.6';
      okBtn.textContent = 'Verifying…';
      errEl.textContent = '';
      const valid = await verifyAccountPassword(pwd);
      if (valid) {
        document.body.removeChild(modal);
        resolve(pwd);
      } else {
        okBtn.disabled = false;
        okBtn.style.opacity = '1';
        okBtn.textContent = 'Encrypt & Download';
        errEl.textContent = '✕ Incorrect password — please try again.';
        if (inp) { inp.value = ''; inp.focus(); }
      }
    };
    document.getElementById(inputId + '_cancel').onclick = () => {
      document.body.removeChild(modal);
      resolve(null);
    };
  });
}

