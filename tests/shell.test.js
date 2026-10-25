import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const files = ['index.html', ...readdirSync(new URL('modules/', root)).filter((n) => n.endsWith('.js')).map((n) => 'modules/' + n)];
const css = read('app.css');

describe('app shell', () => {
  it('every top bar is a shell-bar', () => {
    for (const file of files) {
      for (const m of read(file).matchAll(/class=\\?"([^"\\]*)/g)) {
        const t = m[1].split(/\s+/);
        if (t.includes('screen-topbar') || t.includes('system-controls')) {
          assert.ok(t.includes('shell-bar'), `${file}: ${m[1]} is missing shell-bar`);
        }
      }
    }
  });

  it('sidebar buttons share one sidebar-item class', () => {
    for (const file of files) {
      const src = read(file);
      assert.ok(!/sidebar-nav-btn|sidebar-settings-btn/.test(src), `${file} still uses a legacy sidebar button class`);
    }
    assert.ok(!/sidebar-nav-btn|sidebar-settings-btn/.test(css), 'css still has legacy sidebar button selectors');
  });

  it('the shell bar surface is defined once', () => {
    const rules = [...css.matchAll(/^\.shell-bar \{([^}]*)\}/gm)].filter((m) => m[1].includes('var(--soft-card)'));
    assert.equal(rules.length, 1);
  });
});
