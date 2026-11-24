import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { debtDelta, ledgerSplit, ledgerDelta, allocHonor } from '../modules/finance.js';

const mo = (over = {}) => ({ id: 'm1', paymentType: 'MONEY_OUT', isMoneyOut: true, currentRepProfile: 'admin', totalValue: 500, ...over });

describe('money out: ledger, PDF and text message agree', () => {
  it('the ledger adds money out to what the customer owes', () => {
    assert.equal(debtDelta(mo(), 0), 500);
    assert.equal(ledgerDelta(mo(), 0, { honor: allocHonor([mo()]) }), 500);
  });
  it('the statement split shows money out as a debit with no credit', () => {
    assert.deepEqual(ledgerSplit(mo(), 0, {}), { debit: 500, credit: 0, delta: 500 });
  });
  it('the customer statement builds a row for money out (so PDF and text match the ledger)', () => {
    const src = readFileSync(new URL('../modules/utilities-core.js', import.meta.url), 'utf8');
    const from = src.indexOf('export async function exportCustomerToPDF');
    const body = src.slice(from, src.indexOf('export async function', from + 10) > 0 ? src.indexOf('export async function', from + 10) : undefined);
    assert.match(body, /pt === 'MONEY_OUT'[\s\S]{0,200}ledgerSplit/);
    assert.match(body, /typeLabel = 'MONEY OUT'/);
  });
});
