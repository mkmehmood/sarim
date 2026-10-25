import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const markup = ['index.html', ...readdirSync(new URL('modules/', root)).filter((n) => n.endsWith('.js')).map((n) => 'modules/' + n)];
const sheet = postcss.parse(read('app.css'));

const NOT_PILLS = new Set([
  'cm-row', 'cm-month-head', 'cm-menu-item', 'dl-row-line', 'formula-fab-item', 'pf-locate',
  'form-ctl', 'fb-select', 'bm-picker', 'cdp-btn', 'dlg-option', 'pp-badge'
]);

const norm = (s) => s.replace(/:not\(\._\)/g, '').replace(/\s+/g, ' ').trim();
const radiusRules = [];
sheet.walkDecls('border-radius', (d) => {
  if (d.parent.type !== 'rule') return;
  radiusRules.push({ selectors: d.parent.selector.split(',').map(norm), value: d.value, line: d.source.start.line });
});
const pillRule = radiusRules.find((r) => r.selectors.includes('.btn'));
const pills = new Set(pillRule ? pillRule.selectors : []);

describe('shared pill button shape', () => {
  it('one rule makes every button class a pill', () => {
    assert.ok(pillRule, 'a rule sets border-radius on .btn');
    assert.equal(pillRule.value, '999px');
    for (const c of ['.btn', '.btn-main', '.btn-theme', '.btn-sm', '.btn-danger', '.toggle-opt', '.dlg-btn', '.sidebar-item']) {
      assert.ok(pills.has(c), `${c} is in the shared pill rule`);
    }
  });

  it('no other rule sets a radius on a pill button', () => {
    const stray = radiusRules
      .filter((r) => r !== pillRule)
      .filter((r) => r.selectors.some((s) => pills.has(s)))
      .map((r) => `${r.selectors.join(', ')} { ${r.value} } at line ${r.line}`);
    assert.deepEqual(stray, [], 'declare the radius once, in the shared pill rule');
  });

  it('every button class used in markup is a pill or an explicit exception', () => {
    const missing = new Set();
    for (const file of markup) {
      for (const m of read(file).matchAll(/<button\b[^>]*class=\\?"([^"\\]*)\\?"/g)) {
        const tokens = m[1].split(/\s+/).filter((t) => /^(btn(-|$)|[a-z]+-btn$)|^toggle-opt$|^sidebar-item$/.test(t));
        for (const t of tokens) if (!pills.has('.' + t) && !NOT_PILLS.has(t)) missing.add(t);
      }
    }
    assert.deepEqual([...missing], [], 'add the class to the shared pill rule');
  });
});
