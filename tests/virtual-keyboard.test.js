import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  QWERTY_ROWS, NUMPAD_OPS, NUMPAD_ROWS, NUMPAD_SIDE, NUMPAD_BOTTOM, SYMBOL_ROWS, TOOLS, layoutForField, keyText, insertManual, backspaceManual, dockHtml,
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
  it('uses the app keyboard for email, password, web address and right-to-left fields too', () => {
    for (const type of ['email', 'password', 'url']) assert.equal(layoutForField(el('INPUT', { type })), 'qwerty', type);
    assert.equal(layoutForField(el('INPUT', { type: 'text', inputmode: 'email' })), 'qwerty');
    assert.equal(layoutForField(el('INPUT', { type: 'text', 'data-keyboard': 'native' })), 'qwerty');
    assert.equal(layoutForField(el('INPUT', { type: 'text', dir: 'rtl' })), 'qwerty');
  });
  it('ignores controls that are not typed into, and disabled or read-only fields', () => {
    for (const type of ['date', 'file', 'checkbox', 'hidden']) assert.equal(layoutForField(el('INPUT', { type })), null, type);
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
  const count = (re) => [...html.matchAll(re)].length;
  it('has the letter rows from the screenshot', () => {
    assert.deepEqual(QWERTY_ROWS.map(r => r.join('')), ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']);
  });
  it('has the numpad from the screenshot: operators on the left, 1-9, % space backspace on the right, bottom row', () => {
    assert.deepEqual([...NUMPAD_OPS], ['+', '-', '\u00d7', '\u00f7']);
    assert.deepEqual(NUMPAD_ROWS.map(r => r.join('')), ['123', '456', '789']);
    assert.deepEqual([...NUMPAD_SIDE], ['%', 'space', 'back']);
    assert.deepEqual([...NUMPAD_BOTTOM], ['letters', 'symbols', '0', '00', '=', '.', 'enter']);
  });
  it('has a symbols page and two tools', () => {
    assert.equal(SYMBOL_ROWS.length, 3);
    assert.equal(TOOLS.length, 2);
  });
  it('letters page: tools row, 10/9/7 letters with shift and backspace, then 123, comma, English space, period, enter', () => {
    const qwerty = html.slice(html.indexOf('id="vk-qwerty"'), html.indexOf('id="vk-numpad"'));
    assert.deepEqual([...qwerty.matchAll(/data-act="([a-z]+)"/g)].map((m) => m[1]),
      ['paste', 'selectall', 'shift', 'back', 'pad', 'enter']);
    assert.equal((qwerty.match(/class="vk-key"/g) || []).length, 26);
    assert.match(qwerty, /vk-space vk-w40" data-key=" " aria-label="Space">English</);
    assert.match(qwerty, /vk-row vk-row-bottom/);
  });
  it('numpad page is separate and initially hidden, with the tall operator and side columns', () => {
    assert.match(html, /id="vk-numpad" class="vk-numpad" hidden/);
    assert.match(html, /class="vk-col vk-ops"/);
    assert.match(html, /class="vk-col vk-digits"/);
    assert.match(html, /class="vk-col vk-side"/);
    assert.match(html, /data-act="symbols"[^>]*>!\?#</);
    assert.equal(count(/vk-w14/g) >= 1, true);
  });
  it('symbols page is separate and initially hidden', () => {
    assert.match(html, /id="vk-symbols" class="vk-symbols" hidden/);
  });
  it('shift and enter are accent coloured, the status dot and SHIFT badge are gone', () => {
    assert.match(html, /vk-key vk-shift" data-act="shift"/);
    assert.equal(count(/vk-enter/g) >= 3, true);
    assert.equal(/vk-dot|vk-shift-badge|vk-head/.test(html), false);
  });
});

describe('styling uses the app theme', () => {
  const css = read('../app.css');
  it('uses app tokens for surfaces, borders, text, accents and danger', () => {
    const block = css.slice(css.indexOf('.vk-dock {'), css.indexOf('html.vk-open body'));
    for (const t of ['var(--bg)', 'var(--glass-border-strong)', 'var(--text-main)', 'var(--accent-indigo)', 'var(--danger)', 'var(--font-ui)']) {
      assert.ok(block.includes(t), t);
    }
    assert.equal(/#[0-9a-fA-F]{3,6}\b/.test(block), false);
  });
  it('uses the design sizes: rounded 46px keys, indented rows, wide shift/enter/space, tall numpad', () => {
    assert.match(css, /\.vk-key \{[^}]*height: 46px;[^}]*border-radius: 12px;/);
    assert.match(css, /\.vk-row-2 \{ padding: 0 5%; \}/);
    assert.match(css, /\.vk-shift \{ flex: 1\.5 1 0;/);
    assert.match(css, /\.vk-w40 \{ flex-grow: 4; \}/);
    assert.match(css, /\.vk-digits \{ flex: 4\.65 1 0;/);
    assert.match(css, /\.vk-numpad \{[^}]*max-width: 480px;/);
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
    assert.match(src, /e\.preventDefault\(\);\n\s*const act = btn\.dataset\.act;\n\s*if \(act === 'shift'\)/);
  });
  it('stops the phone keyboard by overriding inputmode and restores it afterwards', () => {
    assert.match(src, /el\.setAttribute\('inputmode', 'none'\)/);
    assert.match(src, /function restoreNative\(el\)/);
  });
  it('types through the editing pipeline so number fields accept decimals', () => {
    assert.match(src, /execCommand\(name, false, arg\)/);
    assert.match(src, /runCommand\(el, 'insertText', text\)/);
  });
  it('only installs inside the Android app, with no switch to turn it off', () => {
    assert.match(src, /if \(!force && !isAndroidApp\(\)\) return null;/);
    assert.doesNotMatch(src, /localStorage|isEnabled|toggleVirtualKeyboard|syncKeyboardButton/);
    assert.ok(!read('../index.html').includes('vk-toggle-btn'));
    assert.ok(read('../sw.js').includes("'./modules/virtual-keyboard.js'"));
    assert.ok(read('../modules/main.js').includes("import './virtual-keyboard.js';"));
  });
});

describe('shift and credential fields', () => {
  const src = read('../modules/virtual-keyboard.js');
  it('shift relabels the letter keys, which start in lower case', () => {
    assert.match(src, /function relabelLetters\(\)/);
    assert.match(src, /k\.textContent = keyText\(key, shift\);/);
    assert.match(src, /btn\.setAttribute\('aria-pressed', String\(on\)\);\n  relabelLetters\(\);/);
    assert.match(src, /dock\.innerHTML = dockHtml\(\);\n  relabelLetters\(\);/);
  });
  it('email, password and url fields are turned into masked text fields so the phone keyboard has no reason to appear', () => {
    assert.match(src, /el\.setAttribute\('data-vk-type', type\);/);
    assert.match(src, /el\.setAttribute\('type', 'text'\);/);
    assert.match(read('../app.css'), /input\[data-vk-secret\] \{ -webkit-text-security: disc; \}/);
  });
});

describe('new keys', () => {
  const src = read('../modules/virtual-keyboard.js');
  it('switches between letters, numbers and symbols pages', () => {
    assert.match(src, /const PAGES = \{ letters: 'qwerty', pad: 'numpad', symbols: 'symbols' \};/);
    assert.match(src, /if \(PAGES\[act\]\) \{ showPage\(act\); return; \}/);
  });
  it('enter adds a line in a text area, otherwise sends Enter and submits the form if nothing handled it', () => {
    assert.match(src, /typeInto\(active, '\\n'\)/);
    assert.match(src, /new KeyboardEvent\('keydown', init\)/);
    assert.match(src, /form\.requestSubmit\(\)/);
  });
  it('tools: only paste and select all, both working, nothing disabled', () => {
    assert.match(src, /navigator\.clipboard\.readText\(\)/);
    assert.deepEqual(TOOLS.map((t) => t.act), ['paste', 'selectall']);
    assert.doesNotMatch(dockHtml(), /aria-disabled|data-act="(system|emoji|tools|voice|code|translate|settings|adjust)"/);
  });
});

describe('every text field uses the app keyboard', () => {
  const html = read('../index.html');
  it('no field is routed to the phone keyboard', () => {
    assert.doesNotMatch(html, /data-keyboard=/);
  });
});
