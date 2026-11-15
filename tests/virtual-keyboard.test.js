import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { readSource } from './_extract.js';
import { FIELD_SELECTOR, LETTER_ROWS, PAD_BOTTOM, PAD_DIGITS, PAD_OPS, PAD_SIDE, SYMBOL_ROWS, TOOLS, applyFieldPolicy, casedKey, deleteBack, insertAt, isTextField, layoutFor, sanitizeNumber, typesLowerCase, wantsCapital } from '../modules/virtual-keyboard.js';

const field = (attrs = {}, extra = {}) => {
  const map = new Map(Object.entries(attrs));
  const f = {
    nodeType: 1,
    tagName: attrs.tag || 'INPUT',
    type: attrs.type === undefined ? 'text' : attrs.type,
    getAttribute: (k) => (map.has(k) ? map.get(k) : null),
    setAttribute: (k, v) => {
      map.set(k, String(v));
      if (k === 'type') f.type = String(v);
    },
    removeAttribute: (k) => { map.delete(k); },
    closest: () => null,
    ...extra
  };
  return f;
};

const insideScreen = (selector) => ({ closest: (sel) => (sel.includes(selector) ? {} : null) });

describe('field rules', () => {
  it('opens for text, search, phone and number fields and for textareas', () => {
    for (const type of ['text', 'search', 'tel', 'number']) assert.equal(isTextField(field({ type })), true, type);
    assert.equal(isTextField(field({ tag: 'TEXTAREA', type: 'textarea' })), true);
  });
  it('uses the app keyboard for email, password and web address fields too', () => {
    for (const type of ['email', 'password', 'url']) assert.equal(isTextField(field({ type })), true, type);
    assert.equal(isTextField(field({ type: 'text', inputmode: 'email' })), true);
  });
  it('types credential fields in lower case', () => {
    for (const type of ['email', 'password', 'url']) assert.equal(typesLowerCase(field({ type })), true, type);
    assert.equal(typesLowerCase(field({ type: 'text', inputmode: 'email' })), true);
    assert.equal(typesLowerCase(field({ type: 'text' })), false);
  });
  it('uses the app keyboard on the login and accounts screens', () => {
    const login = field({ type: 'text' }, insideScreen('.auth-screen'));
    const accounts = field({ type: 'text' }, insideScreen('#app-accounts-screen'));
    for (const f of [login, accounts]) {
      assert.equal(isTextField(f), true);
      assert.equal(applyFieldPolicy(f), true);
      assert.equal(f.getAttribute('inputmode'), 'none');
    }
  });
  it('leaves pickers, files, checkboxes and hidden inputs alone', () => {
    for (const type of ['date', 'month', 'file', 'checkbox', 'radio', 'hidden', 'button', 'range', 'color']) assert.equal(isTextField(field({ type })), false, type);
  });
  it('skips disabled and read-only fields', () => {
    assert.equal(isTextField(field({}, { disabled: true })), false);
    assert.equal(isTextField(field({}, { readOnly: true })), false);
    assert.equal(isTextField(field({ 'data-vk': 'off' })), true);
  });
  it('chooses the numpad for number and tel fields, numeric modes and data-layout', () => {
    assert.equal(layoutFor(field({ type: 'number' })), 'numpad');
    assert.equal(layoutFor(field({ type: 'tel' })), 'numpad');
    assert.equal(layoutFor(field({ type: 'text', inputmode: 'decimal' })), 'numpad');
    assert.equal(layoutFor(field({ type: 'text', 'data-vk-mode': 'numeric', inputmode: 'none' })), 'numpad');
    assert.equal(layoutFor(field({ type: 'text', 'data-layout': 'numpad' })), 'numpad');
  });
  it('chooses the letters keyboard for everything else', () => {
    for (const type of ['text', 'search', 'url', '']) assert.equal(layoutFor(field({ type })), 'qwerty', type);
    assert.equal(layoutFor(field({ type: 'text', 'data-layout': 'qwerty' })), 'qwerty');
  });
  it('keeps the original input mode and then asks the system keyboard to stay away', () => {
    const f = field({ type: 'text', inputmode: 'decimal' });
    assert.equal(applyFieldPolicy(f), true);
    assert.equal(f.getAttribute('inputmode'), 'none');
    assert.equal(f.getAttribute('data-vk-mode'), 'decimal');
    assert.equal(applyFieldPolicy(f), false);
    const plain = field({ type: 'text' });
    applyFieldPolicy(plain);
    assert.equal(plain.getAttribute('inputmode'), 'none');
    assert.equal(plain.getAttribute('data-vk-mode'), null);
  });
  it('turns number fields into text fields, because Android ignores inputmode none on number inputs', () => {
    const n = field({ type: 'number', step: '0.001' });
    assert.equal(applyFieldPolicy(n), true);
    assert.equal(n.type, 'text');
    assert.equal(n.getAttribute('data-vk-type'), 'number');
    assert.equal(n.getAttribute('data-vk-mode'), 'decimal');
    assert.equal(n.getAttribute('inputmode'), 'none');
    assert.equal(layoutFor(n), 'numpad');
    assert.equal(applyFieldPolicy(n), false);
    const d = field({ type: 'number', inputmode: 'numeric' });
    applyFieldPolicy(d);
    assert.equal(d.getAttribute('data-vk-mode'), 'numeric');
    assert.equal(d.type, 'text');
  });
  it('turns phone fields into text fields that still open the numpad', () => {
    const t = field({ type: 'tel', inputmode: 'tel' });
    assert.equal(applyFieldPolicy(t), true);
    assert.equal(t.type, 'text');
    assert.equal(t.getAttribute('data-vk-type'), 'tel');
    assert.equal(t.getAttribute('data-vk-mode'), 'tel');
    assert.equal(layoutFor(t), 'numpad');
    const bare = field({ type: 'tel' });
    applyFieldPolicy(bare);
    assert.equal(bare.getAttribute('data-vk-mode'), 'tel');
  });
  it('converts a field whose type becomes number later', () => {
    const f = field({ type: 'text', inputmode: 'none' });
    assert.equal(applyFieldPolicy(f), false);
    f.setAttribute('type', 'number');
    assert.equal(applyFieldPolicy(f), true);
    assert.equal(f.type, 'text');
    assert.equal(layoutFor(f), 'numpad');
  });
  it('every text field uses the app keyboard; only date pickers are left alone', () => {
    const mail = field({ type: 'text', inputmode: 'email' });
    assert.equal(applyFieldPolicy(mail), true);
    assert.equal(mail.getAttribute('inputmode'), 'none');
    assert.equal(mail.getAttribute('data-vk-mode'), 'email');
    assert.equal(applyFieldPolicy(field({ type: 'password' })), true);
    assert.equal(applyFieldPolicy(field({ type: 'email' })), true);
    assert.equal(applyFieldPolicy(field({ type: 'date' })), false);
    assert.equal(applyFieldPolicy(field({ type: 'text', 'data-vk': 'off' })), true);
  });
  it('selects every kind of text field in the page', () => {
    assert.match(FIELD_SELECTOR, /input/);
    assert.match(FIELD_SELECTOR, /textarea/);
    assert.match(FIELD_SELECTOR, /contenteditable/);
  });
});

