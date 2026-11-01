import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const markup = ['index.html', ...readdirSync(new URL('modules/', root)).filter((n) => n.endsWith('.js')).map((n) => 'modules/' + n)];
const css = read('app.css');

describe('shared card class', () => {
  it('markup no longer uses the legacy surface classes', () => {
    for (const file of markup) {
      const src = read(file);
      assert.ok(!/class=\\?"[^"]*\bliquid-card\b/.test(src), `${file} still uses liquid-card`);
      assert.ok(!/class=\\?"(?:[^"]*\s)?section(?:\s[^"]*)?\\?"/.test(src), `${file} still uses the section class`);
      assert.ok(!/['"`]liquid-card['"`]/.test(src), `${file} still references liquid-card`);
    }
  });

  it('css defines the card surface once and has no legacy surface selectors', () => {
    const surfaces = [...css.matchAll(/^\.card \{([^}]*)\}/gm)].filter((m) => m[1].includes('var(--soft-card)'));
    assert.equal(surfaces.length, 1, 'exactly one .card rule defines the surface');
    assert.ok(!/\.liquid-card(?![\w-])/.test(css), 'no .liquid-card selectors');
    assert.ok(!/\.section(?![\w-])/.test(css), 'no .section selectors');
    assert.ok(!/\.(entity-card|overview-card)(?![\w-])/.test(css), 'no dead entity/overview card selectors');
  });

  it('every card variant is a card', () => {
    const variants = ['sx-card', 'sm-card', 'pf-section', 'pf-identity', 'chart-box', 'result-box', 'hc-card', 'cust-history-item', 'factory-history-item', 'settings-list-item', 'cm-day', 'bf-card'];
    const missing = [];
    for (const file of markup) {
      const src = read(file);
      for (const m of src.matchAll(/class=\\?"([^"\\]*)\\?"/g)) {
        const t = m[1].split(/\s+/);
        for (const v of variants) if (t.includes(v) && !t.includes('card')) missing.push(`${file}: ${m[1].slice(0, 60)}`);
      }
    }
    assert.deepEqual(missing, []);
  });
});
