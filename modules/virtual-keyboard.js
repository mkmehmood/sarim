import { dialogFeedback } from './feedback.js';

const TEXT_TYPES = ['', 'text', 'search', 'tel', 'number', 'email', 'url', 'password'];
const LOWER_TYPES = ['email', 'url', 'password'];
const NUMERIC_MODES = ['numeric', 'decimal', 'tel'];
const HOLD_DELAY_MS = 420;
const REPEAT_MS = 55;
const HIDE_DELAY_MS = 250;

export const FIELD_SELECTOR = 'input, textarea, [contenteditable=""], [contenteditable="true"]';
export const LETTER_ROWS = ['qwertyu', 'iopasdf', 'ghjklzx', 'cvbnm'];
export const PAD_KEYS = ['1', '2', '3', '-', '4', '5', '6', '.', '7', '8', '9'];

const attr = (el, name) => (el && typeof el.getAttribute === 'function' ? el.getAttribute(name) : null);
const typeOf = (el) => String((el && el.type) || attr(el, 'type') || '').toLowerCase();

export function isTextLike(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = String(el.tagName || '').toUpperCase();
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') return TEXT_TYPES.includes(typeOf(el));
  return el.isContentEditable === true;
}

export function usesSystemKeyboard(el) {
  return attr(el, 'data-vk') === 'off';
}

export function isTextField(el) {
  if (!isTextLike(el)) return false;
  if (el.disabled || el.readOnly) return false;
  return !usesSystemKeyboard(el);
}

export function layoutFor(el) {
  const forced = String(attr(el, 'data-layout') || '').toLowerCase();
  if (forced === 'numpad' || forced === 'qwerty') return forced;
  const mode = String(attr(el, 'data-vk-mode') || attr(el, 'inputmode') || '').toLowerCase();
  const type = typeOf(el);
  if (type === 'number' || type === 'tel' || NUMERIC_MODES.includes(mode)) return 'numpad';
  return 'qwerty';
}

export function typesLowerCase(el) {
  const type = typeOf(el);
  const orig = String(attr(el, 'data-vk-type') || '').toLowerCase();
  return LOWER_TYPES.includes(type) || LOWER_TYPES.includes(orig) || LOWER_TYPES.includes(String(attr(el, 'data-vk-mode') || attr(el, 'inputmode') || '').toLowerCase());
}

const SCROLL_HIDE_PX = 12;
export const CASE_MODES = ['caps', 'small', 'title'];

export function wantsCapital(value, caret) {
  const s = String(value == null ? '' : value);
  const i = caret == null ? s.length : caret;
  return i <= 0 || /\s/.test(s.charAt(i - 1));
}

export function casedKey(ch, shifted) {
  return shifted ? ch.toUpperCase() : ch.toLowerCase();
}

export function insertAt(value, start, end, text, max) {
  const s = start == null ? value.length : start;
  const e = end == null ? s : end;
  const room = max > 0 ? max - (value.length - (e - s)) : Infinity;
  const add = room >= text.length ? text : text.slice(0, Math.max(0, room));
  return { value: value.slice(0, s) + add + value.slice(e), caret: s + add.length };
}

export function deleteBack(value, start, end) {
  const s = start == null ? value.length : start;
  const e = end == null ? s : end;
  if (s !== e) return { value: value.slice(0, s) + value.slice(e), caret: s };
  if (s === 0) return { value, caret: 0 };
  return { value: value.slice(0, s - 1) + value.slice(s), caret: s - 1 };
}

export function sanitizeNumber(value) {
  let out = '';
  let dot = false;
  for (const ch of String(value)) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '.' && !dot) { out += ch; dot = true; }
    else if (ch === '-' && out === '') out += ch;
  }
  return out;
}

export function applyFieldPolicy(el) {
  if (!isTextLike(el) || usesSystemKeyboard(el)) return false;
  let changed = false;
  const current = attr(el, 'inputmode');
  if (current !== 'none') {
    if (current) el.setAttribute('data-vk-mode', current);
    el.setAttribute('inputmode', 'none');
    changed = true;
  }
  const type = typeOf(el);
  if (type === 'number' || type === 'tel') {
    el.setAttribute('data-vk-type', type);
    if (!attr(el, 'data-vk-mode')) el.setAttribute('data-vk-mode', type === 'tel' ? 'tel' : 'decimal');
    el.setAttribute('type', 'text');
    changed = true;
  }
  return changed;
}

let controller = null;

