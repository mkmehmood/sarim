import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');

describe('phone accessibility', () => {
  it('never blocks pinch zoom', () => {
    assert.doesNotMatch(html, /user-scalable\s*=\s*no/);
    assert.doesNotMatch(html, /maximum-scale\s*=\s*1(\.0)?\b/);
  });
  it('uses 16px text in fields on iPhone so Safari does not zoom on focus', () => {
    assert.match(css, /@supports \(-webkit-touch-callout: none\) \{\s*\.form-ctl, input, select, textarea \{ font-size: 16px; \}/);
  });
  it('makes small buttons a 44px touch target on touch screens', () => {
    assert.match(css, /@media \(pointer: coarse\) \{\s*\.btn-sm \{ height: 44px; min-height: 44px; \}/);
  });
});
