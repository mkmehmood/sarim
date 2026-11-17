import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { auditData, CHECKS } from '../modules/overview-audit.js';
import { buildOverview, overviewHtml } from '../modules/overview-data.js';

const today = '2026-11-16';
const good = { id: 's0', date: '2026-11-01', time: '10:00', customerName: 'Ali', quantity: 10, unitPrice: 100, totalValue: 1000, totalCost: 800, profit: 200, paymentType: 'CASH', creditReceived: true };
const codes = (a, id) => a.findings.find((f) => f.id === id)?.reasons.map((r) => Object.keys(CHECKS).find((c) => r.startsWith(CHECKS[c].label)));

describe('data integrity audit', () => {
  it('finds nothing wrong in clean records', () => {
    const a = auditData({ sales: [good], production: [{ id: 'p1', date: '2026-11-01', net: 5, totalSale: 50, totalCost: 40, profit: 10, formulaName: 'F' }], transactions: [{ id: 't1', date: '2026-11-01', type: 'IN', amount: 5 }], expenses: [{ id: 'e1', date: '2026-11-01', amount: 3 }], inventory: [{ id: 'i1', name: 'Urea', quantity: 2, cost: 5 }] }, today);
    assert.equal(a.findings.length, 0);
    assert.equal(a.total, 5);
  });

  it('flags each broken sale with its reasons and the amount it throws off', () => {
    const a = auditData({ sales: [
      { ...good, id: 's1', profit: 900 },
      { ...good, id: 's2', totalCost: 0, profit: 1000 },
      { ...good, id: 's3', totalValue: 1500 },
      { ...good, id: 's4', quantity: 0, unitPrice: 0 },
      { ...good, id: 's5', date: 'garbage' },
      { ...good, id: 's6', date: '2027-01-01' },
      { ...good, id: 's7', paymentType: 'CASH', creditReceived: false },
      { ...good, id: 's8', quantity: 'abc' },
    ].map((x, i) => ({ ...x, time: `t${i}` })) }, today);
    assert.deepEqual(codes(a, 's1'), ['sale_profit_mismatch']);
    assert.deepEqual(codes(a, 's2'), ['sale_no_cost']);
    assert.ok(codes(a, 's3').includes('sale_total_mismatch'));
    assert.ok(codes(a, 's4').includes('sale_bad_qty'));
    assert.deepEqual(codes(a, 's5'), ['bad_date']);
    assert.deepEqual(codes(a, 's6'), ['future_date']);
    assert.deepEqual(codes(a, 's7'), ['sale_cash_unreceived']);
    assert.ok(codes(a, 's8').includes('not_a_number'));
    assert.equal(a.findings.find((f) => f.id === 's1').impact, 700);
  });

  it('finds duplicate ids and identical double entries', () => {
    const a = auditData({ sales: [{ ...good, id: 'd1' }, { ...good, id: 'd1', customerName: 'Sara', time: '11:00' }, { ...good, id: 'x1' }, { ...good, id: 'x2' }] }, today);
    assert.ok(codes(a, 'd1').includes('duplicate_id'));
    assert.ok(codes(a, 'x1').includes('duplicate_record'));
    assert.ok(codes(a, 'x2').includes('duplicate_record'));
  });

  it('checks production, payments, expenses and stock', () => {
    const a = auditData({
      production: [{ id: 'p1', date: '2026-11-01', net: 0, totalSale: 100, totalCost: 40, profit: 10, formulaName: 'F' }],
      transactions: [{ id: 't1', date: '2026-11-01', type: 'X', amount: 5 }, { id: 't2', date: '2026-11-01', type: 'IN', amount: -5 }, { id: 't3', date: '2026-11-01', type: 'IN', amount: 5, entityId: 'gone', entityName: 'Old' }],
      entities: [{ id: 'e1' }],
      expenses: [{ id: 'e1', date: '2026-11-01', amount: -4 }],
      inventory: [{ id: 'i1', name: 'Urea', quantity: -3, cost: 2 }, { id: 'i2', name: 'DAP', quantity: 4, cost: 0 }, { id: 'i3', name: 'Lot', quantity: -1, cost: 0, isPurchaseLot: true }],
    }, today);
    assert.deepEqual(codes(a, 'p1'), ['prod_bad_net', 'prod_profit_mismatch']);
    assert.deepEqual(codes(a, 't1'), ['txn_bad_type']);
    assert.deepEqual(codes(a, 't2'), ['txn_bad_amount']);
    assert.deepEqual(codes(a, 't3'), ['txn_missing_entity']);
    assert.deepEqual(codes(a, 'e1'), ['exp_bad_amount']);
    assert.deepEqual(codes(a, 'i1'), ['inv_negative_qty']);
    assert.deepEqual(codes(a, 'i2'), ['inv_bad_cost']);
    assert.equal(a.findings.find((f) => f.id === 'i3'), undefined);
  });

  it('flags production that has no formula, but not returns or transfers', () => {
    const p = { id: 'n1', date: '2026-11-01', net: 83, totalSale: 100, totalCost: 0, profit: 100, formulaName: '' };
    const a = auditData({ production: [p, { ...p, id: 'n2', formulaName: 'STANDARD', totalCost: 40, profit: 60 }, { ...p, id: 'n3', isTransfer: true }, { ...p, id: 'n4', isReturn: true }] }, today);
    assert.deepEqual(a.findings.map((f) => f.id), ['n1']);
    assert.ok(codes(a, 'n1').includes('prod_no_formula'));
    assert.equal(a.findings[0].severity, 'error');
  });

  it('does not treat a zero payment in or out as a problem, but still flags a negative one', () => {
    const a = auditData({ transactions: [{ id: 'z1', date: '2026-11-01', type: 'IN', amount: 0 }, { id: 'z2', date: '2026-11-01', type: 'OUT', amount: 0 }, { id: 'z3', date: '2026-11-01', type: 'OUT', amount: -1 }] }, today);
    assert.deepEqual(a.findings.map((f) => f.id), ['z3']);
    assert.deepEqual(codes(a, 'z3'), ['txn_bad_amount']);
  });

  it('ignores deleted records, ranks errors first, and counts by check', () => {
    const a = auditData({ sales: [{ ...good, id: 'a', totalCost: 0, profit: 1000 }, { ...good, id: 'b', quantity: 0, unitPrice: 0 }, { ...good, id: 'c', isDeleted: true, quantity: 0 }] }, today);
    assert.deepEqual(a.findings.map((f) => f.id), ['b', 'a']);
    assert.equal(a.errors, 1);
    assert.equal(a.warnings, 1);
    assert.equal(a.byCheck[0].severity, 'error');
    assert.equal(a.total, 2);
  });

  it('leaves ledger rows and production returns/transfers out of the sale and production checks', () => {
    const base = { date: '2026-11-01', quantity: 0, totalValue: 500, totalCost: 0, profit: 500 };
    const a = auditData({
      sales: [{ ...base, id: 'c1', isCollection: true }, { ...base, id: 'c2', paymentType: 'MONEY_OUT' }, { ...base, id: 'c3', transactionType: 'OLD_DEBT' }, { ...base, id: 'c4', isRepTransfer: true }],
      production: [{ id: 'r1', date: '2026-11-01', net: 0, isReturn: true }, { id: 'r2', date: '2026-11-01', net: 0, isTransfer: true }],
    }, today);
    assert.equal(a.findings.length, 0);
    assert.equal(auditData({ sales: [{ ...base, id: 'c1', isCollection: true, date: 'bad' }] }, today).findings[0].reasons[0], CHECKS.bad_date.label);
  });

  it('copes with missing or odd collections', () => {
    assert.doesNotThrow(() => auditData({ sales: null, production: [null, 5, {}], transactions: undefined }, today));
  });

  it('shows every record in the overview, with no cap, each opening the fix dialog', () => {
    const sales = Array.from({ length: 25 }, (_, i) => ({ ...good, id: `m${i}`, time: `t${i}`, totalCost: 0, profit: 1000 }));
    const model = buildOverview({ sales }, new Date(2026, 10, 16), 3);
    const html = overviewHtml(model, 3);
    assert.match(html, /Profit and data check/);
    assert.match(html, /Data problems/);
    assert.match(html, /25<\/b> of 25 records need attention/);
    assert.match(html, /Sale with no cost recorded/);
    assert.equal((html.match(/ov-reasons/g) || []).length, 25);
    assert.doesNotMatch(html, /data-audit-toggle|Show all/);
    assert.match(html, /data-fix="sales:0"/);
    assert.match(html, /data-fix="sales:24"/);
    assert.match(overviewHtml(buildOverview({ sales: [good] }, new Date(2026, 10, 16), 3), 3), /No problems found in 1 records/);
  });

  it('remembers where each record sits and which checks it failed', () => {
    const a = auditData({ sales: [good, { ...good, id: 'z', time: 'z', totalCost: 0, profit: 1000 }] }, today);
    assert.equal(a.findings[0].idx, 1);
    assert.deepEqual(a.findings[0].codes, ['sale_no_cost']);
  });
});