export function installVirtualKeyboard(opts = {}) {
  if (controller) return controller;
  const doc = opts.doc || document;
  const win = doc.defaultView || window;
  const root = doc.documentElement;
  if (!opts.force && !root.classList.contains('is-android')) return null;
  const hideNative = typeof opts.hideNative === 'function' ? opts.hideNative : () => {};

  const node = (tag, cls, text) => {
    const n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  const key = (def) => {
    const b = node('button', `btn btn-theme vk-key${def.cls ? ` ${def.cls}` : ''}`);
    b.type = 'button';
    b.tabIndex = -1;
    b.setAttribute('data-feedback', 'manual');
    if (def.act) b.setAttribute('data-vk-act', def.act);
    if (def.ch != null) b.setAttribute('data-vk-ch', def.ch);
    if (def.letter) b.setAttribute('data-vk-letter', def.ch);
    if (def.aria) b.setAttribute('aria-label', def.aria);
    if (def.html) b.innerHTML = def.html;
    else b.textContent = def.text != null ? def.text : def.ch;
    return b;
  };

  const row = (keys, cls) => {
    const r = node('div', cls ? `vk-row ${cls}` : 'vk-row');
    keys.forEach((k) => r.appendChild(k));
    return r;
  };

  const letter = (ch) => key({ ch, letter: true, text: ch.toUpperCase(), cls: 'is-letter' });
  const back = () => key({ act: 'back', text: 'DEL', aria: 'Backspace', cls: 'is-back' });
  const dot = () => key({ ch: '.', cls: 'is-dot' });

  const lettersPane = node('div', 'vk-pane');
  lettersPane.setAttribute('data-vk-pane', 'letters');
  LETTER_ROWS.forEach((r) => lettersPane.appendChild(row([...r].map(letter))));
  lettersPane.appendChild(row([dot(), key({ act: 'space', ch: ' ', text: 'space', aria: 'Space', cls: 'is-space' }), back()], 'is-bottom'));

  const padPane = node('div', 'vk-pane');
  padPane.setAttribute('data-vk-pane', 'pad');
  PAD_KEYS.forEach((ch) => padPane.appendChild(key({ ch, cls: /\d/.test(ch) ? 'is-digit' : 'is-sym' })));
  padPane.appendChild(key({ act: 'back', text: 'DEL', aria: 'Backspace', cls: 'is-back is-tall' }));
  padPane.appendChild(key({ ch: '00', cls: 'is-double' }));
  padPane.appendChild(key({ ch: '0', cls: 'is-digit is-zero' }));

  const dock = node('div', 'overlay vk-dock d-none');
  dock.id = 'vk-dock';
  dock.setAttribute('role', 'group');
  dock.setAttribute('aria-label', 'Keyboard');
  dock.appendChild(lettersPane);
  dock.appendChild(padPane);

  const panes = { letters: lettersPane, pad: padPane };
  let active = null;
  let caseMode = 'caps';
  let caseHold = 0;
  let caseFired = false;
  let dotKeyDown = null;
  let spaceHold = 0;
  let spaceAdded = false;
  let hideTimer = 0;
  let holdTimer = 0;
  let repeatTimer = 0;

  const isOpen = () => !!active && !dock.classList.contains('d-none');

  const syncDropdown = () => {
    if (win.Dropdown && typeof win.Dropdown.reposition === 'function') win.Dropdown.reposition();
  };

  const measure = () => {
    const h = dock.offsetHeight || 0;
    root.style.setProperty('--vk-h', `${h}px`);
    win.__vkInset = h;
    syncDropdown();
  };

  const showPane = (name) => {
    Object.keys(panes).forEach((k) => panes[k].classList.toggle('d-none', k !== name));
    if (isOpen()) measure();
  };

  const upperNow = () => {
    if (!active || typesLowerCase(active)) return false;
    if (caseMode === 'caps') return true;
    if (caseMode === 'small') return false;
    let caret = null;
    try { caret = active.selectionStart; } catch (_) {}
    return wantsCapital(active.value, caret);
  };

  const syncCase = () => {
    const credential = !!active && typesLowerCase(active);
    dock.classList.toggle('is-lower', !upperNow());
    dock.setAttribute('data-vk-case', credential ? 'small' : caseMode);
  };

  const cycleCase = () => {
    caseMode = CASE_MODES[(CASE_MODES.indexOf(caseMode) + 1) % CASE_MODES.length];
    syncCase();
    try { dialogFeedback('select'); } catch (_) {}
  };

  const insert = (text) => {
    const t = active;
    if (!t || !t.isConnected) return;
    if (doc.activeElement !== t) t.focus({ preventScroll: true });
    let ok = false;
    try { ok = doc.execCommand('insertText', false, text); } catch (_) { ok = false; }
    if (ok) return;
    if (typeof t.value !== 'string') return;
    let start = null;
    let end = null;
    try { start = t.selectionStart; end = t.selectionEnd; } catch (_) {}
    const next = insertAt(t.value, start, end, text, Number(t.maxLength) || 0);
    t.value = next.value;
    try { t.setSelectionRange(next.caret, next.caret); } catch (_) {}
    t.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  };

  const backspace = () => {
    const t = active;
    if (!t || !t.isConnected) return;
    if (doc.activeElement !== t) t.focus({ preventScroll: true });
    let ok = false;
    try { ok = doc.execCommand('delete'); } catch (_) { ok = false; }
    if (ok) return;
    if (typeof t.value !== 'string') return;
    let start = null;
    let end = null;
    try { start = t.selectionStart; end = t.selectionEnd; } catch (_) {}
    const next = deleteBack(t.value, start, end);
    t.value = next.value;
    try { t.setSelectionRange(next.caret, next.caret); } catch (_) {}
    t.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
  };

  const stopRepeat = () => {
    win.clearTimeout(holdTimer);
    win.clearInterval(repeatTimer);
    holdTimer = 0;
    repeatTimer = 0;
  };

  const startRepeat = () => {
    stopRepeat();
    holdTimer = win.setTimeout(() => { repeatTimer = win.setInterval(backspace, REPEAT_MS); }, HOLD_DELAY_MS);
  };

  const hide = (blurField) => {
    win.clearTimeout(hideTimer);
    stopRepeat();
    const t = active;
    active = null;
    dock.classList.add('d-none');
    root.classList.remove('vk-open');
    root.style.removeProperty('--vk-h');
    win.__vkInset = 0;
    if (blurField && t && typeof t.blur === 'function') t.blur();
    syncDropdown();
  };

  const reveal = (field) => {
    if (!field || !field.isConnected || typeof field.getBoundingClientRect !== 'function') return;
    const r = field.getBoundingClientRect();
    const limit = win.innerHeight - (dock.offsetHeight || 0) - 12;
    if ((r.bottom > limit || r.top < 0) && typeof field.scrollIntoView === 'function') field.scrollIntoView({ block: 'center', inline: 'nearest' });
  };

  const open = (field) => {
    win.clearTimeout(hideTimer);
    hideNative();
    active = field;
    dock.classList.remove('d-none');
    root.classList.add('vk-open');
    syncCase();
    showPane(layoutFor(field) === 'numpad' ? 'pad' : 'letters');
    measure();
    win.requestAnimationFrame(() => {
      if (active !== field) return;
      measure();
      reveal(field);
    });
  };

  const press = (k) => {
    const act = k.getAttribute('data-vk-act');
    const ch = k.getAttribute('data-vk-ch');
    if (act === 'back') backspace();
    else if (k.hasAttribute('data-vk-letter')) insert(casedKey(ch, upperNow()));
    else if (ch != null) insert(ch);
    syncCase();
    try { dialogFeedback('select'); } catch (_) {}
  };

  const onDown = (e) => {
    e.preventDefault();
    if (e.button > 0) return;
    const k = e.target && e.target.closest ? e.target.closest('.vk-key') : null;
    if (!k || !dock.contains(k)) return;
    if (k.classList.contains('is-dot') && lettersPane.contains(k)) {
      dotKeyDown = k;
      caseFired = false;
      win.clearTimeout(caseHold);
      caseHold = win.setTimeout(() => { caseFired = true; cycleCase(); }, HOLD_DELAY_MS);
      return;
    }
    if (k.getAttribute('data-vk-act') === 'space') {
      const before = active ? String(active.value == null ? '' : active.value) : '';
      press(k);
      spaceAdded = !!active && String(active.value == null ? '' : active.value) !== before;
      win.clearTimeout(spaceHold);
      spaceHold = win.setTimeout(typeAt, HOLD_DELAY_MS);
      return;
    }
    press(k);
    if (k.getAttribute('data-vk-act') === 'back') startRepeat();
  };

  const typeAt = () => {
    spaceHold = 0;
    if (!active) return;
    if (spaceAdded) backspace();
    spaceAdded = false;
    insert('@');
    syncCase();
    try { dialogFeedback('select'); } catch (_) {}
  };

  const onUp = () => {
    stopRepeat();
    win.clearTimeout(spaceHold);
    win.clearTimeout(caseHold);
    const k = dotKeyDown;
    dotKeyDown = null;
    if (k && !caseFired) press(k);
    caseFired = false;
  };

  const onCancel = () => {
    stopRepeat();
    win.clearTimeout(spaceHold);
    win.clearTimeout(caseHold);
    dotKeyDown = null;
    caseFired = false;
  };

  const scheduleHide = () => {
    win.clearTimeout(hideTimer);
    hideTimer = win.setTimeout(() => {
      const a = doc.activeElement;
      if (a && isTextField(a)) return;
      hide(false);
    }, HIDE_DELAY_MS);
  };

  const sweep = (n) => {
    if (!n || n.nodeType !== 1) return;
    applyFieldPolicy(n);
    if (n.querySelectorAll) n.querySelectorAll(FIELD_SELECTOR).forEach(applyFieldPolicy);
  };

  dock.addEventListener('pointerdown', onDown);
  dock.addEventListener('mousedown', (e) => e.preventDefault());
  dock.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); });
  doc.addEventListener('pointerup', onUp, true);
  doc.addEventListener('pointercancel', onCancel, true);
  doc.addEventListener('focusin', (e) => {
    const t = e.target;
    if (dock.contains(t)) return;
    if (isTextLike(t)) applyFieldPolicy(t);
    if (isTextField(t)) open(t);
    else scheduleHide();
  }, true);
  doc.addEventListener('focusout', scheduleHide, true);
  doc.addEventListener('input', (e) => {
    const t = e.target;
    if (attr(t, 'data-vk-type') !== 'number' || typeof t.value !== 'string') return;
    const clean = sanitizeNumber(t.value);
    if (clean !== t.value) t.value = clean;
  }, true);
  doc.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || dock.contains(t) || !isTextField(t)) return;
    if (isOpen() && active === t) return;
    applyFieldPolicy(t);
    open(t);
  }, true);
  let downTarget = null;
  doc.addEventListener('pointerdown', (e) => { downTarget = e.target; }, true);
  doc.addEventListener('click', (e) => {
    const t = e.target;
    const from = downTarget;
    downTarget = null;
    if (!isOpen() || !t || dock.contains(t)) return;
    if (from && !dock.contains(from) && (isTextField(from) || (from.closest && from.closest('label')))) return;
    if (t === active || isTextField(t) || (t.closest && t.closest('label'))) return;
    hide(true);
  }, true);
  const scrollsOutside = (t) => !!t && !dock.contains(t) && !(t.closest && t.closest('.dd-layer')) && t !== active && !isTextField(t);
  let touchStart = null;
  doc.addEventListener('touchstart', (e) => {
    const p = e.touches && e.touches[0];
    touchStart = p && isOpen() ? { x: p.clientX, y: p.clientY, t: e.target } : null;
  }, { capture: true, passive: true });
  doc.addEventListener('touchmove', (e) => {
    const p = e.touches && e.touches[0];
    if (!touchStart || !p || !isOpen()) return;
    if (Math.max(Math.abs(p.clientY - touchStart.y), Math.abs(p.clientX - touchStart.x)) < SCROLL_HIDE_PX) return;
    const t = touchStart.t;
    touchStart = null;
    if (scrollsOutside(t)) hide(true);
  }, { capture: true, passive: true });
  ['touchend', 'touchcancel'].forEach((n) => doc.addEventListener(n, () => { touchStart = null; }, true));
  doc.addEventListener('wheel', (e) => { if (isOpen() && scrollsOutside(e.target)) hide(true); }, { capture: true, passive: true });
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) hide(true); });
  win.addEventListener('resize', () => { if (isOpen()) measure(); });

  const start = () => {
    doc.body.appendChild(dock);
    sweep(root);
    new win.MutationObserver((list) => {
      list.forEach((m) => {
        if (m.type === 'attributes') applyFieldPolicy(m.target);
        else m.addedNodes.forEach(sweep);
      });
    }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['inputmode', 'type'] });
    if (isTextField(doc.activeElement)) open(doc.activeElement);
  };

  if (doc.body) start();
  else doc.addEventListener('DOMContentLoaded', start, { once: true });

  controller = { isOpen, hide: () => hide(true), open };
  win.VirtualKeyboard = controller;
  return controller;
}
