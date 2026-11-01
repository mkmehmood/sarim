import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

describe('transfer confirmations show names, not ids', () => {
  it('payment transfer reads the visible entity search boxes', () => {
    const src = read('modules/utilities-payments.js');
    assert.match(src, /\['payment-transfer-from-search', 'From'\], \['payment-transfer-to-search', 'To'\]/);
    assert.doesNotMatch(src, /\['payment-transfer-from-value', 'From'\]/);
  });
  it('stock transfer reads the visible store buttons', () => {
    const src = read('modules/utilities-sales.js');
    assert.match(src, /stockTransferFromBtn'\) \|\| \{\}\)\.textContent, 'From'/);
    assert.doesNotMatch(src, /\['stock-transfer-from-value', 'From'\]/);
  });
});
