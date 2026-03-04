
if ('serviceWorker' in navigator) {
window.addEventListener('load', () => {
navigator.serviceWorker.register('./sw.js').then(reg => {
reg.update();
reg.onupdatefound = () => {
const installingWorker = reg.installing;
installingWorker.onstatechange = () => {
if (installingWorker.state === 'installed') {
if (navigator.serviceWorker.controller) {
// New SW waiting — tell it to skip waiting and take over immediately
if (reg.waiting) {
reg.waiting.postMessage({ type: 'SKIP_WAITING' });
}
}
}
};
};
}).catch(err => console.error('Service Worker Registration Failed', err));
navigator.serviceWorker.addEventListener('controllerchange', () => {
window.location.reload();
});
});
}
window.addEventListener('DOMContentLoaded', function() {
const urlParams = new URLSearchParams(window.location.search);
const action = urlParams.get('action');
if (!action) return;
const tabMap = { sales: 'sales', production: 'prod', calc: 'calc' };
const targetTab = tabMap[action];
if (!targetTab) return;
let attempts = 0;
const maxAttempts = 40;
const tryShowTab = () => {
if (typeof showTab === 'function') {
showTab(targetTab);
} else if (attempts < maxAttempts) {
attempts++;
setTimeout(tryShowTab, 100);
}
};
setTimeout(tryShowTab, 200);
});

