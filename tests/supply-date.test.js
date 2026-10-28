import test from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from './_extract.js';

const sales = readSource('modules/utilities-sales.js');

function block(src, startMarker, endMarker) {
  const a = src.indexOf(startMarker);
  assert.ok(a >= 0, `marker not found: ${startMarker}`);
  const b = src.indexOf(endMarker, a);
  assert.ok(b > a, `end marker not found: ${endMarker}`);
  return src.slice(a, b);
}

test('customer sale: the record date is the device date, the picked date goes to supplyDate only', () => {
  const save = block(sales, "const deviceDate = localDateStr(now);\nconst recordId", 'const validatedRecord');
  assert.match(save, /\bdate: deviceDate,/);
  assert.match(save, /\bsupplyDate: date,/);
  assert.doesNotMatch(save, /\bdate: date,/);
});

test('customer sale edit: the original device date and time are kept, never the picked supply date', () => {
  const edit = block(sales, 'stampEdit(saleRecord, o);', 'applySettlement(saleRecord');
  assert.match(edit, /saleRecord\.date = o\.date;/);
  assert.match(edit, /saleRecord\.time = o\.time;/);
  assert.doesNotMatch(edit, /saleRecord\.date = (date|supplyDate)/);
});

test('rep stock transfer: the record date is the device date, the picked date goes to supplyDate only', () => {
  const t = block(sales, 'export async function processRepTransfer', 'rec = ensureRecordIntegrity');
  assert.match(t, /const deviceDate = localDateStr\(now\);/);
  assert.match(t, /date: deviceDate, supplyDate: date,/);
});

test('inventory checks read the supply date, not the device date', () => {
  const save = block(sales, 'let storeSpecificSales = 0;', 'const totalAvailableInventory');
  assert.match(save, /sale\.supplyDate \|\| sale\.date/);
  const warn = block(sales, 'let storeSales = 0;', 'const totalAvailable =');
  assert.match(warn, /sale\.supplyDate \|\| sale\.date/);
  const snap = block(sales, 'let soldQty = 0;\nsales.forEach(s => {', 'const available = producedQty');
  assert.match(snap, /s\.supplyDate \|\| s\.date/);
});

test('no module writes supplyDate into a record other than the two sale writers', () => {
  for (const f of ['customers.js', 'rep-sales.js', 'factory.js', 'admin-data.js', 'utilities-core.js', 'utilities-payments.js']) {
    assert.doesNotMatch(readSource(`modules/${f}`), /supplyDate\s*:/, `${f} must not create a supplyDate`);
  }
});
