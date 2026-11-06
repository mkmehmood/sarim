import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from './_extract.js';
import { FIELD_SELECTOR, LETTER_ROWS, PAD_ROWS, applyFieldPolicy, casedKey, deleteBack, insertAt, isTextField, layoutFor, usesSystemKeyboard } from '../modules/virtual-keyboard.js';

const field = (attrs = {}, extra = {}) => {
  const map = new Map(Object.entries(attrs));
  return {
    nodeType: 1,
    tagName: attrs.tag || 'INPUT',
    type: attrs.type === undefined ? 'text' : attrs.type,
    getAttribute: (k) => (map.has(k) ? map.get(k) : null),
    setAttribute: (k, v) => map.set(k, String(v)),
    ...extra
  };
};

describe('field rules', () => {
  it('opens for text, search, phone and number fields and for textareas', () => {
    for (const type of ['text', 'search', 'tel', 'number']) assert.equal(isTextField(field({ type })), true, type);
    assert.equal(isTextField(field({ tag: 'TEXTAREA', type: 'textarea' })), true);
  });
  it('leaves email, password and web address fields to the system keyboard, since these keys have no digits or @', () => {
    for (const type of ['email', 'password', 'url']) assert.equal(isTextField(field({ type })), false, type);
    assert.equal(isTextField(field({ type: 'text', inputmode: 'email' })), false);
    assert.equal(isTextField(field({ type: 'text', 'data-vk-mode': 'url', inputmode: 'none' })), false);
    assert.equal(usesSystemKeyboard(field({ type: 'text', inputmode: 'email' })), true);
    assert.equal(usesSystemKeyboard(field({ type: 'text', inputmode: 'decimal' })), false);
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
  it('does not touch fields that keep the system keyboard', () => {
    const mail = field({ type: 'text', inputmode: 'email' });
    assert.equal(applyFieldPolicy(mail), false);
    assert.equal(mail.getAttribute('inputmode'), 'email');
    assert.equal(applyFieldPolicy(field({ type: 'password' })), false);
    assert.equal(applyFieldPolicy(field({ type: 'email' })), false);
    assert.equal(applyFieldPolicy(field({ type: 'date' })), false);
    assert.equal(applyFieldPolicy(field({ type: 'text', 'data-vk': 'off' })), false);
  });
  it('selects every kind of text field in the page', () => {
    assert.match(FIELD_SELECTOR, /input/);
    assert.match(FIELD_SELECTOR, /textarea/);
    assert.match(FIELD_SELECTOR, /contenteditable/);
  });
});

describe('typing rules', () => {
  it('has exactly the rows from the uploaded layouts', () => {
    assert.deepEqual(LETTER_ROWS, ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']);
    assert.deepEqual(PAD_ROWS, [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]);
  });
  it('types lower case unless shift is on', () => {
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

  it('letters layout matches the uploaded image: four rows, nothing else', async () => {
    const t = await boot();
    const rows = rowsOf(t.pane('letters'));
    assert.equal(t.pane('letters').children.length, 5);
    assert.deepEqual(keysOf(rows[0]), [...'qwertyuiop']);
    assert.deepEqual(keysOf(rows[1]), [...'asdfghjkl']);
    assert.deepEqual(keysOf(rows[2]), [...'zxcvbnm']);
    assert.deepEqual(keysOf(rows[3]), ['shift', ' ', '.', 'back']);
    assert.equal(t.pane('letters').querySelectorAll('.vk-key').length, 30);
    assert.deepEqual(t.pane('letters').querySelectorAll('[data-vk-letter]').map((k) => k.textContent).join(''), 'QWERTYUIOPASDFGHJKLZXCVBNM');
    const space = t.act('space');
    assert.match(space.innerHTML, /<svg/);
    assert.match(space.innerHTML, /<span>Space<\/span>/);
  });

  it('numpad layout matches the uploaded image: 3 by 3 digits and a 00, 0, dot, backspace row', async () => {
    const t = await boot();
    const rows = rowsOf(t.pane('pad'));
    assert.equal(t.pane('pad').children.length, 4);
    assert.deepEqual(rows.map(keysOf), [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['00', '0', '.', 'back']]);
    assert.equal(t.pane('pad').querySelectorAll('.vk-key').length, 13);
    assert.ok(t.pane('pad').querySelector('.is-double'));
    assert.equal(t.pane('pad').querySelector('.vk-dot'), null);
  });

  it('has a status dot and a hidden SHIFT badge above the letters only', async () => {
    const t = await boot();
    const head = t.pane('letters').querySelector('.vk-head');
    assert.ok(head.querySelector('.vk-dot'));
    assert.ok(head.querySelector('.vk-shift-badge').classList.contains('d-none'));
    assert.equal(head.querySelector('.vk-shift-badge').textContent, 'SHIFT');
    assert.equal(t.dock.querySelectorAll('.vk-dot').length, 1);
  });

  it('has no enter, hide, symbols, comma or label keys', async () => {
    const t = await boot();
    const all = t.dock.querySelectorAll('.vk-key').map((k) => k.getAttribute('data-vk-act') ?? k.getAttribute('data-vk-ch'));
    for (const banned of ['enter', 'hide', 'symbols', 'letters', ',', '-', '+']) assert.ok(!all.includes(banned), banned);
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

  it('stays out of the way of email, password and web address fields', async () => {
    const t = await boot();
    for (const type of ['email', 'password', 'url']) {
      t.focus(t.input({ type }));
      assert.ok(t.isHidden(), type);
    }
    t.focus(t.input({ type: 'text', inputmode: 'email' }));
    assert.ok(t.isHidden());
  });

  it('types lower case by default and shift is a toggle like the upload', async () => {
    const t = await boot();
    const f = t.input({ type: 'text' });
    t.focus(f);
    const L = t.pane('letters');
    t.down(t.keyByCh(L, 'q'));
    assert.equal(f.value, 'q');
    t.down(t.act('shift'));
    assert.ok(t.act('shift').classList.contains('is-on'));
    assert.ok(!L.querySelector('.vk-shift-badge').classList.contains('d-none'));
    t.down(t.keyByCh(L, 'a'));
    t.down(t.keyByCh(L, 'b'));
    assert.equal(f.value, 'qAB');
    t.down(t.act('shift'));
    assert.ok(!t.act('shift').classList.contains('is-on'));
    assert.ok(L.querySelector('.vk-shift-badge').classList.contains('d-none'));
    t.down(t.keyByCh(L, 'c'));
    assert.equal(f.value, 'qABc');
  });

  it('types space and the period on the letters keyboard', async () => {
    const t = await boot();
    const f = t.input({ type: 'text' });
    t.focus(f);
    t.down(t.keyByCh(t.pane('letters'), 'a'));
    t.down(t.act('space'));
    t.down(t.keyByCh(t.pane('letters'), '.'));
    assert.equal(f.value, 'a .');
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
    assert.equal(f.value, 'z');
    assert.equal(f.events.length, 1);
    assert.equal(f.events[0].type, 'input');
    assert.equal(f.events[0].data, 'z');
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

  it('ignores focus on non-text controls', async () => {
    const t = await boot();
    t.focus(t.input({ type: 'checkbox' }));
    assert.ok(t.isHidden());
    t.focus(t.input({ type: 'date' }));
    assert.ok(t.isHidden());
  });

  it('keeps the system keyboard away from fields already in the page, except email and password', async () => {
    const dec = field({ type: 'text', inputmode: 'decimal' });
    const mail = field({ type: 'email' });
    const t = await boot({ fields: [dec, mail] });
    assert.equal(dec.getAttribute('inputmode'), 'none');
    assert.equal(dec.getAttribute('data-vk-mode'), 'decimal');
    assert.equal(mail.getAttribute('inputmode'), null);
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
    assert.match(dropdown, /return bottom - \(window\.__vkInset \|\| 0\);/);
  });

  it('uses the app theme tokens for the tinted keys, with no separate stylesheet or CDN', () => {
    assert.doesNotMatch(kb, /tailwind|cdn\.|googleapis|<style/i);
    assert.match(css, /\.vk-key\.is-shift \{[^}]*var\(--accent-indigo\)/);
    assert.match(css, /\.vk-key\.is-back \{[^}]*var\(--danger\)/);
    assert.match(css, /\.vk-key\.is-double \{ color: var\(--warning\); \}/);
    assert.match(css, /\.vk-dot \{[^}]*var\(--accent-emerald\)/);
    assert.doesNotMatch(css, /\.vk-[^{]*\{[^}]*color-mix\([^)]*var\(--soft-bg\)/);
  });

  it('letters are one tenth of the row wide so the shorter rows centre like the image', () => {
    assert.match(css, /\.vk-key\.is-letter \{ flex: 0 0 calc\(\(100% - 54px\) \/ 10\); \}/);
    assert.match(css, /\.vk-row \{ display: flex; justify-content: center; gap: 6px;/);
  });

  it('pads the page, login screen, dialogs and sheets while the keyboard is open', () => {
    assert.match(css, /html\.vk-open body \{ padding-bottom: var\(--vk-h, 0px\); \}/);
    assert.match(css, /html\.vk-open \.standalone-screen, html\.vk-open \.dlg-overlay, html\.vk-open \.auth-screen \{ padding-bottom: var\(--vk-h, 0px\);/);
    assert.match(css, /html\.vk-open \.cm-sheet \{ bottom: var\(--vk-h, 0px\); \}/);
  });

  it('sits above the login screen, dialogs, sheets and suggestion lists but below toasts', () => {
    const z = [...css.matchAll(/z-index: (\d+)/g)].map((m) => Number(m[1]));
    const dock = 100000;
    assert.match(css, /\.vk-dock \{ position: fixed;[^}]*z-index: 100000;/);
    assert.ok(Math.max(...z.filter((n) => n < 2147483000 && n !== dock)) < dock);
    assert.ok(z.filter((n) => n > dock).every((n) => n >= 2147483000));
    assert.match(css, /\.auth-screen \{\n  position: fixed; inset: 0; z-index: 99999;/);
  });
});
