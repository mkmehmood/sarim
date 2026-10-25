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

  it('explains the stock figure in the detail line', () => {
    assert.equal(tile(23, 0).detail, '83 produced + 0 returned \u2212\u00a060 sold');
  });

  it('renders the tile with only a custom property in its style attributes', () => {
    const html = inventoryTileHtml(tile(23, 10));
    assert.match(html, /stock-figure">23<small>kg<\/small>/);
    assert.match(html, /stock-note">13 kg left<\/span>/);
    assert.match(html, /aria-label="23 kg in stock\. 13 kg left\."/);
    for (const m of html.matchAll(/style="([^"]*)"/g)) assert.match(m[1], /^--used: [\d.]+%$/);
  });
});

describe('stock tile wiring', () => {
  const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const SALES = readFileSync(new URL('../modules/utilities-sales.js', import.meta.url), 'utf8');

  it('sits next to the Quantity field in the sale form and starts hidden', () => {
    assert.match(HTML, /id="cust-quantity"[^>]*><\/div>\s*<button type="button" class="stock-tile d-none" id="inventory-warning"/);
  });

  it('is filled by the sale calculator and hidden when there is no date', () => {
    assert.match(SALES, /inventoryTileHtml\(_tile\)/);
    assert.match(SALES, /className = 'stock-tile d-none'/);
    assert.doesNotMatch(SALES, /createInventoryWarningElement/);
  });
});
