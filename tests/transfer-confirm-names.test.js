import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readModule } from './helpers/source.js';

describe('transfer confirmations show names, not ids', () => {
  it('payment transfer reads the visible entity search boxes', () => {
    const src = readModule('utilities-payments.js');
    assert.match(src, /\['payment-transfer-from-search', 'From'\], \['payment-transfer-to-search', 'To'\]/);
    assert.doesNotMatch(src, /\['payment-transfer-from-value', 'From'\]/);
  });
  it('stock transfer reads the visible store buttons', () => {
    const src = readModule('utilities-sales.js');
    assert.match(src, /stockTransferFromBtn'\) \|\| \{\}\)\.textContent, 'From'/);
    assert.doesNotMatch(src, /\['stock-transfer-from-value', 'From'\]/);
  });
});
