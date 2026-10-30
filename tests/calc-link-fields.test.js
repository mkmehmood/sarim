import test from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from './_extract.js';

test('every calculator record builder sets all three link arrays', () => {
  const sales = readSource('modules/utilities-sales.js');
  const entry = sales.slice(sales.indexOf('let entry = {'), sales.indexOf('if (_ed) stampEdit(entry'));
  for (const f of ['linkedSalesIds: []', 'linkedRepSalesIds: []', 'linkedRepReturnIds: []', 'createdAt:', 'timestamp:', 'date: date', 'seller: seller', 'returned:', 'expired:']) assert.ok(entry.includes(f), `calculator entry is missing ${f}`);
  const merged = readSource('modules/admin-data.js');
  const m = merged.slice(merged.indexOf('const primaryRecord = ensureRecordIntegrity(_buildMergedBase'), merged.indexOf('mergedRecordCount: items.length', merged.indexOf('const primaryRecord = ensureRecordIntegrity(_buildMergedBase')));
  for (const f of ['linkedSalesIds', 'linkedRepSalesIds', 'linkedRepReturnIds']) assert.ok(m.includes(f), `merged record is missing ${f}`);
});

test('a recovered calculator entry only keeps return links that are live and unclaimed', () => {
  const pay = readSource('modules/utilities-payments.js');
  assert.match(pay, /rec\.linkedRepReturnIds = .*filter\(i => _live\.has\(i\) && !_taken\.has\(i\)\)/);
});

test('a rep return record carries every field the calculator matching needs', () => {
  const sales = readSource('modules/utilities-sales.js');
  const rec = sales.slice(sales.indexOf("paymentType: 'REP_RETURN'") - 400, sales.indexOf("paymentType: 'REP_RETURN'") + 700);
  for (const f of ['createdAt', 'timestamp', 'date,', 'customerName: rep', "currentRepProfile: 'admin'", 'isRepReturn: true', 'expiredQty: expired', 'returnedQty: returned']) assert.ok(rec.includes(f), `rep return is missing ${f}`);
});

test('the one-time relink migrations are gone', () => {
  assert.doesNotMatch(readSource('modules/utilities-payments.js'), /runCalcRelinkMigration|runRepReturnRelinkMigration|CALC_RELINK_FLAG/);
});
