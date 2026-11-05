import { tapFeedback } from './feedback.js';

export const QWERTY_ROWS = Object.freeze([
  Object.freeze(['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P']),
  Object.freeze(['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L']),
  Object.freeze(['Z', 'X', 'C', 'V', 'B', 'N', 'M']),
]);
export const NUMPAD_ROWS = Object.freeze([
  Object.freeze(['1', '2', '3']),
  Object.freeze(['4', '5', '6']),
  Object.freeze(['7', '8', '9']),
]);
export const NUMPAD_BOTTOM = Object.freeze(['00', '0', '.']);
export const PREF_KEY = 'sarimVirtualKeyboard';

const NATIVE_TYPES = new Set(['email', 'password', 'url']);
const NON_TEXT_TYPES = new Set(['hidden', 'checkbox', 'radio', 'file', 'date', 'time', 'datetime-local', 'month', 'week', 'color', 'range', 'button', 'submit', 'reset', 'image']);
const NUMPAD_TYPES = new Set(['number', 'tel']);
const NUMPAD_MODES = new Set(['numeric', 'decimal', 'tel']);
const SPACE_ICON = '<svg class="vk-space-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7h8M8 17h8m-9-5h10"/></svg>';
const SHIFT_GLYPH = '\u2B06\uFE0E';
const BACK_GLYPH = '\u232B';

const attr = (el, name) => String((el.getAttribute && el.getAttribute(name)) || '').toLowerCase();

export function layoutForField(el, inputmode) {
  if (!el || !el.tagName) return null;
  const tag = String(el.tagName).toUpperCase();
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return null;
  if (el.disabled || el.readOnly) return null;
  if (attr(el, 'data-keyboard') === 'native') return null;
  if (attr(el, 'dir') === 'rtl' || attr(el, 'lang') === 'ur') return null;
  const type = tag === 'TEXTAREA' ? 'textarea' : (attr(el, 'type') || 'text');
  if (NON_TEXT_TYPES.has(type) || NATIVE_TYPES.has(type)) return null;
  const mode = String(inputmode != null ? inputmode : attr(el, 'inputmode')).toLowerCase();
  if (mode === 'email' || mode === 'url') return null;
  if (NUMPAD_TYPES.has(type) || NUMPAD_MODES.has(mode) || attr(el, 'data-layout') === 'numpad') return 'numpad';
  return 'qwerty';
}

export function keyText(key, shift) {
  if (key.length === 1 && /[a-z]/i.test(key)) return shift ? key.toUpperCase() : key.toLowerCase();
  return key;
}

