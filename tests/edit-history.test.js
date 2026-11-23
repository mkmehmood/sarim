import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { currentUser: { email: 'ali@shop.pk' } };
const here = new URL('../modules/', import.meta.url);
mock.module(new URL('business.js', here).href, { namedExports: { esc: (s) => String(s) } });
mock.module(new URL('finance.js', here).href, { namedExports: { fmtNum: (n) => String(n) } });
mock.module(new URL('utilities-payments.js', here).href, { namedExports: { formatDisplayDateTime: () => 'stamp' } });
const H = await import(new URL('edit-history.js', here).href);

describe('edit history helpers', () => {
  const FIELDS = [['name', 'Name'], ['ledgerPage', 'Ledger page'], ['openingBalance', 'Old balance']];

  it('diff lists only the fields that changed', () => {
    const d = H.historyDiff(FIELDS, { name: 'A', ledgerPage: '', openingBalance: 0 }, { name: 'A', ledgerPage: '45', openingBalance: 0 });
    assert.deepEqual(d, [{ f: 'ledgerPage', label: 'Ledger page', from: '', to: '45' }]);
  });

  it('nothing is recorded when nothing changed', () => {
    const rec = {};
    H.pushHistory(rec, H.historyDiff(FIELDS, { name: 'A' }, { name: 'A' }));
    assert.equal(rec.editHistory, undefined);
  });

  it('one entry holds several changes, with the editor name', () => {
    const rec = {};
    H.pushHistory(rec, H.historyDiff(FIELDS, { name: 'A', ledgerPage: '1' }, { name: 'B', ledgerPage: '2' }));
    assert.equal(rec.editHistory.length, 1);
    assert.equal(rec.editHistory[0].changes.length, 2);
    assert.equal(rec.editHistory[0].by, 'ali');
  });

  it('keeps only the latest 100 entries', () => {
    const rec = {};
    for (let i = 0; i < 105; i++) H.pushHistory(rec, [{ f: 'name', label: 'Name', from: String(i), to: String(i + 1) }]);
    assert.equal(rec.editHistory.length, 100);
    assert.equal(rec.editHistory[0].changes[0].from, '5');
  });

  it('old balance reads as credit, debit or nothing', () => {
    assert.equal(H.openingBalanceText(500), '500 credit');
    assert.equal(H.openingBalanceText(-250), '250 debit');
    assert.equal(H.openingBalanceText(0), '\u2014');
  });

  it('openingBalanceOf is safe on missing or bad data', () => {
    assert.equal(H.openingBalanceOf(null), 0);
    assert.equal(H.openingBalanceOf({}), 0);
    assert.equal(H.openingBalanceOf({ openingBalance: 'abc' }), 0);
    assert.equal(H.openingBalanceOf({ openingBalance: -75 }), -75);
  });

  it('a ledger page of 0 is still shown', () => {
    assert.equal(H.historyValue('ledgerPage', 0), '0');
    assert.equal(H.historyValue('openingBalance', 0), '\u2014');
  });
});
