import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inventoryNoteModel, inventoryNoteHtml, inventoryNoteState } from '../modules/inventory-note.js';

const base = { production: 83, returns: 0, sold: 60 };
const model = (available, quantity, extra = {}) => inventoryNoteModel({ ...base, available, quantity, ...extra });

describe('inventory note', () => {
  it('shows what is left after the sale when stock is comfortable', () => {
    const m = model(23, 10);
    assert.equal(m.tone, 'ok');
    assert.equal(m.stock, '23 kg');
    assert.equal(m.pill, '13 kg left');
  });

  it('just says ready to sell before a quantity is typed', () => {
    const m = model(23, 0);
    assert.equal(m.pill, 'Ready to sell');
    assert.deepEqual(m.keys.map(k => k[0]), ['sold', 'left']);
  });

  it('flags a low remainder', () => {
    const m = model(23, 20);
    assert.equal(m.tone, 'low');
    assert.equal(m.pill, 'Only 3 kg left');
  });

  it('says exactly how short the stock is', () => {
    const m = model(23, 30);
    assert.equal(m.tone, 'short');
    assert.equal(m.pill, 'Short by 7 kg');
    assert.equal(m.stock, '23 kg');
  });

  it('never prints a negative stock figure', () => {
    const m = model(-4, 5);
    assert.equal(m.stock, '0 kg');
    assert.equal(m.pill, 'Short by 9 kg');
  });

  it('draws sold and this-sale as shares of everything produced and returned', () => {
    const m = model(23, 10);
    assert.equal(m.soldPct, 72.3);
    assert.equal(m.salePct, 12);
    assert.ok(m.soldPct + m.salePct <= 100);
  });

  it('caps the sale segment at the stock that exists', () => {
    const m = model(23, 30);
    assert.equal(m.salePct, 27.7);
    assert.ok(m.soldPct + m.salePct <= 100.05);
  });

  it('draws no bar when nothing was produced or returned', () => {
    const m = model(0, 5, { production: 0, returns: 0, sold: 0 });
    assert.equal(m.hasBar, false);
    assert.doesNotMatch(inventoryNoteHtml(m), /inv-bar/);
  });

  it('renders the figure, pill, bar and legend, with only custom properties in style attributes', () => {
    const html = inventoryNoteHtml(model(23, 10));
    assert.match(html, /inv-figure">23<small>kg<\/small>/);
    assert.match(html, /inv-pill">13 kg left<\/span>/);
    assert.match(html, /aria-label="23 kg in stock\. 13 kg left\."/);
    for (const m of html.matchAll(/style="([^"]*)"/g)) assert.match(m[1], /^--w: [\d.]+%$/);
    assert.deepEqual([...html.matchAll(/<\/span>([A-Za-z ]+) <b>/g)].map(x => x[1]), ['Sold', 'This sale', 'Left']);
  });

  it('uses the same thresholds as before', () => {
    assert.equal(inventoryNoteState({ available: 10, quantity: 10 }), 'low');
    assert.equal(inventoryNoteState({ available: 15, quantity: 10 }), 'ok');
    assert.equal(inventoryNoteState({ available: 9.9, quantity: 10 }), 'short');
  });
});
