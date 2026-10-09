import test from 'node:test';
import assert from 'node:assert/strict';
import { sortInventoryItems } from '../modules/link-graph.js';

const items = [
  { name: 'khaka 02', quantity: 11.76, cost: 7000 },
  { name: 'KHAKA 01', quantity: 118.58, cost: 7000 },
  { name: 'Menthol', quantity: 0.86, cost: 3000 },
  { name: 'Barlanza', quantity: 1106.14, cost: 100 },
];

test('sort by name, case-insensitive, natural numbers', () => {
  assert.deepEqual(sortInventoryItems(items, { key: 'name', dir: 'asc' }).map(i => i.name), ['Barlanza', 'KHAKA 01', 'khaka 02', 'Menthol']);
  assert.deepEqual(sortInventoryItems(items, { key: 'name', dir: 'desc' }).map(i => i.name), ['Menthol', 'khaka 02', 'KHAKA 01', 'Barlanza']);
});

test('sort by amount (quantity x cost)', () => {
  assert.deepEqual(sortInventoryItems(items, { key: 'amount', dir: 'desc' }).map(i => i.name), ['KHAKA 01', 'Barlanza', 'khaka 02', 'Menthol']);
  assert.deepEqual(sortInventoryItems(items, { key: 'amount', dir: 'asc' }).map(i => i.name), ['Menthol', 'khaka 02', 'Barlanza', 'KHAKA 01']);
});