describe('number filtering', () => {
  it('keeps digits, one decimal point and a leading minus', () => {
    assert.equal(sanitizeNumber('12.5'), '12.5');
    assert.equal(sanitizeNumber('a1b2.c3.4'), '12.34');
    assert.equal(sanitizeNumber('-5'), '-5');
    assert.equal(sanitizeNumber('5-3'), '53');
    assert.equal(sanitizeNumber('--7'), '-7');
    assert.equal(sanitizeNumber('1,000'), '1000');
    assert.equal(sanitizeNumber(''), '');
    assert.equal(sanitizeNumber(null), '');
  });
});

describe('typing rules', () => {
  it('has exactly the rows from the uploaded layouts', () => {
    assert.deepEqual(LETTER_ROWS, ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']);
    assert.deepEqual(PAD_OPS, ['+', '-', '×', '÷']);
    assert.deepEqual(PAD_DIGITS, [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]);
    assert.deepEqual(PAD_SIDE, ['%', 'space', 'back']);
    assert.deepEqual(PAD_BOTTOM, ['letters', 'symbols', '0', '00', '=', '.', 'enter']);
    assert.equal(SYMBOL_ROWS.length, 3);
    assert.equal(TOOLS.length, 2);
  });
  it('capitalises at the start of a field and after a space', () => {
    assert.equal(wantsCapital('', 0), true);
    assert.equal(wantsCapital('Ali ', 4), true);
    assert.equal(wantsCapital('Ali', 3), false);
    assert.equal(wantsCapital('Ali', null), false);
  });
  it('types upper case when asked and lower case otherwise', () => {
    assert.equal(casedKey('A', false), 'a');
    assert.equal(casedKey('a', true), 'A');
  });
  it('inserts at the caret, replaces a selection and respects maxlength', () => {
    assert.deepEqual(insertAt('abcd', 2, 2, 'X', 0), { value: 'abXcd', caret: 3 });
    assert.deepEqual(insertAt('abcd', 1, 3, 'XY', 0), { value: 'aXYd', caret: 3 });
    assert.deepEqual(insertAt('abcd', null, null, 'Z', 0), { value: 'abcdZ', caret: 5 });
    assert.deepEqual(insertAt('abcd', 4, 4, 'Z', 4), { value: 'abcd', caret: 4 });
    assert.deepEqual(insertAt('abc', 3, 3, 'XYZ', 5), { value: 'abcXY', caret: 5 });
  });
  it('backspace removes one character or the selection', () => {
    assert.deepEqual(deleteBack('abcd', 3, 3), { value: 'abd', caret: 2 });
    assert.deepEqual(deleteBack('abcd', 1, 3), { value: 'ad', caret: 1 });
    assert.deepEqual(deleteBack('abcd', 0, 0), { value: 'abcd', caret: 0 });
    assert.deepEqual(deleteBack('abcd', null, null), { value: 'abc', caret: 3 });
  });
});

class Node {
  constructor(tag) {
    this.nodeType = 1;
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.parent = null;
    this.attrs = new Map();
    this.listeners = {};
    this.className = '';
    this.textContent = '';
    this.isConnected = true;
    this.offsetHeight = 230;
  }

  get classList() {
    const self = this;
    const tokens = () => self.className.split(/\s+/).filter(Boolean);
    return {
      add: (...c) => { self.className = [...new Set([...tokens(), ...c])].join(' '); },
      remove: (...c) => { self.className = tokens().filter((t) => !c.includes(t)).join(' '); },
      contains: (c) => tokens().includes(c),
      toggle(c, force) {
        const on = force === undefined ? !tokens().includes(c) : !!force;
        if (on) this.add(c); else this.remove(c);
        return on;
      }
    };
  }

  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  appendChild(c) { c.parent = this; this.children.push(c); return c; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }

  descendants() {
    return this.children.flatMap((c) => [c, ...c.descendants()]);
  }

  matches(sel) {
    const attrSel = sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (attrSel) return this.attrs.has(attrSel[1]) && (attrSel[2] === undefined || this.attrs.get(attrSel[1]) === attrSel[2]);
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    return false;
  }

  querySelectorAll(sel) { return this.descendants().filter((n) => n.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  contains(n) { return n === this || this.descendants().includes(n); }

  closest(sel) {
    for (let n = this; n; n = n.parent) if (n.matches(sel)) return n;
    return null;
  }
}

function harness(opts = {}) {
  const timers = [];
  const calls = { reposition: 0, exec: [] };
  const body = new Node('body');
  const classes = new Set(opts.android === false ? [] : ['is-android']);
  const props = new Map();
  const docListeners = {};
  const documentElement = {
    nodeType: 1,
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    style: { setProperty: (k, v) => props.set(k, v), removeProperty: (k) => props.delete(k) },
    querySelectorAll: () => opts.fields || []
  };
  class Ev {
    constructor(type, init = {}) {
      this.type = type;
      Object.assign(this, init);
      this.defaultPrevented = false;
    }
    preventDefault() { this.defaultPrevented = true; }
  }
  const win = {
    innerHeight: 800,
    requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn) => { timers.push({ fn, kind: 'timeout' }); return timers.length; },
    clearTimeout: () => {},
    setInterval: (fn) => { timers.push({ fn, kind: 'interval' }); return timers.length; },
    clearInterval: () => {},
    addEventListener: () => {},
    MutationObserver: class { observe() {} },
    InputEvent: Ev,
    KeyboardEvent: Ev,
    Dropdown: { reposition: () => { calls.reposition += 1; } }
  };
  const doc = {
    defaultView: win,
    documentElement,
    body,
    hidden: false,
    activeElement: null,
    createElement: (tag) => new Node(tag),
    addEventListener: (type, fn) => { (docListeners[type] = docListeners[type] || []).push(fn); },
    execCommand: (cmd, _ui, val) => {
      calls.exec.push([cmd, val]);
      if (opts.execFails) return false;
      const a = doc.activeElement;
      if (cmd === 'insertText') a.value += val;
      if (cmd === 'delete') a.value = a.value.slice(0, -1);
      return true;
    }
  };
  win.document = doc;
  return { doc, win, body, classes, props, timers, calls, docListeners, Ev };
}

let seq = 0;
async function boot(opts = {}) {
  const h = harness(opts);
  const mod = await import(`../modules/virtual-keyboard.js?case=${seq += 1}`);
  const hidden = [];
  const kb = mod.installVirtualKeyboard({ doc: h.doc, hideNative: () => hidden.push(1), force: opts.force });
  const dock = h.body.children[0];
  const pane = (name) => dock.querySelector(`[data-vk-pane="${name}"]`);
  const keyByCh = (container, ch) => container.querySelectorAll('[data-vk-ch]').find((k) => k.getAttribute('data-vk-ch') === ch);
  const act = (name) => dock.querySelector(`[data-vk-act="${name}"]`);
  const down = (k) => dock.listeners.pointerdown[0]({ target: k, button: 0, preventDefault() { this.prevented = true; } });
  const input = (attrs = {}, extra = {}) => {
    const f = field(attrs, { value: '', isConnected: true, labels: [], events: [], blurred: false, getBoundingClientRect: () => ({ top: 100, bottom: 140 }), dispatchEvent(e) { this.events.push(e); return !e.defaultPrevented; }, focus() { h.doc.activeElement = this; }, blur() { this.blurred = true; if (h.doc.activeElement === this) h.doc.activeElement = null; }, ...extra });
    return f;
  };
  const focus = (f) => {
    h.doc.activeElement = f;
    h.docListeners.focusin.forEach((fn) => fn({ target: f }));
  };
  const isHidden = () => dock.classList.contains('d-none');
  return { ...h, kb, dock, pane, keyByCh, act, down, input, focus, isHidden, hidden, mod };
}

describe('virtual keyboard in the Android app', () => {
  const rowsOf = (p) => p.children.filter((c) => c.classList.contains('vk-row'));
  const keysOf = (r) => r.children.map((k) => k.getAttribute('data-vk-ch') ?? k.getAttribute('data-vk-act'));

  it('does nothing outside the Android app', async () => {
    const t = await boot({ android: false });
    assert.equal(t.kb, null);
    assert.equal(t.body.children.length, 0);
  });

  it('is built from the app surface and buttons and stays hidden until a field is focused', async () => {
    const t = await boot();
    assert.equal(t.dock.id, 'vk-dock');
    assert.ok(t.dock.classList.contains('overlay'));
    assert.ok(t.isHidden());
    const all = t.dock.querySelectorAll('.vk-key');
    assert.ok(all.every((k) => /^btn btn-theme vk-key/.test(k.className)));
    assert.ok(all.every((k) => k.getAttribute('data-feedback') === 'manual'));
  });

  it('letters layout matches the reference: paste and select-all row, QWERTY 10/9/7, shift and backspace, then the bottom row', async () => {
    const t = await boot();
    const L = t.pane('letters');
    const rows = rowsOf(L);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0].children.map((k) => k.getAttribute('data-vk-ch')), [...'qwertyuiop']);
    assert.deepEqual(rows[1].children.map((k) => k.getAttribute('data-vk-ch')), [...'asdfghjkl']);
    assert.ok(rows[1].classList.contains('is-home'));
    assert.deepEqual(keysOf(rows[2]), ['shift', ...'zxcvbnm', 'back']);
    assert.deepEqual(keysOf(rows[3]), ['pad', ',', ' ', '.', 'enter']);
    assert.deepEqual(L.querySelectorAll('[data-vk-letter]').map((k) => k.textContent).join(''), 'QWERTYUIOPASDFGHJKLZXCVBNM');
    assert.equal(t.act('space').textContent, 'English');
    assert.ok(t.act('shift').classList.contains('is-accent'));
    assert.ok(t.act('enter').classList.contains('is-accent'));
  });

  it('has only the two working tools (paste, select all) above the letters, and no dead keys', async () => {
    const t = await boot();
    const bar = t.pane('letters').querySelector('.vk-tools');
    assert.deepEqual(bar.children.map((k) => k.getAttribute('data-vk-act')), ['paste', 'selectall']);
    assert.equal(t.dock.querySelectorAll('[aria-disabled="true"]').length, 0);
    for (const gone of ['system', 'emoji', 'tools', 'voice', 'code', 'translate', 'settings', 'adjust']) assert.equal(t.act(gone), null, gone);
  });

  it('numpad layout matches the reference: + - x / on the left, 1-9, % space and backspace on the right, then the bottom row', async () => {
    const t = await boot();
    const pad = t.pane('pad');
    const col = (cls) => pad.querySelector(`.${cls}`);
    assert.deepEqual(col('is-ops').children.map((k) => k.getAttribute('data-vk-ch')), ['+', '-', '×', '÷']);
    assert.equal(col('is-ops').children[1].textContent, '\u2212');
    assert.deepEqual(col('is-digits').children.map(keysOf), [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]);
    assert.deepEqual(col('is-side').children.map((k) => k.getAttribute('data-vk-ch') ?? k.getAttribute('data-vk-act')), ['%', ' ', 'back']);
    const bottom = pad.children.find((c) => c.classList.contains('is-bottom'));
    assert.deepEqual(keysOf(bottom), ['letters', 'symbols', '0', '00', '=', '.', 'enter']);
    assert.equal(bottom.children[1].textContent, '!?#');
    assert.ok(bottom.children[6].classList.contains('is-accent'));
  });

  it('has a symbols page with the digits row, symbols, ABC and 123', async () => {
    const t = await boot();
    const S = t.pane('symbols');
    const rows = rowsOf(S);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows[0].children.map((k) => k.getAttribute('data-vk-ch')), [...'1234567890']);
    assert.deepEqual(keysOf(rows[3]), ['letters', 'pad', ',', ' ', '.', 'back', 'enter']);
  });

  it('every key is a themed button with manual feedback', async () => {
    const t = await boot();
    assert.ok(t.dock.querySelectorAll('.vk-key').every((k) => k.getAttribute('data-feedback') === 'manual'));
  });

  it('opens the letters keyboard for a text field and the numpad for number and phone fields', async () => {
    const t = await boot();
    t.focus(t.input({ type: 'text' }));
    assert.ok(!t.isHidden());
    assert.ok(t.classes.has('vk-open'));
    assert.equal(t.props.get('--vk-h'), '230px');
    assert.equal(t.win.__vkInset, 230);
    assert.ok(!t.pane('letters').classList.contains('d-none'));
    assert.ok(t.pane('pad').classList.contains('d-none'));
    assert.ok(t.hidden.length >= 1);
    assert.ok(t.calls.reposition >= 1);
    t.focus(t.input({ type: 'number' }));
    assert.ok(t.pane('letters').classList.contains('d-none'));
    assert.ok(!t.pane('pad').classList.contains('d-none'));
    t.focus(t.input({ type: 'tel' }));
    assert.ok(!t.pane('pad').classList.contains('d-none'));
    t.focus(t.input({ type: 'text', 'data-vk-mode': 'decimal' }));
    assert.ok(!t.pane('pad').classList.contains('d-none'));
    t.focus(t.input({ type: 'search' }));
    assert.ok(!t.pane('letters').classList.contains('d-none'));
  });

  it('opens the letters keyboard for email, password and web address fields', async () => {
    const t = await boot();
    for (const type of ['email', 'password', 'url']) {
      t.focus(t.input({ type }));
      assert.ok(!t.isHidden(), type);
      assert.ok(!t.pane('letters').classList.contains('d-none'), type);
    }
    t.focus(t.input({ type: 'text', inputmode: 'email' }));
    assert.ok(!t.isHidden());
  });
  it('types every letter in capitals', async () => {
    const t = await boot();
    const f = t.input({ type: 'text' });
    t.focus(f);
    const L = t.pane('letters');
    t.down(t.keyByCh(L, 'a'));
    t.down(t.keyByCh(L, 'b'));
    t.down(t.act('space'));
    t.down(t.keyByCh(L, 'c'));
    assert.equal(f.value, 'AB C');
  });

  it('types space and the period on the letters keyboard', async () => {
    const t = await boot();
    const f = t.input({ type: 'text' });
    t.focus(f);
    t.down(t.keyByCh(t.pane('letters'), 'a'));
    t.down(t.act('space'));
    t.down(t.keyByCh(t.pane('letters'), '.'));
    t.docListeners.pointerup.forEach((fn) => fn({}));
    assert.equal(f.value, 'A .');
  });

  const holdDot = (t) => {
    t.down(t.act('shift'));
    t.docListeners.pointerup.forEach((fn) => fn({}));
  };

  it('tapping shift cycles CAPS, small, Capitalised without typing anything', async () => {
    const t = await boot();
    const f = t.input({ type: 'text' });
    t.focus(f);
    assert.equal(t.dock.getAttribute('data-vk-case'), 'caps');
    holdDot(t);
    assert.equal(t.dock.getAttribute('data-vk-case'), 'small');
    assert.ok(t.dock.classList.contains('is-lower'));
    holdDot(t);
    assert.equal(t.dock.getAttribute('data-vk-case'), 'title');
    holdDot(t);
    assert.equal(t.dock.getAttribute('data-vk-case'), 'caps');
    assert.ok(!t.dock.classList.contains('is-lower'));
    assert.equal(f.value, '');
  });

  it('small types lower case and Capitalised types a capital first letter of each word', async () => {
    const t = await boot();
    const f = t.input({ type: 'text' });
    t.focus(f);
    const L = t.pane('letters');
    holdDot(t);
    t.down(t.keyByCh(L, 'a'));
    t.down(t.keyByCh(L, 'b'));
    assert.equal(f.value, 'ab');
    holdDot(t);
    t.down(t.act('space'));
    t.down(t.keyByCh(L, 'c'));
    t.down(t.keyByCh(L, 'd'));
    assert.equal(f.value, 'ab Cd');
  });

  it('keeps the field focused when a key is pressed', async () => {
    const t = await boot();
    t.focus(t.input({ type: 'text' }));
    const ev = { target: t.keyByCh(t.pane('letters'), 'q'), button: 0, prevented: false, preventDefault() { this.prevented = true; } };
    t.dock.listeners.pointerdown[0](ev);
    assert.equal(ev.prevented, true);
    const md = { prevented: false, preventDefault() { this.prevented = true; } };
    t.dock.listeners.mousedown[0](md);
    assert.equal(md.prevented, true);
  });

  it('types digits, 00 and a decimal point on the numpad', async () => {
    const t = await boot();
    const f = t.input({ type: 'number' });
    t.focus(f);
    const P = t.pane('pad');
    for (const c of ['1', '2', '.', '5', '00']) t.down(t.keyByCh(P, c));
    assert.equal(f.value, '12.500');
  });

  it('types through the browser editing pipeline so number fields, maxlength and events behave natively', async () => {
    const t = await boot();
    const f = t.input({ type: 'number' });
    t.focus(f);
    t.down(t.keyByCh(t.pane('pad'), '7'));
    t.down(t.act('back'));
    assert.deepEqual(t.calls.exec, [['insertText', '7'], ['delete', undefined]]);
  });

  it('falls back to setting the value and firing an input event when editing commands are unavailable', async () => {
    const t = await boot({ execFails: true });
    const f = t.input({ type: 'text' }, { selectionStart: 0, selectionEnd: 0, setSelectionRange() {}, maxLength: -1 });
    t.focus(f);
    t.down(t.keyByCh(t.pane('letters'), 'z'));
    assert.equal(f.value, 'Z');
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].type, 'input');
    assert.equal(f.events[0].data, 'Z');
    f.selectionStart = 1;
    f.selectionEnd = 1;
    t.down(t.act('back'));
    assert.equal(f.value, '');
    assert.equal(f.events[1].inputType, 'deleteContentBackward');
  });

  it('holding backspace repeats and releasing stops it', async () => {
    const t = await boot();
    const f = t.input({ type: 'text' }, { value: 'abcdef' });
    t.focus(f);
    t.down(t.act('back'));
    assert.equal(f.value, 'abcde');
    const hold = t.timers.find((x) => x.kind === 'timeout' && x.fn.toString().includes('setInterval'));
    assert.ok(hold);
    hold.fn();
    const repeat = t.timers.find((x) => x.kind === 'interval');
    assert.ok(repeat);
    repeat.fn();
    repeat.fn();
    assert.equal(f.value, 'abc');
    assert.equal(typeof t.docListeners.pointerup[0], 'function');
  });

  it('closes shortly after focus leaves, but stays when focus moves to another field', async () => {
    const t = await boot();
    const a = t.input({ type: 'text' });
    const b = t.input({ type: 'text' });
    t.focus(a);
    t.docListeners.focusout[0]({});
    t.doc.activeElement = b;
    t.timers.at(-1).fn();
    assert.ok(!t.isHidden());
    t.docListeners.focusout[0]({});
    t.doc.activeElement = null;
    t.timers.at(-1).fn();
    assert.ok(t.isHidden());
    assert.ok(!t.classes.has('vk-open'));
    assert.equal(t.win.__vkInset, 0);
  });

  it('opens for the login and accounts screens', async () => {
    const t = await boot();
    t.focus(t.input({ type: 'text' }, insideScreen('.auth-screen')));
    assert.ok(!t.isHidden());
    t.focus(t.input({ type: 'number' }, insideScreen('#app-accounts-screen')));
    assert.ok(!t.isHidden());
    assert.ok(!t.pane('pad').classList.contains('d-none'));
  });

  it('a quick tap on space types a space, a long press types an @ instead', async () => {
    const t = await boot();
    const f = t.input({ type: 'text' });
    t.focus(f);
    t.down(t.keyByCh(t.pane('letters'), 'a'));
    t.down(t.act('space'));
    t.docListeners.pointerup.forEach((fn) => fn({}));
    assert.equal(f.value, 'A ');
    t.down(t.act('space'));
    assert.equal(f.value, 'A  ');
    const timer = t.timers.filter((x) => x.kind === 'timeout' && String(x.fn).includes('typeAt')).pop() || t.timers.filter((x) => x.kind === 'timeout').pop();
    timer.fn();
    t.docListeners.pointerup.forEach((fn) => fn({}));
    assert.equal(f.value, 'A @');
  });

  it('types lower case in email and password fields', async () => {
    const t = await boot();
    const f = t.input({ type: 'password' });
    t.focus(f);
    assert.ok(t.dock.classList.contains('is-lower'));
    t.down(t.keyByCh(t.pane('letters'), 'q'));
    assert.equal(f.value, 'q');
    t.focus(t.input({ type: 'text' }));
    assert.ok(!t.dock.classList.contains('is-lower'));
  });
  it('closes when tapping anywhere outside the keyboard and the field', async () => {
    const t = await boot();
    const f = t.input({ type: 'text' });
    t.focus(f);
    const tap = (target) => t.docListeners.click.forEach((fn) => fn({ target }));
    tap(new Node('button'));
    assert.ok(t.isHidden());
    assert.equal(f.blurred, true);
    assert.ok(!t.classes.has('vk-open'));
    assert.equal(t.win.__vkInset, 0);
  });

  it('a tap that began on a field stays on that field: the stray click after the layout shifts is swallowed and the keyboard stays', async () => {
    const t = await boot();
    const lower = t.input({ type: 'text' });
    t.focus(lower);
    t.docListeners.pointerdown.forEach((fn) => fn({ target: lower }));
    const stray = { target: new Node('div'), stopped: false, prevented: false, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; } };
    t.docListeners.click.forEach((fn) => fn(stray));
    assert.ok(!t.isHidden());
    assert.equal(stray.stopped, true);
    assert.equal(stray.prevented, true);
    assert.equal(lower.blurred, false);
  });

  it('a tap that began outside any field closes the keyboard', async () => {
    const t = await boot();
    t.focus(t.input({ type: 'text' }));
    t.docListeners.pointerdown.forEach((fn) => fn({ target: new Node('div') }));
    t.docListeners.click.forEach((fn) => fn({ target: new Node('div'), stopPropagation() {}, preventDefault() {} }));
    assert.ok(t.isHidden());
  });

  it('stays open when tapping a key, the same field, another text field or a label', async () => {
    const t = await boot();
    const f = t.input({ type: 'text' });
    t.focus(f);
    const tap = (target) => t.docListeners.click.forEach((fn) => fn({ target }));
    tap(t.keyByCh(t.pane('letters'), 'q'));
    assert.ok(!t.isHidden());
    tap(f);
    assert.ok(!t.isHidden());
    tap(t.input({ type: 'number' }));
    assert.ok(!t.isHidden());
    tap({ closest: (sel) => (sel === 'label' ? {} : null) });
    assert.ok(!t.isHidden());
  });

  it('closes when tapping a control that is not a text field, and ignores taps while closed', async () => {
    const t = await boot();
    const tap = (target) => t.docListeners.click.forEach((fn) => fn({ target }));
    tap(new Node('div'));
    assert.ok(t.isHidden());
    t.focus(t.input({ type: 'text' }));
    tap(t.input({ type: 'checkbox' }));
    assert.ok(t.isHidden());
    t.focus(t.input({ type: 'text' }));
    tap(t.input({ type: 'text' }, { readOnly: true }));
    assert.ok(t.isHidden());
  });

  it('cleans pasted or odd characters out of number fields but leaves phone fields alone', async () => {
    const t = await boot();
    const n = t.input({ type: 'text', 'data-vk-type': 'number' }, { value: 'a1.2.3-4' });
    t.docListeners.input[0]({ target: n });
    assert.equal(n.value, '1.234');
    const p = t.input({ type: 'text', 'data-vk-type': 'tel' }, { value: '+92 300-1234567' });
    t.docListeners.input[0]({ target: p });
    assert.equal(p.value, '+92 300-1234567');
    const x = t.input({ type: 'text' }, { value: 'abc' });
    t.docListeners.input[0]({ target: x });
    assert.equal(x.value, 'abc');
  });

  it('converts a focused number field before opening so the system keyboard stays shut', async () => {
    const t = await boot();
    const n = t.input({ type: 'number' });
    t.focus(n);
    assert.equal(n.type, 'text');
    assert.equal(n.getAttribute('inputmode'), 'none');
    assert.ok(!t.pane('pad').classList.contains('d-none'));
  });

  it('ignores focus on non-text controls', async () => {
    const t = await boot();
    t.focus(t.input({ type: 'checkbox' }));
    assert.ok(t.isHidden());
    t.focus(t.input({ type: 'date' }));
    assert.ok(t.isHidden());
  });

  it('keeps the system keyboard away from every field already in the page', async () => {
    const dec = field({ type: 'text', inputmode: 'decimal' });
    const mail = field({ type: 'email' });
    const t = await boot({ fields: [dec, mail] });
    assert.equal(dec.getAttribute('inputmode'), 'none');
    assert.equal(dec.getAttribute('data-vk-mode'), 'decimal');
    assert.equal(mail.getAttribute('inputmode'), 'none');
    assert.equal(t.kb.isOpen(), false);
  });
  it('the Android back button can close the keyboard and blur the field', async () => {
    const t = await boot();
    const f = t.input({ type: 'text' });
    t.focus(f);
    assert.equal(t.win.VirtualKeyboard.isOpen(), true);
    t.win.VirtualKeyboard.hide();
    assert.equal(t.win.VirtualKeyboard.isOpen(), false);
    assert.equal(f.blurred, true);
    assert.equal(t.props.has('--vk-h'), false);
  });
});

