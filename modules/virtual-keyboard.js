import { tapFeedback } from './feedback.js';

export const QWERTY_ROWS = Object.freeze([
  Object.freeze(['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P']),
  Object.freeze(['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L']),
  Object.freeze(['Z', 'X', 'C', 'V', 'B', 'N', 'M']),
]);
export const NUMPAD_OPS = Object.freeze(['+', '-', '\u00d7', '\u00f7']);
export const NUMPAD_ROWS = Object.freeze([
  Object.freeze(['1', '2', '3']),
  Object.freeze(['4', '5', '6']),
  Object.freeze(['7', '8', '9']),
]);
export const NUMPAD_SIDE = Object.freeze(['%', 'space', 'back']);
export const NUMPAD_BOTTOM = Object.freeze(['letters', 'symbols', '0', '00', '=', '.', 'enter']);
export const SYMBOL_ROWS = Object.freeze(['1234567890', '@#$_&-+()/', '*"\':;!?~']);
export const TOOLS = Object.freeze([
  Object.freeze({ act: 'paste', icon: 'clipboard', aria: 'Paste' }),
  Object.freeze({ act: 'selectall', icon: 'notes', aria: 'Select all' }),
]);

const NON_TEXT_TYPES = new Set(['hidden', 'checkbox', 'radio', 'file', 'date', 'time', 'datetime-local', 'month', 'week', 'color', 'range', 'button', 'submit', 'reset', 'image']);
const NUMPAD_TYPES = new Set(['number', 'tel']);
const NUMPAD_MODES = new Set(['numeric', 'decimal', 'tel']);
const ICONS = {
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  notes: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/>',
  shift: '<path d="m5 12 7-7 7 7M12 19V5"/>',
  backspace: '<path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m18 9-6 6M12 9l6 6"/>',
  enter: '<path d="M20 4v7a4 4 0 0 1-4 4H4M9 10l-5 5 5 5"/>',
  keyboard: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
  space: '<path d="M4 10v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  digits: '<path d="M6 5h.01M12 5h.01M18 5h.01M6 10h.01M12 10h.01M18 10h.01M6 15h.01M12 15h.01M18 15h.01M12 20h.01" stroke-width="3"/>'
};

const attr = (el, name) => String((el.getAttribute && el.getAttribute(name)) || '').toLowerCase();

