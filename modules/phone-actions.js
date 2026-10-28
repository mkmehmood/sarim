import { toInternationalDigits } from './phone-format.js';

const HOLD_MS = 500;
const MOVE_TOLERANCE = 10;
let timer = null;
let startX = 0;
let startY = 0;
let lastFired = 0;

function openWhatsApp(digits) {
  const now = Date.now();
  if (!digits || now - lastFired < 1000) return;
  lastFired = now;
  try { if (navigator.vibrate) navigator.vibrate(15); } catch (_) { }
  const web = () => window.open(`https://wa.me/${digits}`, '_blank');
  if (typeof window.nativeOpenWhatsAppChat === 'function') {
    Promise.resolve(window.nativeOpenWhatsAppChat(digits)).then((ok) => { if (!ok) web(); }).catch(web);
  } else {
    web();
  }
}

const phoneLink = (el) => (el && el.closest ? el.closest('a[data-wa]') : null);
const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };

export function installPhoneActions(doc = document) {
  doc.addEventListener('pointerdown', (e) => {
    const a = phoneLink(e.target);
    if (!a || (e.pointerType === 'mouse' && e.button !== 0)) return;
    startX = e.clientX; startY = e.clientY;
    cancel();
    timer = setTimeout(() => { timer = null; openWhatsApp(a.dataset.wa); }, HOLD_MS);
  }, true);
  doc.addEventListener('pointermove', (e) => {
    if (timer && (Math.abs(e.clientX - startX) > MOVE_TOLERANCE || Math.abs(e.clientY - startY) > MOVE_TOLERANCE)) cancel();
  }, true);
  ['pointerup', 'pointercancel', 'scroll'].forEach((n) => doc.addEventListener(n, cancel, true));
  doc.addEventListener('contextmenu', (e) => {
    const a = phoneLink(e.target);
    if (!a) return;
    e.preventDefault();
    cancel();
    openWhatsApp(a.dataset.wa);
  }, true);
  doc.addEventListener('click', (e) => {
    const a = phoneLink(e.target);
    if (a && Date.now() - lastFired < 1000) { e.preventDefault(); e.stopPropagation(); }
  }, true);
}

export { toInternationalDigits };
if (typeof document !== 'undefined') installPhoneActions();