describe('new layout keys', () => {
  it('switches between letters, numbers and symbols', async () => {
    const t = await boot();
    t.focus(t.input({ type: 'text' }));
    t.down(t.act('pad'));
    assert.ok(!t.pane('pad').classList.contains('d-none'));
    assert.ok(t.pane('letters').classList.contains('d-none'));
    t.down(t.act('symbols'));
    assert.ok(!t.pane('symbols').classList.contains('d-none'));
    assert.ok(t.pane('pad').classList.contains('d-none'));
    t.down(t.act('letters'));
    assert.ok(!t.pane('letters').classList.contains('d-none'));
  });

  it('types operators, comma and symbols', async () => {
    const t = await boot();
    const f = t.input({ type: 'text' });
    t.focus(f);
    t.down(t.act('pad'));
    for (const c of ['+', '×', '÷', '%', '=']) t.down(t.keyByCh(t.pane('pad'), c));
    t.down(t.keyByCh(t.pane('letters'), ','));
    assert.equal(f.value, '+×÷%=,');
  });

  it('enter adds a new line in a text area', async () => {
    const t = await boot();
    const f = t.input({ type: 'text' }, { tagName: 'TEXTAREA' });
    t.focus(f);
    t.down(t.act('enter'));
    assert.deepEqual(t.calls.exec, [['insertText', '\n']]);
  });

  it('enter sends an Enter key to a one-line field, and submits its form when nothing handled it', async () => {
    const t = await boot();
    let submitted = 0;
    const f = t.input({ type: 'text' }, { form: { requestSubmit() { submitted += 1; } } });
    t.focus(f);
    t.down(t.act('enter'));
    assert.equal(f.events[0].type, 'keydown');
    assert.equal(f.events[0].key, 'Enter');
    assert.equal(submitted, 1);
    const g = t.input({ type: 'text' }, { dispatchEvent(e) { e.preventDefault(); return false; }, form: { requestSubmit() { submitted += 1; } } });
    t.focus(g);
    t.down(t.act('enter'));
    assert.equal(submitted, 1);
    const h = t.input({ type: 'text' });
    t.focus(h);
    t.down(t.act('enter'));
    assert.ok(t.isHidden());
  });

  it('select all selects the field text', async () => {
    const t = await boot();
    let selected = 0;
    const f = t.input({ type: 'text' }, { value: 'abc', select() { selected += 1; } });
    t.focus(f);
    t.down(t.act('selectall'));
    assert.equal(selected, 1);
  });
});