export function insertManual(el, text) {
  const value = String(el.value || '');
  const start = el.selectionStart == null ? value.length : el.selectionStart;
  const end = el.selectionEnd == null ? value.length : el.selectionEnd;
  el.value = value.slice(0, start) + text + value.slice(end);
  if (typeof el.setSelectionRange === 'function' && el.selectionStart != null) el.setSelectionRange(start + text.length, start + text.length);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export function backspaceManual(el) {
  const value = String(el.value || '');
  const start = el.selectionStart == null ? value.length : el.selectionStart;
  const end = el.selectionEnd == null ? value.length : el.selectionEnd;
  if (start !== end) {
    el.value = value.slice(0, start) + value.slice(end);
    if (typeof el.setSelectionRange === 'function') el.setSelectionRange(start, start);
  } else if (start > 0) {
    el.value = value.slice(0, start - 1) + value.slice(start);
    if (typeof el.setSelectionRange === 'function' && el.selectionStart != null) el.setSelectionRange(start - 1, start - 1);
  } else {
    return;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function runCommand(el, name, arg) {
  try {
    if (typeof document.execCommand === 'function' && document.execCommand(name, false, arg)) return true;
  } catch (_) {}
  return false;
}

export function typeInto(el, text) {
  if (!runCommand(el, 'insertText', text)) insertManual(el, text);
}

export function eraseFrom(el) {
  if (!runCommand(el, 'delete')) backspaceManual(el);
}

const letterKey = (k) => `<button type="button" class="vk-key" data-key="${k}">${k}</button>`;
const numKey = (k) => `<button type="button" class="vk-key vk-num${k === '00' ? ' vk-double' : ''}" data-key="${k}">${k}</button>`;
const backKey = (cls) => `<button type="button" class="vk-key vk-back ${cls}" data-act="back" aria-label="Backspace">${BACK_GLYPH}</button>`;

export function dockHtml() {
  const letters = QWERTY_ROWS.map((row, i) => `<div class="vk-row vk-row-${i + 1}">${row.map(letterKey).join('')}</div>`).join('');
  const numbers = NUMPAD_ROWS.map((row) => `<div class="vk-row">${row.map(numKey).join('')}</div>`).join('');
  return `<div class="vk-head"><span class="vk-dot"></span><span id="vk-shift-badge" class="vk-shift-badge" hidden>SHIFT</span></div>`
    + `<div id="vk-qwerty" class="vk-qwerty">${letters}<div class="vk-row vk-row-bottom">`
    + `<button type="button" class="vk-key vk-shift" data-act="shift" aria-label="Shift" aria-pressed="false">${SHIFT_GLYPH}</button>`
    + `<button type="button" class="vk-key vk-space" data-key=" ">${SPACE_ICON}Space</button>`
    + `<button type="button" class="vk-key vk-period" data-key=".">.</button>`
    + `${backKey('vk-back-wide')}</div></div>`
    + `<div id="vk-numpad" class="vk-numpad" hidden>${numbers}<div class="vk-row">${NUMPAD_BOTTOM.map(numKey).join('')}${backKey('vk-back-num')}</div></div>`;
}

export function isAndroidApp() {
  const c = typeof window !== 'undefined' ? window.Capacitor : null;
  return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform() && typeof c.getPlatform === 'function' && c.getPlatform() === 'android');
}

export function isEnabled() {
  try { return localStorage.getItem(PREF_KEY) !== 'off'; } catch (_) { return true; }
}

export function pickLabel(on) {
  return on ? 'Virtual Keyboard: On' : 'Virtual Keyboard: Off';
}

let dock = null;
let active = null;
let shift = false;
let watch = 0;
let repeat = 0;
let repeatStart = 0;
const modes = new WeakMap();

function suppressNative(el) {
  if (!modes.has(el)) modes.set(el, el.hasAttribute('inputmode') ? el.getAttribute('inputmode') : null);
  el.setAttribute('inputmode', 'none');
}

function restoreNative(el) {
  if (!el || !modes.has(el)) return;
  const original = modes.get(el);
  modes.delete(el);
  if (original === null) el.removeAttribute('inputmode'); else el.setAttribute('inputmode', original);
}

function fieldLayout(el) {
  if (!dock || !isEnabled()) return null;
  return layoutForField(el, modes.has(el) ? modes.get(el) || '' : undefined);
}

function updateHeight() {
  if (!dock) return;
  document.documentElement.style.setProperty('--vk-height', `${dock.hidden ? 0 : dock.offsetHeight}px`);
}

function revealActive() {
  const el = active;
  if (!el) return;
  requestAnimationFrame(() => {
    updateHeight();
    requestAnimationFrame(() => { try { el.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (_) {} });
  });
}

function setShift(on) {
  shift = on;
  const btn = dock.querySelector('.vk-shift');
  btn.classList.toggle('is-on', on);
  btn.setAttribute('aria-pressed', String(on));
  dock.querySelector('#vk-shift-badge').hidden = !on;
}

function showLayout(layout) {
  dock.hidden = false;
  dock.querySelector('#vk-qwerty').hidden = layout !== 'qwerty';
  dock.querySelector('#vk-numpad').hidden = layout !== 'numpad';
  document.documentElement.classList.add('vk-open');
  if (!watch) watch = setInterval(checkOrphan, 800);
}

export function hideKeyboard() {
  if (!dock) return;
  restoreNative(active);
  active = null;
  dock.hidden = true;
  document.documentElement.classList.remove('vk-open');
  document.documentElement.style.setProperty('--vk-height', '0px');
  clearInterval(watch);
  watch = 0;
  stopRepeat();
}

function checkOrphan() {
  const a = document.activeElement;
  const focusedHere = a && (a === active || (dock && dock.contains(a)));
  if (!active || !active.isConnected || (!focusedHere && !fieldLayout(a))) hideKeyboard();
}

function activate(el, layout) {
  if (active && active !== el) restoreNative(active);
  suppressNative(el);
  active = el;
  showLayout(layout);
  revealActive();
}

function onFocusIn(e) {
  const el = e.target;
  if (dock && dock.contains(el)) return;
  const layout = fieldLayout(el);
  if (layout) activate(el, layout); else hideKeyboard();
}

function onPointerDownField(e) {
  const el = e.target;
  if (dock && !dock.contains(el) && fieldLayout(el)) suppressNative(el);
}

function onFocusOut() {
  setTimeout(checkOrphan, 160);
}

function press(key) {
  if (!active || !active.isConnected) { hideKeyboard(); return; }
  tapFeedback();
  active.focus({ preventScroll: true });
  typeInto(active, keyText(key, shift));
}

function back() {
  if (!active || !active.isConnected) { hideKeyboard(); return; }
  tapFeedback();
  active.focus({ preventScroll: true });
  eraseFrom(active);
}

function stopRepeat() {
  clearTimeout(repeatStart);
  clearInterval(repeat);
  repeatStart = 0;
  repeat = 0;
}

function onKeyDown(e) {
  const btn = e.target.closest && e.target.closest('.vk-key');
  if (!btn || !dock.contains(btn)) return;
  e.preventDefault();
  if (btn.dataset.act === 'shift') { tapFeedback(); setShift(!shift); return; }
  if (btn.dataset.act === 'back') {
    back();
    stopRepeat();
    repeatStart = setTimeout(() => { repeat = setInterval(back, 70); }, 420);
    return;
  }
  press(btn.dataset.key);
}

export function installVirtualKeyboard({ force = false } = {}) {
  if (dock) return dock;
  if (!force && !isAndroidApp()) return null;
  dock = document.createElement('div');
  dock.id = 'vk-dock';
  dock.className = 'vk-dock';
  dock.hidden = true;
  dock.innerHTML = dockHtml();
  document.body.appendChild(dock);
  dock.addEventListener('pointerdown', onKeyDown);
  dock.addEventListener('pointerup', stopRepeat);
  dock.addEventListener('pointercancel', stopRepeat);
  dock.addEventListener('pointerleave', stopRepeat);
  dock.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerdown', onPointerDownField, true);
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('focusout', onFocusOut, true);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideKeyboard(); });
  if (typeof ResizeObserver === 'function') new ResizeObserver(updateHeight).observe(dock);
  return dock;
}

export async function syncKeyboardButton() {
  const btn = document.getElementById('vk-toggle-btn');
  if (!btn) return;
  const show = !!dock;
  btn.classList.toggle('d-none', !show);
  const label = document.getElementById('vk-toggle-label');
  if (label && show) label.textContent = pickLabel(isEnabled());
}

export function toggleVirtualKeyboard() {
  if (!dock) return;
  const next = !isEnabled();
  try { localStorage.setItem(PREF_KEY, next ? 'on' : 'off'); } catch (_) {}
  if (!next) hideKeyboard();
  syncKeyboardButton();
}

if (typeof window !== 'undefined') {
  window.toggleVirtualKeyboard = toggleVirtualKeyboard;
  window.syncKeyboardButton = syncKeyboardButton;
  if (typeof document !== 'undefined') {
    const start = () => { installVirtualKeyboard(); syncKeyboardButton(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
}
