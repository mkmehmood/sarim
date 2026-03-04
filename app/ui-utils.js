function updateConnectionStatus() {
const dot = document.getElementById('connection-indicator');
if (!dot) return;
if (!navigator.onLine) {
dot.className = 'signal-offline';
dot.title = "Offline - Changes saved locally";
} else if (isSyncing) {
dot.className = 'signal-connecting';
dot.title = "Syncing with Cloud...";
} else if (firebase.apps.length && currentUser) {
dot.className = 'signal-online';
dot.title = "Online - Connected to Firestore";
} else {
dot.className = 'signal-offline';
dot.title = "Disconnected - Please Sign In";
}
}
window.addEventListener('online', () => { updateConnectionStatus(); if(typeof updateOfflineBanner==='function') updateOfflineBanner(); });
window.addEventListener('offline', () => { updateConnectionStatus(); if(typeof updateOfflineBanner==='function') updateOfflineBanner(); });
const originalSync = window.performOneClickSync;
window.performOneClickSync = async function(silent) {
updateConnectionStatus();
try {
await originalSync(silent);
} finally {
isSyncing = false;
updateConnectionStatus();
}
};
document.addEventListener('DOMContentLoaded', () => {
updateConnectionStatus();
});
(function() {
const body = document.body;
const threshold = 150;
let startY = 0;
let isPulling = false;
const ptrStyle = document.createElement('style');
ptrStyle.innerHTML = `
@keyframes ptrSpinArc { to { stroke-dashoffset: -138; } }
@keyframes ptrSuccessScale {
0% { transform: scale(0) rotate(-45deg); opacity: 0; }
70% { transform: scale(1.25) rotate(5deg); opacity: 1; }
100% { transform: scale(1) rotate(0deg); opacity: 1; }
}
`;
document.head.appendChild(ptrStyle);
const pill = document.createElement('div');
pill.id = 'pull-refresh-pill';
pill.innerHTML = `
<div class="ptr-icon-wrap" id="ptr-icon-wrap">
<svg class="ptr-svg" id="ptr-svg" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
<circle class="ptr-track" cx="16" cy="16" r="12" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
<circle class="ptr-arc u-hidden" id="ptr-arc" cx="16" cy="16" r="12"
stroke="#4da6ff" stroke-width="2" stroke-linecap="round"
stroke-dasharray="75.4" stroke-dashoffset="75.4"
transform="rotate(-90 16 16)" />
<g class="ptr-arrow-g" id="ptr-arrow-g">
<line x1="16" y1="9" x2="16" y2="21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
<polyline points="11,17 16,22 21,17" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</g>
<g class="ptr-check-g" id="ptr-check-g" style="display:none; transform-origin: 50% 50%;">
<polyline points="9,16 14,21 23,11" stroke="#2ddf7a" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</g>
</svg>
</div>
<div class="ptr-text-wrap">
<span class="ptr-label" id="ptr-label">Pull to sync</span>
<span class="ptr-sublabel" id="ptr-sublabel"></span>
</div>
<div class="ptr-dots" id="ptr-dots">
<span></span><span></span><span></span>
</div>
`;
document.body.appendChild(pill);
const iconWrap = pill.querySelector('#ptr-icon-wrap');
const arrowG = pill.querySelector('#ptr-arrow-g');
const checkG = pill.querySelector('#ptr-check-g');
const arc = pill.querySelector('#ptr-arc');
const label = pill.querySelector('#ptr-label');
const sublabel = pill.querySelector('#ptr-sublabel');
const dots = pill.querySelector('#ptr-dots');
const setState = (state) => {
pill.className = 'ptr-' + state;
pill.dataset.state = state;
arrowG.style.display = 'none';
arc.style.display = 'none';
checkG.style.display = 'none';
dots.classList.remove('visible');
sublabel.textContent = '';
if (state === 'idle') {
arrowG.style.display = 'block';
arrowG.style.color = 'rgba(255,255,255,0.50)';
label.textContent = 'Pull to sync';
label.style.color = 'rgba(255,255,255,0.55)';
} else if (state === 'pull') {
arrowG.style.display = 'block';
arrowG.style.color = '#4da6ff';
label.textContent = 'Pull to sync';
label.style.color = 'rgba(255,255,255,0.80)';
} else if (state === 'ready') {
arrowG.style.display = 'block';
arrowG.style.color = '#2ddf7a';
arrowG.style.transform = 'rotate(180deg)';
label.textContent = 'Release to sync';
label.style.color = '#2ddf7a';
sublabel.textContent = 'Let go';
} else if (state === 'syncing') {
arc.style.display = 'block';
arc.style.animation = 'ptrSpinArc 0.9s linear infinite';
dots.classList.add('visible');
label.textContent = 'Syncing…';
label.style.color = '#4da6ff';
sublabel.textContent = 'Fetching latest data';
} else if (state === 'done') {
checkG.style.display = 'block';
checkG.style.animation = 'ptrSuccessScale 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards';
label.textContent = 'Up to date';
label.style.color = '#2ddf7a';
}
if (state !== 'ready') arrowG.style.transform = '';
};
const showPill = (y) => {
const progress = Math.min(y / threshold, 1);
const eased = 1 - Math.pow(1 - progress, 2.2);
const top = -8 + eased * 56;
pill.style.top = Math.max(-8, top) + 'px';
const scale = 0.82 + eased * 0.18;
pill.style.transform = `translateX(-50%) scale(${scale.toFixed(3)})`;
};
const hidePill = () => {
pill.style.top = '-88px';
pill.style.transform = 'translateX(-50%) scale(0.88)';
};
window._ptrTouchStart = (e) => {
const anyOverlayOpen = document.querySelector('.factory-overlay[style*="flex"], .factory-overlay[style*="block"], .settings-overlay.active') !== null;
if (anyOverlayOpen) { isPulling = false; return; }
if (window.scrollY === 0) {
startY = e.touches[0].clientY;
isPulling = true;
setState('pull');
} else { isPulling = false; }
};
window._ptrTouchMove = (e) => {
if (!isPulling) return;
const anyOverlayOpen = document.querySelector('.factory-overlay[style*="flex"], .factory-overlay[style*="block"], .settings-overlay.active') !== null;
if (anyOverlayOpen) { isPulling = false; return; }
const diff = e.touches[0].clientY - startY;
if (diff > 0 && window.scrollY === 0) {
e.preventDefault();
showPill(diff);
setState(diff > threshold ? 'ready' : 'pull');
}
};
window._ptrTouchEnd = async (e) => {
if (!isPulling) return;
const anyOverlayOpen = document.querySelector('.factory-overlay[style*="flex"], .factory-overlay[style*="block"], .settings-overlay.active') !== null;
if (anyOverlayOpen) { isPulling = false; hidePill(); return; }
const diff = e.changedTouches[0].clientY - startY;
if (diff > threshold && window.scrollY === 0) {
setState('syncing');
pill.style.top = '20px';
pill.style.transform = 'translateX(-50%) scale(1)';
if (navigator.vibrate) navigator.vibrate([12, 8, 20]);
await performOneClickSync(false);
setState('done');
if (navigator.vibrate) navigator.vibrate(18);
setTimeout(() => {
setState('idle');
setTimeout(hidePill, 350);
}, 1200);
} else {
hidePill();
}
isPulling = false;
};
document.addEventListener('touchstart', window._ptrTouchStart, { passive: true });
document.addEventListener('touchmove', window._ptrTouchMove, { passive: false });
document.addEventListener('touchend', window._ptrTouchEnd);
})();
(function registerRenderFunctions() {
if (typeof renderUnifiedTable === 'function') {
}
if (typeof renderCustomersTable === 'function') {
}
if (typeof renderEntityTable === 'function') {
}
if (typeof renderExpenseTable === 'function') {
}
if (typeof renderRepCustomerTable === 'function') {
}
})();
const ThemeManager = {
currentTheme: 'dark',
observers: new Set(),
init() {
const saved = localStorage.getItem('app_theme');
const systemPrefers = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
this.currentTheme = saved || systemPrefers;
this.apply();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
if (!localStorage.getItem('app_theme')) {
this.setTheme(e.matches ? 'dark' : 'light');
}
});
},
apply() {
document.documentElement.setAttribute('data-theme', this.currentTheme);
this.notifyObservers();
},
setTheme(theme) {
this.currentTheme = theme;
localStorage.setItem('app_theme', theme);
this.apply();
},
toggle() {
this.setTheme(this.currentTheme === 'dark' ? 'light' : 'dark');
},
observe(callback) {
this.observers.add(callback);
return () => this.observers.delete(callback);
},
notifyObservers() {
this.observers.forEach(cb => cb(this.currentTheme));
},
getVar(varName) {
return getComputedStyle(document.documentElement)
.getPropertyValue(`--${varName}`).trim();
}
};
const IncrementalRenderer = {
queue: [],
isRendering: false,
batchSize: 20,
enqueue(items, renderFunc, container) {
this.queue.push({ items, renderFunc, container });
if (!this.isRendering) {
this.processQueue();
}
},
async processQueue() {
this.isRendering = true;
while (this.queue.length > 0) {
const { items, renderFunc, container } = this.queue.shift();
container.innerHTML = '';
for (let i = 0; i < items.length; i += this.batchSize) {
const batch = items.slice(i, i + this.batchSize);
const fragment = document.createDocumentFragment();
batch.forEach(item => {
const element = renderFunc(item);
if (element) {
fragment.appendChild(element);
}
});
container.appendChild(fragment);
}
}
this.isRendering = false;
}
};
class VirtualScroller {
constructor(container, itemHeight, renderFunc) {
this.container = container;
this.itemHeight = itemHeight;
this.renderFunc = renderFunc;
this.items = [];
this.visibleRange = { start: 0, end: 0 };
this.setupScrollListener();
}
setItems(items) {
this.items = items;
this.render();
}
setupScrollListener() {
this._scrollHandler = () => {
this.updateVisibleRange();
this.render();
};
this.container.addEventListener('scroll', this._scrollHandler);
}
destroy() {
if (this._scrollHandler) {
this.container.removeEventListener('scroll', this._scrollHandler);
this._scrollHandler = null;
}
}
updateVisibleRange() {
const scrollTop = this.container.scrollTop;
const containerHeight = this.container.clientHeight;
const start = Math.floor(scrollTop / this.itemHeight);
const end = Math.ceil((scrollTop + containerHeight) / this.itemHeight);
this.visibleRange = { start, end };
}
render() {
const { start, end } = this.visibleRange;
const visibleItems = this.items.slice(start, end);
const fragment = document.createDocumentFragment();
visibleItems.forEach((item, index) => {
const element = this.renderFunc(item);
if (element) {
element.style.position = 'absolute';
element.style.top = `${(start + index) * this.itemHeight}px`;
fragment.appendChild(element);
}
});
this.container.innerHTML = '';
this.container.appendChild(fragment);
this.container.style.height = `${this.items.length * this.itemHeight}px`;
}
}
class ReactiveComponent {
constructor(element, config = {}) {
this.element = element;
this.state = config.initialState || {};
this.styleMap = config.styleMap || {};
this.listeners = new Map();
}
setState(newState) {
const oldState = { ...this.state };
this.state = { ...this.state, ...newState };
this.syncStyles();
this.notifyListeners(oldState, this.state);
}
syncStyles() {
Object.entries(this.styleMap).forEach(([stateKey, styles]) => {
if (this.state[stateKey]) {
Object.assign(this.element.style, styles);
}
});
}
on(event, callback) {
if (!this.listeners.has(event)) {
this.listeners.set(event, new Set());
}
this.listeners.get(event).add(callback);
}
notifyListeners(oldState, newState) {
const listeners = this.listeners.get('change');
if (listeners) {
listeners.forEach(cb => cb(newState, oldState));
}
}
}
const PerformanceMonitor = {
metrics: {
renderTime: [],
queryTime: [],
syncTime: []
},
startTimer(operation) {
return performance.now();
},
endTimer(operation, startTime) {
const duration = performance.now() - startTime;
if (this.metrics[operation]) {
this.metrics[operation].push(duration);
if (this.metrics[operation].length > 100) {
this.metrics[operation].shift();
}
}
return duration;
},
getAverages() {
const averages = {};
for (const [key, values] of Object.entries(this.metrics)) {
if (values.length > 0) {
averages[key] = values.reduce((a, b) => a + b, 0) / values.length;
}
}
return averages;
},
report() {
const averages = this.getAverages();
}
};
document.addEventListener('DOMContentLoaded', function() {
ThemeManager.init();
scheduleAutomaticCleanup();
setTimeout(() => validateAllDataOnStartup(), 2000);
if (window._connectionCheckInterval) clearInterval(window._connectionCheckInterval);
window._connectionCheckInterval = setInterval(() => {
if (isConnectionStale()) {
if (firebaseDB && currentUser && !isReconnecting) {
scheduleListenerReconnect();
}
}
}, 120000);
if (window._perfMonitorInterval) clearInterval(window._perfMonitorInterval);
window._perfMonitorInterval = setInterval(() => {
PerformanceMonitor.report();
}, 60000);
});
window.addEventListener('beforeunload', function() {
if (listenerReconnectTimer) {
clearTimeout(listenerReconnectTimer);
}
if (syncChannel) {
try {
syncChannel.close();
} catch (e) {
console.warn('Data validation encountered an error.', e);
}
}

if (typeof scrollRafId !== 'undefined' && scrollRafId !== null) {
cancelAnimationFrame(scrollRafId);
scrollRafId = null;
}
if (window._rafScrollHandler) {
window.removeEventListener('scroll', window._rafScrollHandler);
window._rafScrollHandler = null;
}

if (window._ptrTouchStart) { document.removeEventListener('touchstart', window._ptrTouchStart); window._ptrTouchStart = null; }
if (window._ptrTouchMove) { document.removeEventListener('touchmove', window._ptrTouchMove); window._ptrTouchMove = null; }
if (window._ptrTouchEnd) { document.removeEventListener('touchend', window._ptrTouchEnd); window._ptrTouchEnd = null; }

if (window._fbOfflineHandler) { window.removeEventListener('offline', window._fbOfflineHandler); window._fbOfflineHandler = null; }
if (window._fbVisibilityHandler) { document.removeEventListener('visibilitychange', window._fbVisibilityHandler); window._fbVisibilityHandler = null; }

if (window._tombstoneCleanupInterval) { clearInterval(window._tombstoneCleanupInterval); window._tombstoneCleanupInterval = null; }
if (window._syncUpdatesCleanupInterval) { clearInterval(window._syncUpdatesCleanupInterval); window._syncUpdatesCleanupInterval = null; }
if (window._connectionCheckInterval) { clearInterval(window._connectionCheckInterval); window._connectionCheckInterval = null; }
if (window._perfMonitorInterval) { clearInterval(window._perfMonitorInterval); window._perfMonitorInterval = null; }
});
