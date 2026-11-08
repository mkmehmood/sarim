import { dialogFeedback } from './feedback.js';

const TEXT_TYPES = ['', 'text', 'search', 'tel', 'number'];
const SYSTEM_MODES = ['email', 'url'];
const SYSTEM_SCOPES = '.auth-screen, #app-accounts-screen';
const NUMERIC_MODES = ['numeric', 'decimal', 'tel'];
const HOLD_DELAY_MS = 420;
const REPEAT_MS = 55;
const HIDE_DELAY_MS = 250;

export const FIELD_SELECTOR = 'input, textarea, [contenteditable=""], [contenteditable="true"]';
export const LETTER_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
export const PAD_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']];

const ICONS = {
  shift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V6"/><path d="M6 11.5l6-6 6 6"/></svg>',
  space: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10v5h16v-5"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 5H9l-6 7 6 7h11z"/><path d="M13 9.5l4 5M17 9.5l-4 5"/></svg>'
};

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
  if (attr(el, 'data-vk') === 'off') return true;
  if (el && typeof el.closest === 'function' && el.closest(SYSTEM_SCOPES)) return true;
  const mode = String(attr(el, 'data-vk-mode') || attr(el, 'inputmode') || '').toLowerCase();
  return SYSTEM_MODES.includes(mode);
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
    if (def.icon) b.innerHTML = ICONS[def.icon];
    else if (def.html) b.innerHTML = def.html;
    else b.textContent = def.text != null ? def.text : def.ch;
    return b;
  };

  const row = (keys, cls) => {
    const r = node('div', cls ? `vk-row ${cls}` : 'vk-row');
    keys.forEach((k) => r.appendChild(k));
    return r;
  };

  const letter = (ch) => key({ ch, letter: true, text: ch.toUpperCase(), cls: 'is-letter' });
  const back = () => key({ act: 'back', icon: 'back', aria: 'Backspace', cls: 'is-back' });
  const dot = () => key({ ch: '.', cls: 'is-dot' });

  const dotEl = node('span', 'vk-dot');
  const badge = node('span', 'vk-shift-badge d-none', 'SHIFT');
  const head = node('div', 'vk-head');
  head.appendChild(dotEl);
  head.appendChild(badge);

  const shiftKey = key({ act: 'shift', icon: 'shift', aria: 'Shift', cls: 'is-shift' });
  const lettersPane = node('div', 'vk-pane');
  lettersPane.setAttribute('data-vk-pane', 'letters');
  [
    head,
    row([...LETTER_ROWS[0]].map(letter)),
    row([...LETTER_ROWS[1]].map(letter)),
    row([...LETTER_ROWS[2]].map(letter)),
    row([shiftKey, key({ act: 'space', ch: ' ', html: `${ICONS.space}<span>Space</span>`, aria: 'Space', cls: 'is-space' }), dot(), back()])
  ].forEach((r) => lettersPane.appendChild(r));

  const padPane = node('div', 'vk-pane');
  padPane.setAttribute('data-vk-pane', 'pad');
  PAD_ROWS.forEach((r) => padPane.appendChild(row(r.map((ch) => key({ ch, cls: 'is-digit' })), 'is-pad')));
  padPane.appendChild(row([key({ ch: '00', cls: 'is-double' }), key({ ch: '0', cls: 'is-digit' }), dot(), back()], 'is-pad'));

  const dock = node('div', 'overlay vk-dock d-none');
  dock.id = 'vk-dock';
  dock.setAttribute('role', 'group');
  dock.setAttribute('aria-label', 'Keyboard');
  dock.appendChild(lettersPane);
  dock.appendChild(padPane);

  const panes = { letters: lettersPane, pad: padPane };
  let active = null;
  let shifted = false;
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

  const renderShift = () => {
    shiftKey.classList.toggle('is-on', shifted);
    badge.classList.toggle('d-none', !shifted);
    dock.classList.toggle('is-shifted', shifted);
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
    if (act === 'shift') {
      shifted = !shifted;
      renderShift();
    } else if (act === 'back') backspace();
    else if (k.hasAttribute('data-vk-letter')) insert(casedKey(ch, shifted));
    else if (ch != null) insert(ch);
    try { dialogFeedback('select'); } catch (_) {}
  };

  const onDown = (e) => {
    e.preventDefault();
    if (e.button > 0) return;
    const k = e.target && e.target.closest ? e.target.closest('.vk-key') : null;
    if (!k || !dock.contains(k)) return;
    press(k);
    if (k.getAttribute('data-vk-act') === 'back') startRepeat();
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
  doc.addEventListener('pointerup', stopRepeat, true);
  doc.addEventListener('pointercancel', stopRepeat, true);
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
    if (!isOpen() || !t || dock.contains(t)) return;
    if (t === active || isTextField(t) || (t.closest && t.closest('label'))) return;
    hide(true);
  }, true);
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
