// Differential fixtures for the Factory tab's raw-material table. Filtering, ordering and the collected-kg
// fallback come straight from the web modules (materialRecords / collectedKg in raw-purchases.js,
// sortInventoryItems in link-graph.js); the row maths is renderFactoryInventory() in factory.js.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { materialRecords, collectedKg } from '../../../../modules/raw-purchases.js';
import { sortInventoryItems } from '../../../../modules/link-graph.js';

function summarize(inventory, sort) {
  const items = sortInventoryItems(materialRecords(inventory), sort);
  let totalVal = 0, totalCollected = 0;
  const rows = items.map((item) => {
    const qty = Number(item.quantity) || 0;
    const value = (item.quantity * item.cost) || 0;
    totalVal += value;
    totalCollected += collectedKg(item);
    const converted = item.conversionFactor && item.conversionFactor !== 1;
    let kind;
    if (item.purchaseQuantity && item.purchaseUnitName && converted) kind = 'unitName';
    else if (item.purchaseQuantity && converted) kind = 'units';
    else kind = 'kg';
    return { id: item.id, qty, value, collected: collectedKg(item), kind, out: !(qty > 0) };
  });
  return { rows, totalVal, totalCollected };
}

let seed = 424242;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const ri = (n) => Math.floor(rnd() * n);
const words = ['bran', 'maize', 'soya', 'rice', 'wheat', 'oil', 'salt', 'lime', 'corn', 'mix'];
const cases = [];
for (let c = 0; c < 300; c++) {
  const n = ri(9);
  const inventory = [];
  for (let i = 0; i < n; i++) {
    const m = {
      id: `m${c}_${i}`,
      name: `${words[ri(words.length)]} ${i}${i % 3 === 0 ? ` ${ri(30)}` : ''}`, // unique per row, with numbers to order
      quantity: rnd() < 0.15 ? 0 : Math.round(rnd() * 90000) / 100,
      cost: Math.round(rnd() * 20000) / 100,
    };
    const r = rnd();
    if (r < 0.2) { m.collectedKg = Math.round(rnd() * 100000) / 100; }
    else if (r < 0.3) { m.collectedKg = null; }
    else if (r < 0.4) { m.collectedKg = -5; }
    else if (r < 0.45) { m.collectedKg = String(Math.round(rnd() * 1000) / 10); }
    if (rnd() < 0.3) { m.conversionFactor = [1, 25, 50, 0.5][ri(4)]; m.purchaseQuantity = ri(40); if (rnd() < 0.6) m.purchaseUnitName = ['bag', 'drum', 'sack'][ri(3)]; }
    if (rnd() < 0.1) m.deletedAt = '2026-01-01T00:00:00Z';
    inventory.push(m);
    if (rnd() < 0.25) inventory.push({ id: `lot${c}_${i}`, name: m.name, isPurchaseLot: true, quantity: 5, cost: 9 });
  }
  const sort = { key: rnd() < 0.5 ? 'name' : 'amount', dir: rnd() < 0.5 ? 'asc' : 'desc' };
  cases.push({ input: { inventory, sort }, expected: summarize(inventory, sort) });
}
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'factory_cases.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ cases }, null, 1) + '\n');
console.log(`wrote ${cases.length} cases`);
