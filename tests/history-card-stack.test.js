import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const IGNORE = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8').split('\n');

describe('history card stack', () => {
  it('pads every card the next one slides over, so icons and chips are never clipped', () => {
    assert.match(CSS, /\.hc-card:has\(\+ \.hc-card\) \{ padding-bottom: calc\(14px \+ var\(--hc-overlap\)\); \}/);
    assert.match(CSS, /transition: [^;]*padding 0\.3s/);
  });

  it('gives each tone its own background design, not just its own colour', () => {
    for (const tone of ['good', 'bad', 'warn', 'info', 'muted']) {
      assert.match(CSS, new RegExp(`\\.hc-card\\.is-${tone} \\{[^}]*--hc-c:[^}]*background-image`), `${tone} has no design`);
    }
  });

  it('pops the amount when a card opens and respects reduced motion', () => {
    assert.match(CSS, /\.hc-card\.is-open \.hc-amt \{ animation: hc-pop /);
    assert.match(CSS, /@keyframes hc-pop /);
    assert.match(CSS, /prefers-reduced-motion: reduce\) \{\s*\.hc-card, [^{]*\.hc-card\.is-open \.hc-amt \{ animation: none; \}/);
  });
});

describe('history cards vs the global card rules', () => {
  it('are not hit by blanket background, border or shadow !important overrides', () => {
    assert.doesNotMatch(CSS, /\.card[^{]*\{\s*background:\s*var\(--glass\)\s*!important/);
  });
});

describe('repository hygiene', () => {
  it('ignores node_modules even when it is a symlink', () => {
    assert.ok(IGNORE.includes('node_modules'));
  });
});
