import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { readSource } from './_extract.js';
import { FIELD_SELECTOR, LETTER_ROWS, PAD_KEYS, applyFieldPolicy, casedKey, deleteBack, insertAt, isTextField, layoutFor, sanitizeNumber, usesSystemKeyboard, typesLowerCase, wantsCapital } from '../modules/virtual-keyboard.js';

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
    assert.equal(usesSystemKeyboard(field({ type: 'text', inputmode: 'email' })), false);
    assert.equal(usesSystemKeyboard(field({ type: 'text', 'data-vk': 'off' })), true);
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
      assert.equal(usesSystemKeyboard(f), false);
      assert.equal(isTextField(f), true);
      assert.equal(applyFieldPolicy(f), true);
      assert.equal(f.getAttribute('inputmode'), 'none');
    }
  });
  it('leaves pickers, files, checkboxes and hidden inputs alone', () => {
    for (const type of ['date', 'month', 'file', 'checkbox', 'radio', 'hidden', 'button', 'range', 'color']) assert.equal(isTextField(field({ type })), false, type);
  });
  it('skips disabled, read-only and opted-out fields', () => {
    assert.equal(isTextField(field({}, { disabled: true })), false);
    assert.equal(isTextField(field({}, { readOnly: true })), false);
    assert.equal(isTextField(field({ 'data-vk': 'off' })), false);
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
  it('only date fields and fields marked data-vk="off" keep the system keyboard', () => {
    const mail = field({ type: 'text', inputmode: 'email' });
    assert.equal(applyFieldPolicy(mail), true);
    assert.equal(mail.getAttribute('inputmode'), 'none');
    assert.equal(mail.getAttribute('data-vk-mode'), 'email');
    assert.equal(applyFieldPolicy(field({ type: 'password' })), true);
    assert.equal(applyFieldPolicy(field({ type: 'email' })), true);
    assert.equal(applyFieldPolicy(field({ type: 'date' })), false);
    assert.equal(applyFieldPolicy(field({ type: 'text', 'data-vk': 'off' })), false);
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
    assert.deepEqual(LETTER_ROWS, ['qwertyu', 'iopasdf', 'ghjklzx', 'cvbnm']);
    assert.deepEqual(PAD_KEYS, ['1', '2', '3', '-', '4', '5', '6', '.', '7', '8', '9']);
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

  it('letters layout matches the reference: 7 per row, 5 on the last, then dot, space and DEL', async () => {
    const t = await boot();
    const rows = rowsOf(t.pane('letters'));
    assert.equal(t.pane('letters').children.length, 5);
    assert.deepEqual(rows.slice(0, 4).map(keysOf), [[...'qwertyu'], [...'iopasdf'], [...'ghjklzx'], [...'cvbnm']]);
    assert.deepEqual(keysOf(rows[4]), ['.', ' ', 'back']);
    assert.equal(t.pane('letters').querySelectorAll('.vk-key').length, 29);
    assert.deepEqual(t.pane('letters').querySelectorAll('[data-vk-letter]').map((k) => k.textContent).join(''), 'QWERTYUIOPASDFGHJKLZXCVBNM');
    assert.equal(t.act('space').textContent, 'space');
    assert.equal(t.act('back').textContent, 'DEL');
  });

  it('numpad layout matches the reference: 1 2 3 -, 4 5 6 ., 7 8 9 with a tall DEL, then 00 and a wide 0', async () => {
    const t = await boot();
    const pad = t.pane('pad');
    assert.deepEqual(pad.children.map((k) => k.getAttribute('data-vk-ch') ?? k.getAttribute('data-vk-act')), ['1', '2', '3', '-', '4', '5', '6', '.', '7', '8', '9', 'back', '00', '0']);
    assert.equal(pad.querySelectorAll('.vk-key').length, 14);
    assert.ok(pad.querySelector('.is-double'));
    assert.ok(pad.querySelector('.is-tall'));
    assert.ok(pad.querySelector('.is-zero'));
    assert.equal(t.act('back', pad).textContent, 'DEL');
  });

  it('has no shift key, status dot or badge', async () => {
    const t = await boot();
    assert.equal(t.dock.querySelector('.vk-head'), null);
    assert.equal(t.dock.querySelector('[data-vk-act="shift"]'), null);
    assert.equal(t.dock.querySelector('.vk-shift-badge'), null);
  });

  it('has no enter, hide, symbols, comma, plus or label keys', async () => {
    const t = await boot();
    const all = t.dock.querySelectorAll('.vk-key').map((k) => k.getAttribute('data-vk-act') ?? k.getAttribute('data-vk-ch'));
    for (const banned of ['enter', 'hide', 'symbols', 'letters', ',', '+']) assert.ok(!all.includes(banned), banned);
    assert.equal(t.dock.querySelector('.vk-label'), null);
    assert.equal(t.dock.querySelector('.vk-bar'), null);
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
    t.down(t.keyByCh(t.pane('letters'), '.'));
    const timer = t.timers.filter((x) => x.kind === 'timeout' && String(x.fn).includes('cycleCase')).pop();
    timer.fn();
    t.docListeners.pointerup.forEach((fn) => fn({}));
  };

  it('holding the dot key cycles CAPS, small, Capitalised without typing a dot', async () => {
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

  it('five quick taps on space type an @ instead of the spaces', async () => {
    const t = await boot();
    const f = t.input({ type: 'text' });
    t.focus(f);
    const L = t.pane('letters');
    t.down(t.keyByCh(L, 'a'));
    for (let i = 0; i < 4; i += 1) t.down(t.act('space'));
    assert.equal(f.value, 'A    ');
    t.down(t.act('space'));
    assert.equal(f.value, 'A@');
    t.down(t.act('space'));
    assert.equal(f.value, 'A@ ');
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

  it('Android back closes the keyboard before anything else', () => {
    assert.match(native, /function handleBack\(\) \{\n  if \(window\.VirtualKeyboard && window\.VirtualKeyboard\.isOpen\(\)\) \{ window\.VirtualKeyboard\.hide\(\); return; \}/);
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
    assert.match(css, /\.vk-key\.is-double \{ color: var\(--warning\); \}/);
    assert.doesNotMatch(css, /\.vk-[^{]*\{[^}]*color-mix\([^)]*var\(--soft-bg\)/);
  });

  it('theme keys: bold monospace circles in the app button theme with no backing sheet, flush to the bottom, pill for space, DEL and the wide zero', () => {
    assert.match(css, /\.vk-dock \.vk-key \{[^}]*border-radius: 50%;[^}]*font-family: var\(--font-mono\)[^}]*font-weight: 800/);
    assert.match(css, /\.vk-dock\.overlay \{ --vk-d:[^}]*left: 0; right: 0; bottom: 0;[^}]*border-radius: 0; background: transparent; box-shadow: none;/);
    assert.match(css, /\.vk-dock \.vk-key \{[^}]*border: 1px solid var\(--glass-border\); border-radius: 50%; background: var\(--soft-bg\)/);
    assert.doesNotMatch(css, /\.vk-dock\.overlay \{[^}]*var\(--soft-card\)/);
    assert.match(css, /\.vk-dock \.vk-key\.is-back \{[^}]*background: var\(--danger-dim\)/);
    assert.match(css, /html\.vk-open \{ --vk-gap: 0px; \}/);
    assert.match(css, /\[data-vk-pane="pad"\]:not\(\.d-none\) \{ display: grid; grid-template-columns: repeat\(4, 1fr\); grid-auto-rows: var\(--vk-pd\);/);
    assert.match(css, /\.is-zero \{ grid-column: span 2;/);
    assert.match(css, /\.is-tall \{ grid-row: span 2;/);
  });

  it('pads the page, accounts and other screens, dialogs and sheets while the keyboard is open', () => {
    assert.match(css, /html\.vk-open body \{ padding-bottom: calc\(var\(--vk-h, 0px\) \+ var\(--vk-gap\)\); \}/);
    assert.match(css, /html\.vk-open \.standalone-screen, html\.vk-open \.dlg-overlay \{ padding-bottom: calc\(var\(--vk-h, 0px\) \+ var\(--vk-gap\)\);/);
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
    assert.match(kb, /return attr\(el, 'data-vk'\) === 'off';/);
    assert.match(readSource('modules/sync.js'), /overlay\.className = 'auth-screen';/);
    assert.match(readSource('index.html'), /<div id=\"app-accounts-screen\"/);
  });
  it('closes on any tap outside the keyboard', () => {
    assert.match(kb, /doc\.addEventListener\('click', \(e\) => \{[\s\S]*hide\(true\);\n  \}, true\);/);
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

describe('keyboard hides when the page is scrolled outside it', () => {
  const src = readFileSync(new URL('../modules/virtual-keyboard.js', import.meta.url), 'utf8');

  it('listens for touch drags and the mouse wheel outside the keyboard', () => {
    assert.match(src, /doc\.addEventListener\('touchmove'/);
    assert.match(src, /doc\.addEventListener\('wheel'/);
    assert.match(src, /if \(scrollsOutside\(t\)\) hide\(true\);/);
  });

  it('ignores scrolling inside the keyboard, the suggestion list and the typed field', () => {
    assert.match(src, /const scrollsOutside = \(t\) => !!t && !dock\.contains\(t\) && !\(t\.closest && t\.closest\('\.dd-layer'\)\) && t !== active && !isTextField\(t\);/);
  });

  it('needs a real drag (not a tap) before it closes', () => {
    assert.match(src, /const SCROLL_HIDE_PX = 12;/);
    assert.match(src, /< SCROLL_HIDE_PX\) return;/);
  });
});