export function layoutForField(el, inputmode) {
  if (!el || !el.tagName) return null;
  const tag = String(el.tagName).toUpperCase();
  if (tag !== 'INPUT' && tag !== 'TEXTAREA') return null;
  if (el.disabled || el.readOnly) return null;
  const type = tag === 'TEXTAREA' ? 'textarea' : (attr(el, 'type') || 'text');
  if (NON_TEXT_TYPES.has(type)) return null;
  const mode = String(inputmode != null ? inputmode : attr(el, 'inputmode')).toLowerCase();
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

const icon = (name) => `<svg class="vk-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
const keyHtml = (cls, attrs, inner, aria) => `<button type="button" class="vk-key${cls ? ` ${cls}` : ''}" ${attrs}${aria ? ` aria-label="${aria}"` : ''}>${inner}</button>`;
const charKey = (k, cls, text) => keyHtml(cls, `data-key="${k}"`, text == null ? k : text);
const actKey = (act, inner, aria, cls, extra) => keyHtml(cls, `data-act="${act}"${extra ? ` ${extra}` : ''}`, inner, aria);
const letterKey = (k) => charKey(k, '');
const backKey = (cls) => actKey('back', icon('backspace'), 'Backspace', `vk-back ${cls}`);
const enterKey = (cls) => actKey('enter', icon('enter'), 'Enter', `vk-enter ${cls}`);
const spaceKey = (cls) => keyHtml(`vk-space ${cls}`, 'data-key=" "', 'English', 'Space');
const row = (cls, keys) => `<div class="vk-row${cls ? ` ${cls}` : ''}">${keys}</div>`;
const padKey = (k) => {
  if (k === 'space') return keyHtml('vk-fn', 'data-key=" "', icon('space'), 'Space');
  if (k === 'back') return backKey('vk-flat');
  if (k === 'letters') return actKey('letters', icon('keyboard'), 'Letters', 'vk-fn');
  if (k === 'symbols') return actKey('symbols', '!?#', 'Symbols', 'vk-fn vk-w085');
  if (k === 'enter') return enterKey('vk-w10');
  if (/^\d+$/.test(k)) return charKey(k, `vk-num${k === '00' ? ' vk-w14' : k === '0' ? ' vk-w085' : ''}`);
  if (k === '=' || k === '.') return charKey(k, 'vk-fn vk-w07');
  return charKey(k, 'vk-fn', k === '-' ? '\u2212' : k);
};

export function dockHtml() {
  const tools = `<div class="vk-tools">${TOOLS.map((t) => actKey(t.act, icon(t.icon), t.aria, 'vk-tool')).join('')}</div>`;
  const bottom = [
    actKey('pad', icon('digits'), 'Numbers', 'vk-fn vk-w15'),
    charKey(',', 'vk-fn vk-w10'),
    spaceKey('vk-w40'),
    charKey('.', 'vk-fn vk-w10'),
    enterKey('vk-w15'),
  ].join('');
  const letters = QWERTY_ROWS.map((r, i) => {
    let keys = r.map(letterKey).join('');
    if (i === 2) keys = actKey('shift', icon('shift'), 'Shift', 'vk-shift', 'aria-pressed="false"') + keys + backKey('vk-w15');
    return row(`vk-row-${i + 1}`, keys);
  }).join('');
  const digits = NUMPAD_ROWS.map((r) => row('', r.map(padKey).join(''))).join('');
  const symbols = SYMBOL_ROWS.map((r, i) => row(i === 2 ? 'vk-row-3' : '', [...r].map((c) => charKey(c, 'vk-fn')).join(''))).join('');
  return `<div id="vk-qwerty" class="vk-qwerty">${tools}${letters}${row('vk-row-bottom', bottom)}</div>`
    + `<div id="vk-numpad" class="vk-numpad" hidden><div class="vk-padtop"><div class="vk-col vk-ops">${NUMPAD_OPS.map(padKey).join('')}</div>`
    + `<div class="vk-col vk-digits">${digits}</div><div class="vk-col vk-side">${NUMPAD_SIDE.map(padKey).join('')}</div></div>`
    + `${row('vk-row-bottom', NUMPAD_BOTTOM.map(padKey).join(''))}</div>`
    + `<div id="vk-symbols" class="vk-symbols" hidden>${symbols}${row('vk-row-bottom', [
      actKey('letters', 'ABC', 'Letters', 'vk-fn vk-w15'), actKey('pad', '123', 'Numbers', 'vk-fn vk-w15'), charKey(',', 'vk-fn vk-w10'),
      spaceKey('vk-w30'), charKey('.', 'vk-fn vk-w10'), backKey('vk-w15'), enterKey('vk-w15')].join(''))}</div>`;
}

export function isAndroidApp() {
  const c = typeof window !== 'undefined' ? window.Capacitor : null;
  return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform() && typeof c.getPlatform === 'function' && c.getPlatform() === 'android');
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
  if (!dock) return null;
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
}

function showLayout(layout) {
  dock.hidden = false;
  dock.querySelector('#vk-qwerty').hidden = layout !== 'qwerty';
  dock.querySelector('#vk-numpad').hidden = layout !== 'numpad';
  dock.querySelector('#vk-symbols').hidden = layout !== 'symbols';
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

const PAGES = { letters: 'qwerty', pad: 'numpad', symbols: 'symbols' };

function enter() {
  if (!active || !active.isConnected) { hideKeyboard(); return; }
  tapFeedback();
  active.focus({ preventScroll: true });
  if (String(active.tagName).toUpperCase() === 'TEXTAREA') { typeInto(active, '\n'); return; }
  const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
  let consumed = false;
  try { consumed = !active.dispatchEvent(new KeyboardEvent('keydown', init)); } catch (_) {}
  try { active.dispatchEvent(new KeyboardEvent('keyup', init)); } catch (_) {}
  if (consumed) return;
  const form = active.form;
  if (form && typeof form.requestSubmit === 'function') { form.requestSubmit(); return; }
  const el = active;
  hideKeyboard();
  if (typeof el.blur === 'function') el.blur();
}

async function pasteClipboard() {
  if (!active || !active.isConnected) return;
  try {
    const text = await navigator.clipboard.readText();
    if (text) { active.focus({ preventScroll: true }); typeInto(active, text); }
  } catch (_) {}
}

function selectAll() {
  if (!active || !active.isConnected) return;
  active.focus({ preventScroll: true });
  try { active.select(); } catch (_) {}
}

function showPage(name) {
  if (!active) return;
  tapFeedback();
  showLayout(PAGES[name]);
  updateHeight();
  revealActive();
}

function onKeyDown(e) {
  const btn = e.target.closest && e.target.closest('.vk-key');
  if (!btn || !dock.contains(btn)) return;
  e.preventDefault();
  const act = btn.dataset.act;
  if (act === 'shift') { tapFeedback(); setShift(!shift); return; }
  if (act === 'back') {
    back();
    stopRepeat();
    repeatStart = setTimeout(() => { repeat = setInterval(back, 70); }, 420);
    return;
  }
  if (act === 'enter') { enter(); return; }
  if (PAGES[act]) { showPage(act); return; }
  if (act === 'paste') { tapFeedback(); pasteClipboard(); return; }
  if (act === 'selectall') { tapFeedback(); selectAll(); return; }
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

if (typeof window !== 'undefined') {
  if (typeof document !== 'undefined') {
    const start = () => { installVirtualKeyboard(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  }
}
