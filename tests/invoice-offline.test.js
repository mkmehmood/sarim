import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../modules/cm-ledger.js', import.meta.url), 'utf8') + readFileSync(new URL('../modules/dialog-image.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

describe('digital invoice works offline', () => {
  it('draws the picture locally with no network or CDN dependency', () => {
    assert.doesNotMatch(src.replace(/http:\/\/www\.w3\.org\/\d+\/[a-z]+/g, ''), /https?:\/\//, 'no remote URLs');
    assert.doesNotMatch(src, /loadScript|jspdf/i, 'no remote scripts or PDF library');
    assert.match(src, /canvas/);
  });
  it('precaches the modules and logo it needs', () => {
    for (const f of ['./modules/cm-ledger.js', './modules/stmt-range.js', './modules/dialog-image.js', './brand-logo.jpg']) assert.ok(sw.includes(`'${f}'`), f);
  });
});
