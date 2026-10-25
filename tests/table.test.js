import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const markup = ['index.html', ...readdirSync(new URL('modules/', root)).filter((n) => n.endsWith('.js')).map((n) => 'modules/' + n)];
const css = read('app.css');

describe('shared table class', () => {
  it('every <table> in markup is a .table', () => {
    const bad = [];
    for (const file of markup) {
      for (const m of read(file).matchAll(/<table\b[^>]*>/g)) {
        const cls = /class=\\?"([^"\\]*)\\?"/.exec(m[0]);
        if (!cls || !cls[1].split(/\s+/).includes('table')) bad.push(`${file}: ${m[0]}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  it('markup no longer uses the legacy table surfaces', () => {
    for (const file of markup) {
      const src = read(file);
      assert.ok(!/\bcomp-table\b/.test(src), `${file} still uses comp-table`);
      assert.ok(!/\bu-table-(?:full|td)\b/.test(src), `${file} still uses a legacy table helper`);
    }
  });

  it('css styles tables through .table only', () => {
    assert.ok(!/\.comp-table(?![\w-])/.test(css), 'no .comp-table selectors');
    assert.ok(!/\.u-table-(?:full|td)(?![\w-])/.test(css), 'no legacy table helper selectors');
    const lines = css.split('\n');
    const offenders = lines.map((l, i) => [i + 1, l]).filter(([, l]) => /^\s*(?:table|thead|tbody|th|td)\b[^{]*\{/.test(l) || /^\s*(?:tbody )?tr:hover\b/.test(l));
    assert.deepEqual(offenders, [], 'style tables with the .table class, not bare element selectors');
  });

  it('css defines the table surface once', () => {
    const surfaces = [...css.matchAll(/^\.table \{([^}]*)\}/gm)];
    assert.equal(surfaces.length, 1, 'exactly one .table rule defines the surface');
  });
});
