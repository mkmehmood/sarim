import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const core = readFileSync(new URL('../modules/utilities-core.js', import.meta.url), 'utf8');
const payments = readFileSync(new URL('../modules/utilities-payments.js', import.meta.url), 'utf8');

function bodyOf(src, signature) {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature} not found`);
  const next = src.indexOf('\nexport ', start + signature.length);
  return src.slice(start, next === -1 ? undefined : next);
}

test('opening the payment tab never creates supplier invoices', () => {
  const body = bodyOf(payments, 'export async function refreshPaymentTab(');
  assert.ok(!/isPayable:\s*true/.test(body));
  assert.ok(!/SupplierInvoices/.test(body));
});

test('opening a supplier overlay never creates supplier invoices', () => {
  const body = bodyOf(core, 'export async function renderEntityOverlayContent(');
  assert.ok(!/isPayable:\s*true/.test(body));
  assert.ok(!/SupplierInvoices/.test(body));
});

test('no background helper backfills supplier invoices', () => {
  assert.ok(!/_ensureSupplierInvoices/.test(core + payments));
});
