import { dialogFeedback } from './feedback.js';

const TEXT_TYPES = ['', 'text', 'search', 'tel', 'number', 'email', 'url', 'password'];
const LOWER_TYPES = ['email', 'url', 'password'];
const NUMERIC_MODES = ['numeric', 'decimal', 'tel'];
const HOLD_DELAY_MS = 420;
const REPEAT_MS = 55;
const HIDE_DELAY_MS = 250;

export const FIELD_SELECTOR = 'input, textarea, [contenteditable=""], [contenteditable="true"]';
export const LETTER_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
export const PAD_OPS = ['+', '-', '×', '÷'];
export const PAD_DIGITS = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']];
export const PAD_SIDE = ['%', 'space', 'back'];
export const PAD_BOTTOM = ['letters', 'symbols', '0', '00', '=', '.', 'enter'];
export const SYMBOL_ROWS = ['1234567890', '@#$_&-+()/', '*"\':;!?~'];
export const TOOLS = [
  { act: 'paste', icon: 'clipboard', aria: 'Paste' },
  { act: 'selectall', icon: 'notes', aria: 'Select all' },
  { act: 'code', icon: 'code', aria: 'Code', off: true },
  { act: 'voice', icon: 'mic', aria: 'Voice typing', off: true },
  { act: 'translate', icon: 'translate', aria: 'Translate', off: true },
  { act: 'settings', icon: 'gear', aria: 'Keyboard settings', off: true },
  { act: 'adjust', icon: 'sliders', aria: 'Adjust', off: true }
];
const ICONS = {
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94z"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  notes: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4"/>',
  translate: '<path d="m5 8 6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  sliders: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
  shift: '<path d="m5 12 7-7 7 7M12 19V5"/>',
  backspace: '<path d="M20 5H9l-7 7 7 7h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m18 9-6 6M12 9l6 6"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
  enter: '<path d="M20 4v7a4 4 0 0 1-4 4H4M9 10l-5 5 5 5"/>',
  keyboard: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01M8 12h.01M12 12h.01M16 12h.01M7 16h10"/>',
  space: '<path d="M4 10v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
  digits: '<path d="M6 5h.01M12 5h.01M18 5h.01M6 10h.01M12 10h.01M18 10h.01M6 15h.01M12 15h.01M18 15h.01M12 20h.01" stroke-width="3"/>'
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

  const icon = (name) => `<svg class="vk-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  const iconKey = (act, name, aria, cls) => key({ act, html: icon(name), aria, cls });
  const letter = (ch) => key({ ch, letter: true, text: ch.toUpperCase(), cls: 'is-letter' });
  const back = (cls) => iconKey('back', 'backspace', 'Backspace', `is-back is-fn ${cls || 'fx-15'}`);
  const shift = () => iconKey('shift', 'shift', 'Letter case', 'is-shift is-accent is-fn fx-15');
  const enter = (cls) => iconKey('enter', 'enter', 'Enter', `is-enter is-accent is-fn ${cls || 'fx-15'}`);
  const spaceKey = (cls) => key({ act: 'space', ch: ' ', text: 'English', aria: 'Space', cls: `is-space ${cls || 'fx-40'}` });
  const punct = (ch, cls) => key({ ch, cls: `is-fn ${cls || 'fx-10'}` });

  const toolsBar = node('div', 'vk-tools');
  const toolsPill = node('div', 'vk-tools-pill');
  toolsBar.appendChild(key({ act: 'tools', html: icon('wrench'), aria: 'Tools', cls: 'is-tools is-on' }));
  TOOLS.forEach((t) => {
    const b = key({ act: t.act, html: icon(t.icon), aria: t.aria, cls: t.off ? 'is-tool is-off' : 'is-tool' });
    if (t.off) b.setAttribute('aria-disabled', 'true');
    toolsPill.appendChild(b);
  });
  toolsBar.appendChild(toolsPill);

  const lettersPane = node('div', 'vk-pane');
  lettersPane.setAttribute('data-vk-pane', 'letters');
  lettersPane.appendChild(toolsBar);
  lettersPane.appendChild(row([...LETTER_ROWS[0]].map(letter)));
  lettersPane.appendChild(row([...LETTER_ROWS[1]].map(letter), 'is-home'));
  lettersPane.appendChild(row([shift(), ...[...LETTER_ROWS[2]].map(letter), back()]));
  lettersPane.appendChild(row([
    iconKey('pad', 'digits', 'Numbers', 'is-fn fx-12'),
    iconKey('system', 'globe', 'System keyboard', 'is-fn fx-12'),
    punct(',', 'fx-09'),
    spaceKey(),
    iconKey('emoji', 'smile', 'Emoji', 'is-fn fx-10'),
    punct('.', 'fx-09'),
    enter()
  ], 'is-bottom'));

  const padKey = (k) => {
    if (k === 'space') return key({ act: 'space', ch: ' ', html: icon('space'), aria: 'Space', cls: 'is-fn' });
    if (k === 'back') return back('fx-10');
    if (k === 'letters') return iconKey('letters', 'keyboard', 'Letters', 'is-fn fx-10');
    if (k === 'symbols') return key({ act: 'symbols', text: '!?#', aria: 'Symbols', cls: 'is-fn fx-085' });
    if (k === 'enter') return enter('fx-10');
    if (/^\d+$/.test(k)) return key({ ch: k, cls: `is-digit ${k === '00' ? 'fx-14' : k === '0' ? 'fx-085' : ''}` });
    if (k === '=' || k === '.') return punct(k, 'fx-07');
    return key({ ch: k, text: k === '-' ? '\u2212' : k, cls: 'is-fn' });
  };
  const column = (keys, cls) => {
    const c = node('div', `vk-col ${cls}`);
    keys.forEach((k) => c.appendChild(k));
    return c;
  };

  const padPane = node('div', 'vk-pane');
  padPane.setAttribute('data-vk-pane', 'pad');
  const padTop = node('div', 'vk-padtop');
  const padGrid = node('div', 'vk-col is-digits');
  PAD_DIGITS.forEach((r) => padGrid.appendChild(row(r.map(padKey), 'is-pad')));
  padTop.appendChild(column(PAD_OPS.map(padKey), 'is-ops'));
  padTop.appendChild(padGrid);
  padTop.appendChild(column(PAD_SIDE.map(padKey), 'is-side'));
  padPane.appendChild(padTop);
  padPane.appendChild(row(PAD_BOTTOM.map(padKey), 'is-pad is-bottom'));

  const symbolsPane = node('div', 'vk-pane');
  symbolsPane.setAttribute('data-vk-pane', 'symbols');
  symbolsPane.appendChild(row([...SYMBOL_ROWS[0]].map((c) => punct(c))));
  symbolsPane.appendChild(row([...SYMBOL_ROWS[1]].map((c) => punct(c))));
  symbolsPane.appendChild(row([...SYMBOL_ROWS[2]].map((c) => punct(c)), 'is-home'));
  symbolsPane.appendChild(row([
    key({ act: 'letters', text: 'ABC', aria: 'Letters', cls: 'is-fn fx-15' }),
    key({ act: 'pad', text: '123', aria: 'Numbers', cls: 'is-fn fx-15' }),
    punct(','),
    spaceKey('fx-30'),
    punct('.'),
    back(),
    enter()
  ], 'is-bottom'));

  const dock = node('div', 'overlay vk-dock d-none');
  dock.id = 'vk-dock';
  dock.setAttribute('role', 'group');
  dock.setAttribute('aria-label', 'Keyboard');
  dock.appendChild(lettersPane);
  dock.appendChild(padPane);
  dock.appendChild(symbolsPane);

  const panes = { letters: lettersPane, pad: padPane, symbols: symbolsPane };
  let active = null;
  let caseMode = 'caps';
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
    const box = field.closest && field.closest('.dlg-body');
    if (box && typeof field.scrollIntoView === 'function') { field.scrollIntoView({ block: 'nearest', inline: 'nearest' }); return; }
    const r = field.getBoundingClientRect();
    const limit = win.innerHeight - (dock.offsetHeight || 0) - 12;
    if ((r.bottom > limit || r.top < 0) && typeof field.scrollIntoView === 'function') field.scrollIntoView({ block: 'center', inline: 'nearest' });
  };

  const open = (field) => {
    win.clearTimeout(hideTimer);
    hideNative();
    active = field;
    dock.removeAttribute('inert');
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

  const doEnter = () => {
    const t = active;
    if (!t || !t.isConnected) return;
    if (String(t.tagName).toUpperCase() === 'TEXTAREA' || t.isContentEditable === true) { insert('\n'); return; }
    const init = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    let consumed = false;
    try { consumed = t.dispatchEvent(new win.KeyboardEvent('keydown', init)) === false; } catch (_) {}
    try { t.dispatchEvent(new win.KeyboardEvent('keyup', init)); } catch (_) {}
    if (consumed) return;
    if (t.form && typeof t.form.requestSubmit === 'function') { t.form.requestSubmit(); return; }
    hide(true);
  };

  const useSystemKeyboard = () => {
    const t = active;
    if (!t) return;
    t.setAttribute('data-vk', 'off');
    const mode = attr(t, 'data-vk-mode');
    if (mode) t.setAttribute('inputmode', mode); else t.removeAttribute('inputmode');
    hide(false);
    win.setTimeout(() => { if (t.isConnected) { try { t.blur(); t.focus(); } catch (_) {} } }, 60);
  };

  const paste = async () => {
    try {
      const text = await win.navigator.clipboard.readText();
      if (text) insert(text);
    } catch (_) {}
  };

  const selectAll = () => {
    const t = active;
    if (!t || !t.isConnected) return;
    if (doc.activeElement !== t) t.focus({ preventScroll: true });
    try { if (typeof t.select === 'function') t.select(); else doc.execCommand('selectAll'); } catch (_) {}
  };

  const toggleTools = (k) => {
    const hidden = toolsPill.classList.toggle('d-none');
    k.classList.toggle('is-on', !hidden);
    if (isOpen()) measure();
  };

  const press = (k) => {
    if (k.getAttribute('aria-disabled') === 'true') return;
    const act = k.getAttribute('data-vk-act');
    const ch = k.getAttribute('data-vk-ch');
    if (act === 'back') backspace();
    else if (act === 'shift') { cycleCase(); return; }
    else if (act === 'enter') doEnter();
    else if (act === 'pad' || act === 'letters' || act === 'symbols') { showPane(act); win.requestAnimationFrame(() => { if (isOpen()) reveal(active); }); }
    else if (act === 'system' || act === 'emoji') { useSystemKeyboard(); return; }
    else if (act === 'paste') paste();
    else if (act === 'selectall') selectAll();
    else if (act === 'tools') { toggleTools(k); return; }
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
  };

  const onCancel = onUp;

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
    if (from && !dock.contains(from) && isTextField(from)) {
      if (t !== from) { e.stopPropagation(); e.preventDefault(); }
      return;
    }
    if (from && !dock.contains(from) && from.closest && from.closest('label')) return;
    if (t === active || isTextField(t) || (t.closest && t.closest('label'))) return;
    const backdrop = isBackdrop(t);
    hide(true);
    if (backdrop) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isOpen()) return;
    hide(false);
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);
  const isBackdrop = (n) => {
    if (!n || n.nodeType !== 1) return false;
    if (n.matches && n.matches(MODAL_SELECTOR)) return true;
    try {
      const cs = win.getComputedStyle(n);
      const r = n.getBoundingClientRect();
      return cs.position === 'fixed' && r.width >= win.innerWidth - 1 && r.height >= win.innerHeight - 1;
    } catch (_) { return false; }
  };
  const MODAL_SELECTOR = '.dlg-overlay, [aria-modal="true"]';
  const isModalNode = (n) => n && n.nodeType === 1 && ((n.matches && n.matches(MODAL_SELECTOR)) || (n.querySelector && n.querySelector(MODAL_SELECTOR)));
  if (typeof win.MutationObserver === 'function' && doc.body) {
    new win.MutationObserver((records) => {
      if (!isOpen()) return;
      if (active && !active.isConnected) { hide(true); return; }
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (isModalNode(n) && !(active && n.contains(active))) { hide(true); return; }
        }
      }
    }).observe(doc.body, { childList: true });
  }
  doc.addEventListener('visibilitychange', () => { if (doc.hidden) hide(true); });
  win.addEventListener('resize', () => { if (isOpen()) { measure(); reveal(active); } });
  const usable = (f) => !!f && f.isConnected && !f.disabled && !f.readOnly && (typeof f.getClientRects !== 'function' || f.getClientRects().length > 0);

  const start = () => {
    doc.body.appendChild(dock);
    sweep(root);
    new win.MutationObserver((list) => {
      list.forEach((m) => {
        if (m.type === 'attributes') applyFieldPolicy(m.target);
        else m.addedNodes.forEach(sweep);
      });
      if (isOpen() && !usable(active)) hide(true);
    }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['inputmode', 'type', 'disabled', 'readonly', 'hidden', 'class', 'style'] });
    if (isTextField(doc.activeElement)) open(doc.activeElement);
  };

  if (doc.body) start();
  else doc.addEventListener('DOMContentLoaded', start, { once: true });

  controller = { isOpen, hide: (keepFocus) => hide(!keepFocus), open };
  win.VirtualKeyboard = controller;
  return controller;
}
