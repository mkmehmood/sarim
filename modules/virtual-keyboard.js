import { dialogFeedback } from './feedback.js';

const TEXT_TYPES = ['', 'text', 'search', 'tel', 'url', 'email', 'password', 'number'];
const NUMERIC_MODES = ['numeric', 'decimal', 'tel'];
const DOUBLE_TAP_MS = 350;
const HOLD_DELAY_MS = 420;
const REPEAT_MS = 55;
const HIDE_DELAY_MS = 250;

export const FIELD_SELECTOR = 'input, textarea, [contenteditable=""], [contenteditable="true"]';
export const LETTER_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
export const SYMBOL_ROWS = ['1234567890', '@#$_&-+()/', '*"\':;!?%='];
export const PAD_ROWS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']];

const ICONS = {
  shift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l8 9h-5v7H9v-7H4z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M13 9l4 6M17 9l-4 6"/></svg>',
  enter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6v6a2 2 0 0 1-2 2H5"/><path d="M9 10l-4 4 4 4"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'
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

export function isTextField(el) {
  if (!isTextLike(el)) return false;
  if (el.disabled || el.readOnly) return false;
  return attr(el, 'data-vk') !== 'off';
}

export function layoutFor(el) {
  const forced = String(attr(el, 'data-layout') || '').toLowerCase();
  if (forced === 'numpad' || forced === 'qwerty') return forced;
  const mode = String(attr(el, 'data-vk-mode') || attr(el, 'inputmode') || '').toLowerCase();
  const type = typeOf(el);
  if (type === 'number' || type === 'tel' || NUMERIC_MODES.includes(mode)) return 'numpad';
  return 'qwerty';
}

export function padExtra(el) {
  const type = typeOf(el);
  if (type === 'tel') return '+';
  if (type === 'number') {
    const min = attr(el, 'min');
    if (min === null || min === '' || Number(min) < 0) return '-';
  }
  return '';
}

export function labelFor(el) {
  const label = el && el.labels && el.labels[0];
  const text = label ? String(label.textContent || '').trim() : '';
  return text || attr(el, 'aria-label') || attr(el, 'placeholder') || '';
}

export function casedKey(ch, shift) {
  return shift === 'off' ? ch.toLowerCase() : ch.toUpperCase();
}

export function nextShift(state, gapMs) {
  if (state === 'lock') return 'off';
  if (state === 'once') return gapMs < DOUBLE_TAP_MS ? 'lock' : 'off';
  return 'once';
}

export function afterLetter(state) {
  return state === 'once' ? 'off' : state;
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

export function applyFieldPolicy(el) {
  if (!isTextLike(el) || attr(el, 'data-vk') === 'off') return false;
  const current = attr(el, 'inputmode');
  if (current === 'none') return false;
  if (current) el.setAttribute('data-vk-mode', current);
  el.setAttribute('inputmode', 'none');
  return true;
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
    const b = node('button', (def.main ? 'btn btn-main' : 'btn btn-theme') + ' vk-key' + (def.cls ? ` ${def.cls}` : ''));
    b.type = 'button';
    b.tabIndex = -1;
    b.setAttribute('data-feedback', 'manual');
    if (def.act) b.setAttribute('data-vk-act', def.act);
    if (def.ch != null) b.setAttribute('data-vk-ch', def.ch);
    if (def.letter) b.setAttribute('data-vk-letter', def.ch);
    if (def.icon) {
      b.innerHTML = ICONS[def.icon];
      b.setAttribute('aria-label', def.aria || def.icon);
    } else {
      b.textContent = def.text != null ? def.text : def.ch;
    }
    return b;
  };

  const row = (keys, cls) => {
    const r = node('div', cls ? `vk-row ${cls}` : 'vk-row');
    keys.forEach((k) => r.appendChild(k));
    return r;
  };

  const letter = (ch) => key({ ch, letter: true });
  const bottom = (text, act) => row([
    key({ act, text, cls: 'is-wide' }),
    key({ ch: ',' }),
    key({ act: 'space', ch: ' ', text: 'space', cls: 'is-space' }),
    key({ ch: '.' }),
    key({ act: 'enter', icon: 'enter', aria: 'Enter', main: true, cls: 'is-wide' })
  ]);

  const pane = (name, rows, cls) => {
    const p = node('div', cls ? `vk-pane ${cls}` : 'vk-pane');
    p.setAttribute('data-vk-pane', name);
    rows.forEach((r) => p.appendChild(r));
    return p;
  };

  const lettersPane = pane('letters', [
    row([...LETTER_ROWS[0]].map(letter)),
    row([...LETTER_ROWS[1]].map(letter), 'is-inset'),
    row([key({ act: 'shift', icon: 'shift', aria: 'Shift', cls: 'is-wide' }), ...[...LETTER_ROWS[2]].map(letter), key({ act: 'back', icon: 'back', aria: 'Backspace', cls: 'is-wide is-back' })]),
    bottom('?123', 'symbols')
  ]);

  const symbolsPane = pane('symbols', [
    row([...SYMBOL_ROWS[0]].map((ch) => key({ ch }))),
    row([...SYMBOL_ROWS[1]].map((ch) => key({ ch }))),
    row([...SYMBOL_ROWS[2]].map((ch) => key({ ch })).concat(key({ act: 'back', icon: 'back', aria: 'Backspace', cls: 'is-wide is-back' }))),
    bottom('ABC', 'letters')
  ]);

  const extraKey = key({ ch: '-', cls: 'is-extra' });
  const padKeys = [
    ...PAD_ROWS[0].map((ch) => key({ ch })),
    key({ act: 'back', icon: 'back', aria: 'Backspace', cls: 'is-back' }),
    ...PAD_ROWS[1].map((ch) => key({ ch })),
    key({ act: 'enter', icon: 'enter', aria: 'Enter', main: true, cls: 'is-enter' }),
    ...PAD_ROWS[2].map((ch) => key({ ch })),
    key({ ch: '00' }),
    key({ ch: '0' }),
    key({ ch: '.' }),
    extraKey
  ];
  const padPane = node('div', 'vk-pane vk-pad');
  padPane.setAttribute('data-vk-pane', 'pad');
  padKeys.forEach((k) => padPane.appendChild(k));

  const labelEl = node('span', 'vk-label');
  const bar = node('div', 'vk-bar');
  bar.appendChild(labelEl);
  bar.appendChild(key({ act: 'hide', icon: 'down', aria: 'Hide keyboard', cls: 'vk-hide' }));

  const dock = node('div', 'overlay vk-dock d-none');
  dock.id = 'vk-dock';
  dock.setAttribute('role', 'group');
  dock.setAttribute('aria-label', 'Keyboard');
  [bar, lettersPane, symbolsPane, padPane].forEach((p) => dock.appendChild(p));

  const panes = { letters: lettersPane, symbols: symbolsPane, pad: padPane };
  let active = null;
  let current = 'letters';
  let shift = 'off';
  let lastShiftAt = 0;
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

  const renderLetters = () => {
    lettersPane.querySelectorAll('[data-vk-letter]').forEach((b) => {
      b.textContent = casedKey(b.getAttribute('data-vk-letter'), shift);
    });
    const shiftBtn = lettersPane.querySelector('[data-vk-act="shift"]');
    if (shiftBtn) {
      shiftBtn.classList.toggle('is-on', shift !== 'off');
      shiftBtn.classList.toggle('is-lock', shift === 'lock');
    }
  };

  const showPane = (name) => {
    current = name;
    Object.keys(panes).forEach((k) => panes[k].classList.toggle('d-none', k !== name));
    renderLetters();
    if (isOpen()) measure();
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
    const changed = active !== field;
    active = field;
    if (changed) shift = 'off';
    const extra = padExtra(field);
    extraKey.classList.toggle('d-none', !extra);
    if (extra) {
      extraKey.setAttribute('data-vk-ch', extra);
      extraKey.textContent = extra;
    }
    labelEl.textContent = labelFor(field);
    dock.classList.remove('d-none');
    root.classList.add('vk-open');
    const wantPad = layoutFor(field) === 'numpad';
    showPane(wantPad ? 'pad' : (changed || current === 'pad' ? 'letters' : current));
    measure();
    win.requestAnimationFrame(() => {
      if (active !== field) return;
      measure();
      reveal(field);
    });
  };

  const enter = () => {
    const t = active;
    if (!t) return;
    const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    const proceed = t.dispatchEvent(new win.KeyboardEvent('keydown', init));
    t.dispatchEvent(new win.KeyboardEvent('keypress', init));
    t.dispatchEvent(new win.KeyboardEvent('keyup', init));
    if (!proceed) return;
    if (String(t.tagName).toUpperCase() === 'TEXTAREA') insert('\n');
    else hide(true);
  };

  const press = (k) => {
    const act = k.getAttribute('data-vk-act');
    const ch = k.getAttribute('data-vk-ch');
    if (act === 'shift') {
      const now = Date.now();
      shift = nextShift(shift, now - lastShiftAt);
      lastShiftAt = now;
      renderLetters();
    } else if (act === 'symbols') showPane('symbols');
    else if (act === 'letters') showPane('letters');
    else if (act === 'hide') hide(true);
    else if (act === 'enter') enter();
    else if (act === 'back') backspace();
    else if (k.hasAttribute('data-vk-letter')) {
      insert(casedKey(ch, shift));
      const after = afterLetter(shift);
      if (after !== shift) { shift = after; renderLetters(); }
    } else if (ch != null) insert(ch);
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
  dock.addEventListener('click', (e) => e.preventDefault());
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
