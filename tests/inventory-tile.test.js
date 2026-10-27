import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inventoryTone, inventoryTileModel, inventoryTileHtml } from '../modules/inventory-note.js';

const base = { production: 83, returns: 0, sold: 60 };
const tile = (available, quantity, extra = {}) => inventoryTileModel({ ...base, available, quantity, ...extra });

describe('stock tile model', () => {
  it('is idle and green before a quantity is typed', () => {
    const m = tile(23, 0);
    assert.equal(m.tone, 'ok');
    assert.equal(m.figure, '23');
    assert.equal(m.note, 'Ready to sell');
    assert.equal(m.used, 0);
  });

  it('shows what is left once a quantity fits comfortably', () => {
    const m = tile(23, 10);
    assert.equal(m.note, '13 kg left');
    assert.equal(m.used, 43.5);
  });

  it('turns amber when the sale would leave little', () => {
    const m = tile(23, 20);
    assert.equal(m.tone, 'low');
    assert.equal(m.note, 'Only 3 kg left');
  });

  it('turns red and says by how much the sale is over', () => {
    const m = tile(23, 30);
    assert.equal(m.tone, 'short');
    assert.equal(m.note, 'Over by 7 kg');
    assert.equal(m.used, 100);
  });

  it('handles an empty or negative stock without printing a negative figure', () => {
    const m = tile(-4, 5);
    assert.equal(m.figure, '0');
    assert.equal(m.used, 100);
    assert.equal(m.note, 'Over by 9 kg');
  });

  it('keeps the old thresholds', () => {
    assert.equal(inventoryTone(10, 10), 'low');
    assert.equal(inventoryTone(15, 10), 'ok');
    assert.equal(inventoryTone(9.9, 10), 'short');
  });

  it('lists produced, returned and sold so the stock figure can be checked', () => {
    assert.deepEqual(tile(23, 0).stats, [['Produced', '83 kg'], ['Returned', '0 kg'], ['Sold', '60 kg']]);
  });

  it('renders the tile with only a custom property in its style attributes', () => {
    const html = inventoryTileHtml(tile(23, 10));
    assert.match(html, /In Stock: <span class="stock-figure">23 kg<\/span>/);
    assert.match(html, /stock-note">13 kg left<\/span>/);
    assert.match(html, /aria-label="23 kg in stock\. 13 kg left\."/);
    assert.deepEqual([...html.matchAll(/stock-stat-label">([^<]+)</g)].map(x => x[1]), ['Produced', 'Returned', 'Sold']);
    for (const m of html.matchAll(/style="([^"]*)"/g)) assert.match(m[1], /^--used: [\d.]+%$/);
  });
});

describe('stock tile wiring', () => {
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const SALES = readFileSync(new URL('../modules/utilities-sales.js', import.meta.url), 'utf8');

  it('sits directly above the Save Transaction button and starts hidden', () => {
    assert.match(HTML, /<button type="button" class="stock-tile d-none" id="inventory-warning"[^>]*><\/button>\s*<div class="form-foot"><button class="btn btn-main" id="btn-save-cust-transaction"/);
  });

  it('is filled by the sale calculator and hidden when there is no date', () => {
    assert.match(SALES, /inventoryTileHtml\(_tile\)/);
    assert.match(SALES, /className = 'stock-tile d-none'/);
    assert.doesNotMatch(SALES, /createInventoryWarningElement/);
  });
});

describe('camera shutter', () => {
  const CSS = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
  const cam = CSS.slice(CSS.indexOf('.cam-modal {'), CSS.indexOf('@keyframes camFocus'));

  it('uses fixed colours on the always-black camera screen so it works in both themes', () => {
    assert.doesNotMatch(cam, /var\(--text-main\)/);
    assert.doesNotMatch(cam, /var\(--accent[,)]/);
    assert.match(cam, /\.cam-shutter \{[^}]*border: 4px solid var\(--white\)/);
    assert.match(cam, /\.cam-shutter span \{[^}]*background: var\(--white\)/);
  });

  it('gives the shutter a pressed state and a keyboard focus ring', () => {
    assert.match(cam, /\.cam-shutter:active span/);
    assert.match(cam, /\.cam-shutter:focus-visible/);
  });
});
