import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clamp, normalizeDim, coverScale, clampPan, zoomAt, backgroundValue, MAX_ZOOM } from '../modules/custom-background.js';

describe('custom background maths', () => {
  it('clamps and normalises dim', () => {
    assert.equal(clamp(9, 0, 5), 5);
    assert.equal(normalizeDim('abc'), 35);
    assert.equal(normalizeDim(500), 80);
    assert.equal(normalizeDim(-3), 0);
  });
  it('covers the viewport at zoom 1 and cannot pan then', () => {
    assert.equal(coverScale(2000, 1000, 400, 800), 0.8);
    const p = clampPan(500, 500, 2000, 1000, 400, 800, 1);
    assert.equal(p.ty, 0);
    assert.ok(Math.abs(p.tx) <= (2000 * 0.8 - 400) / 2);
  });
  it('never lets the picture leave a gap at the edges', () => {
    const p = clampPan(-9999, 9999, 1000, 1000, 400, 800, 2);
    const s = coverScale(1000, 1000, 400, 800) * 2;
    assert.ok(Math.abs(p.tx) <= (1000 * s - 400) / 2);
    assert.ok(Math.abs(p.ty) <= (1000 * s - 800) / 2);
  });
  it('zooms around the pinch point and caps zoom', () => {
    const v = { zoom: 1, tx: 0, ty: 0 };
    const z = zoomAt(v, 100, 200, 400, 1000, 1000, 400, 800);
    assert.equal(z.zoom, MAX_ZOOM);
    assert.equal(zoomAt(v, 0.2, 10, 10, 1000, 1000, 400, 800).zoom, 1);
    const mid = zoomAt(v, 2, 200, 400, 1000, 1000, 400, 800);
    assert.equal(mid.tx, 0);
    assert.equal(mid.ty, 0);
  });
  it('builds a css background that follows the theme', () => {
    const css = backgroundValue('data:image/jpeg;base64,AAA', 40);
    assert.match(css, /var\(--bg\) 40%/);
    assert.match(css, /url\("data:image\/jpeg;base64,AAA"\)/);
  });
  it('is offered in settings for every role and survives sign out', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.ok(html.includes('id="sidebar-btn-bg"'));
    assert.ok(html.includes('id="background-screen"'));
    const s = readFileSync(new URL('../modules/settings-screen.js', import.meta.url), 'utf8');
    assert.ok(s.includes("'sidebar-btn-bg'"));
    const w = readFileSync(new URL('../modules/data-wipe.js', import.meta.url), 'utf8');
    assert.ok(w.includes('sarim_bg_image'));
  });
});
