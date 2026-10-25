import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inventoryNoteModel, inventoryNoteHtml, inventoryNoteState } from '../modules/inventory-note.js';

const base = { production: 83, returns: 0, sold: 60 };

describe('inventory note', () => {
  it('is calm when stock comfortably covers the sale', () => {
    const m = inventoryNoteModel({ ...base, available: 23, quantity: 10 });
    assert.equal(m.tone, 'ok');
    assert.equal(m.title, '23 kg in stock');
    assert.equal(m.detail, '13 kg will be left after this sale.');
  });

  it('shows a plain line when no quantity is typed yet', () => {
    const m = inventoryNoteModel({ ...base, available: 23, quantity: 0 });
    assert.equal(m.tone, 'ok');
    assert.equal(m.detail, 'Available for this date and supply.');
  });

  it('warns when the sale would leave little stock', () => {
    const m = inventoryNoteModel({ ...base, available: 23, quantity: 20 });
    assert.equal(m.tone, 'low');
    assert.match(m.detail, /Running low: 3 kg will be left/);
  });

  it('says exactly how short the stock is when the sale is too big', () => {
    const m = inventoryNoteModel({ ...base, available: 23, quantity: 30 });
    assert.equal(m.tone, 'short');
    assert.equal(m.title, 'Not enough stock');
    assert.equal(m.detail, 'You need 30 kg but only 23 kg is in stock. Short by 7 kg.');
  });

  it('never prints a negative stock figure', () => {
    const m = inventoryNoteModel({ ...base, available: -4, quantity: 5 });
    assert.match(m.detail, /only 0 kg is in stock/);
  });

  it('shows produced, returned and sold so the stock figure can be checked', () => {
    const html = inventoryNoteHtml(inventoryNoteModel({ ...base, available: 23, quantity: 10 }));
    assert.deepEqual([...html.matchAll(/inv-stat-label">([^<]+)</g)].map(x => x[1]), ['Produced', 'Returned', 'Sold']);
    assert.match(html, /83 kg/);
    assert.match(html, /60 kg/);
  });

  it('uses the same thresholds as before', () => {
    assert.equal(inventoryNoteState({ available: 10, quantity: 10 }), 'low');
    assert.equal(inventoryNoteState({ available: 15, quantity: 10 }), 'ok');
    assert.equal(inventoryNoteState({ available: 9.9, quantity: 10 }), 'short');
  });
});
