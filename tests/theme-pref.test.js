import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePref, nextPref, prefLabel, resolveTheme } from '../modules/theme-pref.js';

describe('theme preference', () => {
  it('cycles auto, light, dark', () => {
    assert.equal(nextPref('auto'), 'light');
    assert.equal(nextPref('light'), 'dark');
    assert.equal(nextPref('dark'), 'auto');
  });

  it('falls back to dark for unknown values', () => {
    assert.equal(normalizePref(null), 'dark');
    assert.equal(normalizePref('blue'), 'dark');
  });

  it('keeps explicit choices and labels them', () => {
    assert.equal(resolveTheme('light'), 'light');
    assert.equal(resolveTheme('dark'), 'dark');
    assert.equal(prefLabel('auto'), 'Auto');
  });

  it('draws the top status band from the theme, not a fixed blue', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
    const start = css.indexOf('#sys-header {\n');
    const band = css.slice(start, css.indexOf('}', start));
    assert.doesNotMatch(band, /accent-blue/);
    assert.match(band, /background: var\(--bg\);/);
    assert.doesNotMatch(css.slice(css.indexOf('.shell-bar {'), css.indexOf('.toggle-group {')), /radial-gradient|soft-card/);
  });
});