describe('virtual keyboard wiring', () => {
  const native = readSource('modules/native.js');
  const dropdown = readSource('modules/dropdown.js');
  const css = readSource('app.css');
  const kb = readSource('modules/virtual-keyboard.js');

  it('is installed only in the native Android branch', () => {
    assert.match(native, /import \{ installVirtualKeyboard \} from '\.\/virtual-keyboard\.js';/);
    assert.match(native, /if \(isNative\) \{[\s\S]*installVirtualKeyboard\(\{ hideNative: hideNativeKeyboard \}\);/);
    assert.match(kb, /!root\.classList\.contains\('is-android'\)/);
  });

  it('is not loaded by anything that also runs on the web or desktop', () => {
    const importers = ['index.html', 'modules/main.js', 'modules/utilities-core.js', 'modules/sync.js', 'modules/dialog.js'].filter((f) => readSource(f).includes('virtual-keyboard'));
    assert.deepEqual(importers, []);
  });

  it('hides the system keyboard if it ever appears while the in-app keyboard is open', () => {
    assert.match(native, /Keyboard\.addListener\('keyboardWillShow', \(\) => \{ set\(true\); if \(window\.VirtualKeyboard && window\.VirtualKeyboard\.isOpen\(\)\) hideNativeKeyboard\(\); \}\);/);
    assert.match(native, /Keyboard\.addListener\('keyboardDidShow', \(\) => \{ if \(window\.VirtualKeyboard && window\.VirtualKeyboard\.isOpen\(\)\) hideNativeKeyboard\(\); \}\);/);
  });

  it('asks the native keyboard to hide as a safety net', () => {
    assert.match(native, /function hideNativeKeyboard\(\)/);
    assert.match(native, /Keyboard\.hide\(\)/);
  });

  it('Android back closes the keyboard first and leaves the field focused, like the system keyboard', () => {
    assert.match(native, /function handleBack\(\) \{\n  if \(window\.VirtualKeyboard && window\.VirtualKeyboard\.isOpen\(\)\) \{ window\.VirtualKeyboard\.hide\(true\); return; \}/);
    assert.match(kb, /hide: \(keepFocus\) => hide\(!keepFocus\)/);
  });

  it('keys do not trigger the generic button haptic on top of their own feedback', () => {
    assert.match(native, /closest\('\.btn:not\(\[data-feedback="manual"\]\)'\)/);
    assert.match(kb, /dialogFeedback\('select'\)/);
  });

  it('tapping a key does not close the suggestion list, and lists stay above the keyboard', () => {
    assert.match(dropdown, /function onPointer\(e\) \{\n    if \(e\.target && e\.target\.closest && e\.target\.closest\('\.vk-dock'\)\) return;/);
    assert.match(dropdown, /return Math\.min\(bottom, window\.innerHeight - \(window\.__vkInset \|\| 0\)\);/);
  });

  it('uses the app theme tokens for the keys, with no separate stylesheet or CDN', () => {
    assert.doesNotMatch(kb, /tailwind|cdn\.|googleapis|<style/i);
    assert.match(css, /\.vk-dock \.vk-key:active \{[^}]*background: var\(--toggle-opt-active-bg\); border-color: var\(--toggle-opt-active-border\); color: var\(--toggle-opt-active-color\)/);
    assert.match(css, /\.vk-dock \.vk-key\.is-back \{[^}]*var\(--danger\)/);
    assert.match(css, /\.vk-dock \.vk-key\.is-accent \{[^}]*background: var\(--accent\)/);
    assert.doesNotMatch(css, /\.vk-[^{]*\{[^}]*color-mix\([^)]*var\(--soft-bg\)/);
  });

  it('theme keys: rounded-rectangle keys in the app button theme with no backing sheet, flush to the bottom, accent shift and enter, tall numpad', () => {
    assert.match(css, /\.vk-dock \.vk-key \{[^}]*border: 1px solid var\(--glass-border\); border-radius: 14px; background: var\(--soft-bg\)/);
    assert.match(css, /\.vk-dock\.overlay \{ --vk-key-h:[^}]*left: 0; right: 0; bottom: 0;[^}]*border-radius: 0; background: transparent; box-shadow: none;/);
    assert.doesNotMatch(css, /\.vk-dock\.overlay \{[^}]*var\(--soft-card\)/);
    assert.match(css, /\.vk-dock \.vk-key\.is-accent \{[^}]*var\(--on-accent-dark\)/);
    assert.match(css, /html\.vk-open \{ --vk-gap: 0px; \}/);
    assert.match(css, /\[data-vk-pane="pad"\] \.vk-col\.is-digits \{ flex: 4\.65 1 0;/);
  });

  it('pads the page, accounts and other screens, dialogs and sheets while the keyboard is open', () => {
    assert.match(css, /html\.vk-open body \{ padding-bottom: calc\(var\(--vk-h, 0px\) \+ var\(--vk-gap\)\); \}/);
    assert.match(css, /html\.vk-open \.standalone-screen \{ padding-bottom: calc\(var\(--vk-h, 0px\) \+ var\(--vk-gap\)\);/);
    assert.match(css, /html\.vk-open \.dlg-overlay \{[^}]*padding-bottom: calc\(var\(--vk-h, 0px\) \+ var\(--vk-gap\) \+ 12px\);/);
    assert.doesNotMatch(css, /html\.vk-open[^{]*\.auth-screen/);
    assert.match(css, /html\.vk-open \.cm-sheet \{ bottom: calc\(var\(--vk-h, 0px\) \+ var\(--vk-gap\)\); \}/);
  });

  it('sits above dialogs, sheets and suggestion lists', () => {
    const z = [...css.matchAll(/z-index: (\d+)/g)].map((m) => Number(m[1]));
    assert.match(css, /\.vk-dock\.overlay \{[^}]*position: fixed;[^}]*z-index: 10450;/);
    assert.ok(Math.max(...z.filter((n) => n < 10450)) < 10450);
    assert.ok(z.filter((n) => n > 10450).every((n) => n >= 99999));
  });

  it('no screen is routed to the device keyboard any more', () => {
    assert.doesNotMatch(kb, /SYSTEM_SCOPES|SYSTEM_MODES/);
    assert.doesNotMatch(kb, /usesSystemKeyboard|data-vk', 'off'|data-vk'\) === 'off'/);
    assert.match(readSource('modules/sync.js'), /overlay\.className = 'auth-screen';/);
    assert.match(readSource('index.html'), /<div id=\"app-accounts-screen\"/);
  });
  it('closes on a tap outside the keyboard, and a tap on a backdrop closes only the keyboard', () => {
    assert.match(kb, /doc\.addEventListener\('click', \(e\) => \{[\s\S]*const backdrop = isBackdrop\(t\);\n    hide\(true\);\n    if \(backdrop\) \{ e\.stopPropagation\(\); e\.preventDefault\(\); \}\n  \}, true\);/);
    assert.match(kb, /e\.key !== 'Escape' \|\| !isOpen\(\)[\s\S]*e\.stopImmediatePropagation\(\);/);
  });

  it('does not close when the page is scrolled, like the system keyboard', () => {
    assert.doesNotMatch(kb, /touchmove|'wheel'|scrollsOutside/);
  });

  it('closes by itself when the typed field is removed, disabled or hidden', () => {
    assert.match(kb, /if \(isOpen\(\) && !usable\(active\)\) hide\(true\);/);
    assert.match(kb, /attributeFilter: \['inputmode', 'type', 'disabled', 'readonly', 'hidden', 'class', 'style'\]/);
  });
});

describe('search dropdown stays open while typing on the on-screen keyboard', () => {
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

  it('keyboard key clicks do not bubble to the click-outside handlers', () => {
    assert.match(read('modules/virtual-keyboard.js'), /dock\.addEventListener\('click', \(e\) => \{ e\.preventDefault\(\); e\.stopPropagation\(\); \}\)/);
  });

  it('the universal search click-outside handler ignores the keyboard dock', () => {
    assert.match(read('modules/utilities-payments.js'), /closest\('\.vk-dock'\)\) return;/);
  });

  it('the sales customer field has no native datalist competing with the custom dropdown', () => {
    assert.doesNotMatch(read('index.html'), /id="cust-name"[^>]*list=/);
  });
});

describe('universal search ignores late results from an older keystroke', () => {
  it('drops a stale result instead of overwriting or re-opening the list', () => {
    const src = readFileSync(new URL('../modules/utilities-payments.js', import.meta.url), 'utf8');
    assert.match(src, /_searchSeq\.get\(resultsId\) !== _mySeq\) return;/);
  });
});

describe('tapping a field always brings the keyboard back', () => {
  const src = readFileSync(new URL('../modules/virtual-keyboard.js', import.meta.url), 'utf8');

  it('a tap on a text field opens the keyboard even when the field never lost focus', () => {
    assert.match(src, /if \(!t \|\| dock\.contains\(t\) \|\| !isTextField\(t\)\) return;\n    if \(isOpen\(\) && active === t\) return;\n    applyFieldPolicy\(t\);\n    open\(t\);/);
  });
});

describe('dialogs close the keyboard instead of sitting under it', () => {
  const src = readFileSync(new URL('../modules/virtual-keyboard.js', import.meta.url), 'utf8');
  const dlg = readFileSync(new URL('../modules/dialog.js', import.meta.url), 'utf8');

  it('hides the keyboard when a dialog is added, unless the dialog holds the typed field', () => {
    assert.match(src, /const MODAL_SELECTOR = '\.dlg-overlay, \[aria-modal="true"\]';/);
    assert.match(src, /if \(isModalNode\(n\) && !\(active && n\.contains\(active\)\)\) \{ hide\(true\); return; \}/);
  });

  it('does not pop the keyboard back up when a dialog closes and focus would return to a text field', () => {
    assert.match(dlg, /!\(window\.VirtualKeyboard && \/\^\(INPUT\|TEXTAREA\)\$\/\.test\(previous\.tagName\)\)/);
  });
});

describe('dialog fields stay centred above the keyboard', () => {
  const src = readFileSync(new URL('../modules/virtual-keyboard.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');

  it('keeps the dialog centred in the free space above the keyboard', () => {
    assert.match(css, /html\.vk-open \.dlg-overlay \{ padding-bottom: calc\(var\(--vk-h, 0px\) \+ var\(--vk-gap\) \+ 12px\); box-sizing: border-box; \}/);
    assert.doesNotMatch(css, /html\.vk-open \.dlg-overlay \{[^}]*align-items/);
  });

  it('scrolls the typed field into view inside the dialog body', () => {
    assert.match(src, /field\.closest\('\.dlg-body'\)/);
    assert.match(src, /field\.scrollIntoView\(\{ block: 'nearest', inline: 'nearest' \}\); return;/);
  });

  it('closes the keyboard when the typed field is removed from the page', () => {
    assert.match(src, /if \(active && !active\.isConnected\) \{ hide\(true\); return; \}/);
  });
});

describe('the keyboard keeps working while a dialog is open', () => {
  const dlg = readFileSync(new URL('../modules/dialog.js', import.meta.url), 'utf8');
  const src = readFileSync(new URL('../modules/virtual-keyboard.js', import.meta.url), 'utf8');

  it('the dialog page lock never makes the keyboard inert', () => {
    assert.match(dlg, /node\.classList\.contains\('dd-layer'\) \|\| node\.classList\.contains\('vk-dock'\)\)\) return;/);
  });

  it('opening the keyboard clears any inert flag left on it', () => {
    assert.match(src, /active = field;\n    dock\.removeAttribute\('inert'\);/);
  });
});
