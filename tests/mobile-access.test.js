import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');

describe('phone accessibility', () => {
  it('keeps the original viewport so the first touch on a scroll is never held for a zoom gesture', () => {
    assert.match(html, /<meta name="viewport" id="app-viewport" content="width=device-width, initial-scale=1\.0, maximum-scale=1\.0, user-scalable=no">/);
    assert.match(html, /setAttribute\("content","width=device-width, initial-scale=1\.0, maximum-scale=1\.0, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-visual"\)/);
  });
  it('has no page-wide background scanner that could stall touch handling', () => {
    const main = readFileSync(new URL('../modules/main.js', import.meta.url), 'utf8');
    assert.doesNotMatch(main, /a11y-labels|startAccessibleNames/);
  });
  it('gives search boxes and file pickers a fixed accessible name in the markup', () => {
    for (const id of ['approvals-search', 'entity-trans-search', 'expense-history-search', 'cust-trans-search']) {
      assert.match(html, new RegExp(`id="${id}"[^>]*aria-label="[^"]+"`), id);
    }
  });
  it('uses 16px text in fields on iPhone so Safari does not zoom on focus', () => {
    assert.match(css, /@supports \(-webkit-touch-callout: none\) \{\s*\.form-ctl, input, select, textarea \{ font-size: 16px; \}/);
  });
  it('makes small buttons a 44px touch target on touch screens', () => {
    assert.match(css, /@media \(pointer: coarse\) \{\s*\.btn-sm \{ height: 44px; min-height: 44px; \}/);
  });
});
