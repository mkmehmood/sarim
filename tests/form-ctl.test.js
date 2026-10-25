import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const files = [
  'index.html',
  ...readdirSync(new URL('modules/', root)).filter((n) => n.endsWith('.js')).map((n) => 'modules/' + n),
];
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const SKIP_TYPES = new Set(['hidden', 'file', 'checkbox', 'radio', 'range', 'color', 'button', 'submit', 'reset', 'image']);

function tagEnd(src, start) {
  let q = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (q === null) {
      if (c === '\\' && src[i + 1] === '"') { q = '\\"'; i++; continue; }
      if (c === '"' || c === "'") { q = c; continue; }
      if (c === '>') return i;
    } else if (q === '\\"') {
      if (c === '\\' && src[i + 1] === '"') { q = null; i++; }
    } else if (c === q) q = null;
  }
  return -1;
}

describe('shared form control class', () => {
  it('every text-like input, select and textarea carries form-ctl', () => {
    const missing = [];
    for (const file of files) {
      const src = read(file);
      const re = /<(input|select|textarea)\b/g;
      let m;
      while ((m = re.exec(src))) {
        const end = tagEnd(src, m.index);
        if (end < 0) continue;
        const tag = src.slice(m.index, end + 1);
        const t = /\btype=\\?"([^"\\]*)/.exec(tag);
        const type = t ? t[1].toLowerCase() : 'text';
        if (m[1] === 'input' && SKIP_TYPES.has(type)) continue;
        if (!/\bform-ctl\b/.test(tag)) missing.push(`${file}:${src.slice(0, m.index).split('\n').length} ${tag.slice(0, 80)}`);
      }
    }
    assert.deepEqual(missing, []);
  });

  it('every date-picker button carries form-ctl', () => {
    for (const file of files) {
      const bad = [...read(file).matchAll(/class=\\?"([^"\\]*(?<![\w-])cdp-btn(?![\w-])[^"\\]*)/g)].filter((m) => !/\bform-ctl\b/.test(m[1]));
      assert.deepEqual(bad.map((m) => m[1]), [], `${file} has a cdp-btn without form-ctl`);
    }
  });

  it('legacy per-control picker classes are gone from markup', () => {
    for (const file of files) {
      assert.ok(
        !/class=\\?"[^"]*\b(store-selector|sales-rep-metric-dropdown)\b/.test(read(file)),
        `${file} still uses a legacy picker class`,
      );
    }
  });
});
