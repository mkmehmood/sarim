import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('index.html structure', () => {
  it('has balanced div tags, so no tab is pushed inside another', () => {
    const open = (html.match(/<div\b/g) || []).length;
    const close = (html.match(/<\/div>/g) || []).length;
    assert.equal(open, close);
  });

  it('keeps the factory raw material inventory table and its controls', () => {
    for (const id of ['factoryInventoryTableBody', 'factoryInvSortName', 'factoryInvSortAmount', 'factoryTotalInventoryValue',
      'factoryAvailUnits', 'factoryAvailProfit', 'factoryAvailTotalVal', 'factory-summary-card']) {
      assert.ok(html.includes(`id="${id}"`), id);
    }
  });

  it('keeps the payments tab content', () => {
    const start = html.indexOf('id="tab-payments"');
    assert.ok(start > 0);
    const rest = html.slice(start);
    for (const id of ['paymentHistoryList']) assert.ok(rest.includes(`id="${id}"`), id);
  });

  it('lists every tab once', () => {
    for (const t of ['rep', 'prod', 'sales', 'calc', 'factory', 'payments']) {
      assert.equal((html.match(new RegExp(`id="tab-${t}"`, 'g')) || []).length, 1, t);
    }
  });
});
