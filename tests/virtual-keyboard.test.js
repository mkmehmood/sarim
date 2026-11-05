import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  QWERTY_ROWS, NUMPAD_ROWS, NUMPAD_BOTTOM, layoutForField, keyText, insertManual, backspaceManual, dockHtml, pickLabel,
} from '../modules/virtual-keyboard.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const el = (tag, attrs = {}, extra = {}) => ({
  tagName: tag, disabled: false, readOnly: false, ...extra,
  getAttribute: (n) => (n in attrs ? attrs[n] : null),
  hasAttribute: (n) => n in attrs,
});

describe('layoutForField', () => {
  it('opens the numpad for number, tel, numeric and decimal fields and data-layout', () => {
    assert.equal(layoutForField(el('INPUT', { type: 'number' })), 'numpad');
    assert.equal(layoutForField(el('INPUT', { type: 'tel' })), 'numpad');
    assert.equal(layoutForField(el('INPUT', { type: 'text', inputmode: 'decimal' })), 'numpad');
    assert.equal(layoutForField(el('INPUT', { type: 'text', inputmode: 'numeric' })), 'numpad');
    assert.equal(layoutForField(el('INPUT', { type: 'text', 'data-layout': 'numpad' })), 'numpad');
  });
  it('opens the letters keyboard for text, search and textarea', () => {
    assert.equal(layoutForField(el('INPUT', { type: 'text' })), 'qwerty');
    assert.equal(layoutForField(el('INPUT', {})), 'qwerty');
    assert.equal(layoutForField(el('INPUT', { type: 'search' })), 'qwerty');
    assert.equal(layoutForField(el('TEXTAREA', {})), 'qwerty');
  });
  it('leaves fields this layout cannot type into to the phone keyboard', () => {
    for (const type of ['email', 'password', 'url', 'date', 'file', 'checkbox', 'hidden']) {
      assert.equal(layoutForField(el('INPUT', { type })), null, type);
    }
    assert.equal(layoutForField(el('INPUT', { type: 'text', inputmode: 'email' })), null);
    assert.equal(layoutForField(el('INPUT', { type: 'text', 'data-keyboard': 'native' })), null);
    assert.equal(layoutForField(el('INPUT', { type: 'text', dir: 'rtl' })), null);
    assert.equal(layoutForField(el('INPUT', { type: 'text' }, { readOnly: true })), null);
    assert.equal(layoutForField(el('INPUT', { type: 'text' }, { disabled: true })), null);
    assert.equal(layoutForField(el('SELECT', {})), null);
    assert.equal(layoutForField(null), null);
  });
  it('judges a field by its own inputmode even after the keyboard overrides it', () => {
    assert.equal(layoutForField(el('INPUT', { type: 'text', inputmode: 'none' }), 'decimal'), 'numpad');
    assert.equal(layoutForField(el('INPUT', { type: 'text', inputmode: 'none' }), ''), 'qwerty');
  });
});

describe('typing helpers', () => {
  const field = (value, start, end) => {
    const f = { value, selectionStart: start, selectionEnd: end, events: 0,
      setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; },
      dispatchEvent() { this.events++; } };
    return f;
  };
  global.Event = global.Event || class {};
  it('inserts at the caret and replaces a selection', () => {
    const f = field('ab', 1, 1);
    insertManual(f, 'X');
    assert.deepEqual([f.value, f.selectionStart, f.events], ['aXb', 2, 1]);
    const g = field('hello', 1, 4);
    insertManual(g, '00');
    assert.equal(g.value, 'h00o');
  });
  it('erases one character, a selection, and nothing at the start', () => {
    const f = field('abc', 2, 2);
    backspaceManual(f);
    assert.deepEqual([f.value, f.selectionStart], ['ac', 1]);
    const g = field('abcd', 1, 3);
    backspaceManual(g);
    assert.equal(g.value, 'ad');
    const h = field('abc', 0, 0);
    backspaceManual(h);
    assert.deepEqual([h.value, h.events], ['abc', 0]);
  });
  it('applies shift only to letters', () => {
    assert.equal(keyText('Q', false), 'q');
    assert.equal(keyText('q', true), 'Q');
    assert.equal(keyText('.', true), '.');
    assert.equal(keyText('00', true), '00');
    assert.equal(keyText(' ', true), ' ');
  });
});

