import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { periodTotals, periodLine, rowReceived } from '../modules/finance.js';

const rows = [
  { t: { paymentType: 'CASH', quantity: 10 }, value: 1000 },
  { t: { paymentType: 'CREDIT', creditReceived: true, quantity: 5 }, value: 500 },
  { t: { paymentType: 'CREDIT', creditReceived: false, quantity: 5 }, value: 700 },
  { t: { paymentType: 'PARTIAL_PAYMENT', totalValue: 200 } },
  { t: { paymentType: 'COLLECTION', totalValue: 100, expiredValue: 50 } },
  { t: { paymentType: 'REP_RETURN', isRepReturn: true, returnValue: 100 } }
];

describe('Received = cash + paid + partial/bulk payments + returns/expired', () => {
  it('totals every received source once', () => {
    const t = periodTotals(rows);
    assert.equal(t.totalReceived, 1000 + 500 + 200 + 150 + 100);
    assert.equal(t.totalSale, 2200);
  });
  it('a credit sale settled by a bulk payment is not counted twice', () => {
    const r = rowReceived({ paymentType: 'CREDIT', creditReceived: true, collectionAllocs: [{ id: 'c1' }] }, 500);
    assert.equal(r.received, 0);
  });
  it('per-row received sums to the period total (daily card matches banner)', () => {
    const sum = rows.reduce((a, r) => a + rowReceived(r.t, r.value).received, 0);
    assert.equal(sum, periodTotals(rows).totalReceived);
  });
  it('opening balances never count', () => {
    assert.equal(rowReceived({ isMerged: true, paymentType: 'CASH' }, 99).received, 0);
  });
  it('formats the banner line', () => {
    assert.equal(periodLine(214.9, 66619, 1950), '214.9 kg sold | Sold: 66,619 | Received: 1,950');
    assert.equal(periodLine(0, 500, 500), 'Sold: 500 | Received: 500');
  });
});
