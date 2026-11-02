import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { repairLedgerLinks } from '../modules/ledger-repair.js';
import { debtDelta, ledgerDelta } from '../modules/finance.js';
import { readSource } from './_extract.js';
import { formatDayMonthYear } from '../modules/date-format.js';

const OLD = 1000;
const sale = (id, extra = {}) => ({ id, paymentType: 'CREDIT', creditReceived: false, totalValue: 100, updatedAt: OLD, ...extra });
const col = (id, extra = {}) => ({ id, paymentType: 'COLLECTION', totalValue: 0, updatedAt: OLD, ...extra });
const sumBy = (list, fn) => list.reduce((n, t) => n + fn(t, t.totalValue), 0);

describe('repairLedgerLinks', () => {
  it('leaves consistent links alone', () => {
    const s = sale('s', { creditReceived: true, collectionAllocs: [{ cid: 'c', amount: 100, full: true }] });
    const c = col('c', { collectedAmount: 100, allocations: [{ saleId: 's', amount: 100, full: true }] });
    const { changedIds, report } = repairLedgerLinks([s, c], { now: 1e12 });
    assert.equal(changedIds.size, 0);
    assert.deepEqual(report.orphanSaleAllocs, []);
  });
  it('drops a sale link whose collection no longer exists, without moving any balance', () => {
    const s = sale('s', { creditReceived: true, collectionAllocs: [{ cid: 'gone', amount: 100, full: true }] });
    const before = sumBy([s], debtDelta);
    const { changedIds, report } = repairLedgerLinks([s], { now: 1e12 });
    assert.deepEqual([...changedIds], ['s']);
    assert.equal(s.collectionAllocs, undefined);
    assert.equal(report.orphanSaleAllocs[0].amount, 100);
    assert.equal(sumBy([s], debtDelta), before);
    assert.equal(ledgerDelta(s, 100), 0);
  });
  it('drops a collection allocation pointing at a missing sale, without moving any balance', () => {
    const c = col('c', { totalValue: 20, collectedAmount: 120, allocations: [{ saleId: 'missing', amount: 100, full: true }] });
    const before = sumBy([c], debtDelta);
    const { report } = repairLedgerLinks([c], { now: 1e12 });
    assert.equal(c.allocations, undefined);
    assert.equal(report.danglingCollectionAllocs[0].saleId, 'missing');
    assert.equal(sumBy([c], debtDelta), before);
  });
  it('rebuilds a missing collectedAmount from cash left plus cash applied', () => {
    const s = sale('s', { creditReceived: true, collectionAllocs: [{ cid: 'c', amount: 100, full: true }] });
    const c = col('c', { totalValue: 30, allocations: [{ saleId: 's', amount: 100, full: true }] });
    repairLedgerLinks([s, c], { now: 1e12 });
    assert.equal(c.collectedAmount, 130);
  });
  it('does not touch recently edited links (they may still be syncing) and ignores deleted rows', () => {
    const s = sale('s', { updatedAt: 1e12 - 1000, collectionAllocs: [{ cid: 'gone', amount: 10 }] });
    const d = sale('d', { deletedAt: 5, collectionAllocs: [{ cid: 'gone', amount: 10 }] });
    const { changedIds, report } = repairLedgerLinks([s, d], { now: 1e12 });
    assert.equal(changedIds.size, 0);
    assert.equal(report.skippedRecent, 1);
  });
  it('is idempotent', () => {
    const s = sale('s', { collectionAllocs: [{ cid: 'gone', amount: 10 }] });
    repairLedgerLinks([s], { now: 1e12 });
    assert.equal(repairLedgerLinks([s], { now: 1e12 }).changedIds.size, 0);
  });
});

const _src = readSource('modules/utilities-core.js');
const _from = _src.indexOf('function _stmtCellText');
const _to = _src.indexOf('export async function _shareStatementText');
const _buildStatementText = new Function('formatDayMonthYear', `${_src.slice(_from, _to).replace('export function _buildStatementText', 'function _buildStatementText')}\nreturn _buildStatementText;`)(formatDayMonthYear);

describe('Urdu statement text has no English words left in the row details', () => {
  const tables = [{
    head: [['Date', 'Type', 'Details', 'Debit (Sale)', 'Credit (Rcvd)', 'Balance']],
    body: [
      ['03 OCT 2026', 'COLLECTION', 'Payment 20,000', '-', '20,000', '1,02,832'],
      ['31 OCT 2026', 'COLLECTION', 'Expired credit 21.4 kg @320 = 6,848', '-', '6,848', '1,13,534'],
      ['02 NOV 2026', 'CREDIT\n(PAID)', '25 kg \u00d7 320\nSettled by collection', '8,000', '-', '1,13,534']
    ]
  }];
  const text = _buildStatementText({ title: 'Customer Account Statement', name: '\u0646\u0648\u0631', phone: '', rangeName: '03 OCT 2026 \u2013 02 NOV 2026', tables });
  it('translates months, payment, expired credit and settled labels', () => {
    assert.match(text, /اکتوبر/);
    assert.match(text, /نومبر/);
    assert.match(text, /ادائیگی/);
    assert.match(text, /ایکسپائرڈ کریڈٹ/);
    assert.match(text, /وصولی سے ادا/);
    assert.doesNotMatch(text.replace(/[\u2066\u2069\u200F]/g, ''), /[A-Za-z]{2,}/);
  });
  it('shows the expired amount like a credit sale', () => {
    assert.match(text, /6,848/);
    assert.match(text, /@320 = /);
  });
});