describe('layout matches the design exactly, nothing added or removed', () => {
  const html = dockHtml();
  const keys = (re) => [...html.matchAll(re)];
  it('has the letter rows from the screenshot', () => {
    assert.deepEqual(QWERTY_ROWS.map(r => r.join('')), ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']);
  });
  it('has the numpad from the screenshot: 1-9 then 00, 0, ., backspace', () => {
    assert.deepEqual(NUMPAD_ROWS.map(r => r.join('')), ['123', '456', '789']);
    assert.deepEqual([...NUMPAD_BOTTOM], ['00', '0', '.']);
  });
  it('contains exactly 26 letters + shift, space, period, backspace, and 9 digits + 00, 0, period, backspace', () => {
    assert.equal(keys(/<button /g).length, 26 + 4 + 9 + 4);
    assert.equal(keys(/class="vk-key vk-shift"/g).length, 1);
    assert.equal(keys(/class="vk-key vk-space"/g).length, 1);
    assert.equal(keys(/class="vk-key vk-period"/g).length, 1);
    assert.equal(keys(/vk-key vk-back /g).length, 2);
    assert.equal(keys(/vk-double/g).length, 1);
  });
  it('has no keys beyond the design: no enter, comma, symbols, language or mode switch', () => {
    const labels = keys(/>([^<]+)<\/button>/g).map(m => m[1]);
    for (const bad of ['Enter', ',', '@', '123', 'ABC', '?', '!', '-', '/']) assert.equal(labels.includes(bad), false, bad);
  });
  it('keeps the green dot and the hidden SHIFT badge in the header', () => {
    assert.match(html, /<span class="vk-dot"><\/span><span id="vk-shift-badge" class="vk-shift-badge" hidden>SHIFT<\/span>/);
  });
  it('puts the numpad in a separate, initially hidden layout', () => {
    assert.match(html, /id="vk-numpad" class="vk-numpad" hidden/);
    assert.match(html, /<button type="button" class="vk-key vk-space" data-key=" "><svg/);
  });
});

describe('styling uses the app theme', () => {
  const css = read('../app.css');
  it('uses app tokens for surfaces, borders, text, accents and danger', () => {
    const block = css.slice(css.indexOf('.vk-dock {'), css.indexOf('@keyframes vkPulse'));
    for (const t of ['var(--bg)', 'var(--glass-border-strong)', 'var(--text-main)', 'var(--accent-indigo)', 'var(--danger)', 'var(--warning)', 'var(--accent-emerald)', 'var(--font-ui)']) {
      assert.ok(block.includes(t), t);
    }
    assert.equal(/#[0-9a-fA-F]{3,6}\b/.test(block), false);
  });
  it('uses the design sizes: 44/48 letter keys, 48/56 number keys, indented rows', () => {
    assert.match(css, /\.vk-key \{[^}]*height: 44px;[^}]*border-radius: 8px;/);
    assert.match(css, /\.vk-num \{ height: 48px; border-radius: 12px;/);
    assert.match(css, /\.vk-row-2 \{ padding: 0 12px; \}/);
    assert.match(css, /\.vk-row-3 \{ padding: 0 24px; \}/);
    assert.match(css, /\.vk-shift \{ flex: 0 0 64px;/);
    assert.match(css, /\.vk-period \{ flex: 0 0 56px;/);
    assert.match(css, /\.vk-numpad \{[^}]*max-width: 384px;/);
  });
  it('sits above sheets and dialogs and makes room for itself', () => {
    assert.match(css, /\.vk-dock \{[^}]*z-index: 10350;/);
    assert.match(css, /html\.vk-open body \{ padding-bottom: var\(--vk-height, 0px\); \}/);
    assert.match(css, /html\.vk-open \.standalone-screen \{ bottom: var\(--vk-height, 0px\); \}/);
  });
});

describe('behaviour wiring', () => {
  const src = read('../modules/virtual-keyboard.js');
  it('keeps focus in the field while keys are pressed', () => {
    assert.match(src, /dock\.addEventListener\('pointerdown', onKeyDown\)/);
    assert.match(src, /e\.preventDefault\(\);\n\s*if \(btn\.dataset\.act === 'shift'\)/);
  });
  it('stops the phone keyboard by overriding inputmode and restores it afterwards', () => {
    assert.match(src, /el\.setAttribute\('inputmode', 'none'\)/);
    assert.match(src, /function restoreNative\(el\)/);
  });
  it('types through the editing pipeline so number fields accept decimals', () => {
    assert.match(src, /execCommand\(name, false, arg\)/);
    assert.match(src, /runCommand\(el, 'insertText', text\)/);
  });
  it('only installs inside the Android app, behind a Settings switch', () => {
    assert.match(src, /if \(!force && !isAndroidApp\(\)\) return null;/);
    assert.match(src, /localStorage\.getItem\(PREF_KEY\) !== 'off'/);
    assert.equal(pickLabel(true), 'Virtual Keyboard: On');
    assert.equal(pickLabel(false), 'Virtual Keyboard: Off');
    assert.ok(read('../index.html').includes('id="vk-toggle-btn"'));
    assert.match(read('../modules/settings-screen.js'), /syncKeyboardButton\(\)/);
    assert.ok(read('../sw.js').includes("'./modules/virtual-keyboard.js'"));
    assert.ok(read('../modules/main.js').includes("import './virtual-keyboard.js';"));
  });
});

describe('fields that need digits or symbols keep the phone keyboard', () => {
  const html = read('../index.html');
  const ids = ['edit-cust-address', 'rep-edit-cust-address', 'entityWallet', 'dl-ref', 'stock-transfer-note', 'payment-transfer-note', 'dl-note', 'quickExpenseDescription', 'expenseDescription', 'approvals-search', 'acct-new-email', 'acct-new-password'];
  it('marks address, account, reference, note and amount-search fields as native', () => {
    for (const id of ids.slice(0, 10)) {
      const tag = html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`))[0];
      assert.match(tag, /data-keyboard="native"/, id);
    }
  });
  it('already leaves email and password fields native by type', () => {
    for (const id of ids.slice(10)) {
      const tag = html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`))[0];
      assert.equal(layoutForField(el('INPUT', { type: (tag.match(/type="([a-z]+)"/) || [])[1] })), null, id);
    }
  });
  it('keeps names, materials and customer searches on the letters keyboard', () => {
    for (const id of ['entityName', 'edit-cust-name', 'rep-cust-name', 'cust-name', 'factoryMaterialName', 'acct-new-name']) {
      const tag = html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`))[0];
      assert.doesNotMatch(tag, /data-keyboard/, id);
    }
  });
});
