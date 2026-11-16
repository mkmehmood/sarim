import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOverview, overviewHtml, dayKey, RANGES } from '../modules/overview-data.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const now = new Date(2026, 10, 16);
const data = {
  production: [
    { date: '2026-11-16', net: 100, profit: 10, store: 'A', formulaName: 'Base' }, { date: '2026-11-02', net: 50, profit: 5, store: 'B', formulaName: 'Base' }, { date: '2026-10-20', net: 70, profit: 7, store: 'A', formulaName: 'Mix' },
    { date: '2025-01-01', net: 999 }, { date: '2026-11-16', net: 5, isDeleted: true },
  ],
  sales: [
    { date: '2026-11-16', totalValue: 1000, profit: 100, paymentType: 'CASH', customerName: 'Ali' },
    { date: '2026-11-10', totalValue: 500, profit: 50, paymentType: 'CREDIT', creditReceived: false, customerName: 'Ali' },
    { date: '2026-10-05', totalValue: 300, profit: 30, paymentType: 'CREDIT', creditReceived: true, customerName: 'Sara' },
  ],
  expenses: [{ date: '2026-11-04', amount: 40, category: 'Fuel', name: 'Diesel' }, { date: '2026-11-05', amount: 10, category: 'Fuel' }, { date: '2026-10-05', amount: 5, category: 'Tea' }],
  inventory: [{ name: 'Urea', quantity: 10, cost: 5 }, { quantity: 0, cost: 9 }, { quantity: 4, cost: 2, isPurchaseLot: true }],
  transactions: [{ date: '2026-11-16', type: 'IN', amount: 200, entityName: 'Ali' }, { date: '2026-11-03', type: 'OUT', amount: 80 }, { date: '2026-10-03', type: 'IN', amount: 20 }],
};

describe('overview data', () => {
  it('builds one bucket per month, oldest first, ignoring records outside the range and deleted ones', () => {
    const m = buildOverview(data, now, 3);
    assert.deepEqual(m.months.map((x) => x.key), ['2026-09', '2026-10', '2026-11']);
    assert.deepEqual(m.months.map((x) => x.prodKg), [0, 70, 150]);
    assert.deepEqual(m.months.map((x) => x.salesValue), [0, 300, 1500]);
    assert.deepEqual(m.months.map((x) => x.salesProfit), [0, 30, 150]);
  });

  it('falls back to 6 months for an unknown range', () => {
    assert.equal(buildOverview(data, now, 5).months.length, 6);
    assert.deepEqual(RANGES, [3, 6, 12]);
    assert.equal(buildOverview(data, now, 12).months.length, 12);
  });

  it('works out what is running now', () => {
    const r = buildOverview(data, now).running;
    assert.deepEqual([r.todayProdKg, r.todayProdCount, r.todaySalesValue, r.todaySalesCount], [100, 1, 1000, 1]);
    assert.deepEqual([r.todayIn, r.todayOut], [200, 0]);
    assert.deepEqual([r.openCreditValue, r.openCreditCount], [500, 1]);
    assert.deepEqual([r.stockValue, r.stockItems], [50, 1]);
  });

  it('totals the range: sales, profit, production, cash and expenses', () => {
    const t = buildOverview(data, now, 3).totals;
    assert.deepEqual([t.salesValue, t.salesProfit, t.prodKg, t.prodProfit], [1800, 180, 220, 22]);
    assert.deepEqual([t.cashIn, t.cashOut, t.net, t.expenses], [220, 80, 140, 55]);
    assert.equal(Math.round(t.margin), 10);
  });

  it('ranks customers, formulas, stores, expense categories and stock', () => {
    const m = buildOverview(data, now, 3);
    assert.deepEqual(m.customers.map((c) => [c.name, c.value, c.count]), [['Ali', 1500, 2], ['Sara', 300, 1]]);
    assert.deepEqual(m.formulas.map((c) => [c.name, c.value]), [['Base', 150], ['Mix', 70]]);
    assert.deepEqual(m.stores.map((c) => [c.name, c.value]), [['A', 170], ['B', 50]]);
    assert.deepEqual(m.expenseCats.map((c) => [c.name, c.value]), [['Fuel', 50], ['Tea', 5]]);
    assert.deepEqual(m.stock.map((c) => [c.name, c.value]), [['Urea', 50]]);
  });

  it('lists the newest activity first across every kind of record', () => {
    const m = buildOverview(data, now, 3);
    assert.equal(m.recent.length, 8);
    assert.ok(m.recent.every((x, i) => i === 0 || m.recent[i - 1].ts >= x.ts));
    assert.deepEqual([...new Set(m.recent.map((x) => x.go))].sort(), ['payments', 'prod', 'sales']);
  });

  it('copes with empty or odd data', () => {
    const m = buildOverview({ production: null, sales: [null, {}], inventory: undefined, transactions: [{}] }, now);
    assert.equal(m.months.length, 6);
    assert.equal(m.running.stockValue, 0);
    assert.doesNotThrow(() => overviewHtml(m, 6));
    assert.equal(dayKey({ timestamp: new Date(2026, 0, 5).getTime() }), '2026-01-05');
    assert.equal(dayKey({}), '');
  });

  it('every tile, chart and the table link to the content they summarise', () => {
    const html = overviewHtml(buildOverview(data, now), 6);
    for (const go of ['prod', 'sales', 'payments']) assert.match(html, new RegExp(`data-go="${go}"`));
    assert.match(html, /data-screen="raw-material-screen"/);
    assert.match(html, /Right now/);
    assert.match(html, />Over time</);
    assert.match(html, /data-range="3"/);
    assert.match(html, /toggle-opt active" role="button" tabindex="0" data-range="6"/);
    for (const part of ['Top customers', 'Production by formula', 'Production by store', 'Expenses by category', 'Stock by value', 'Recent activity', 'Monthly summary', 'Cash in and out']) assert.match(html, new RegExp(part));
    assert.match(html, /class="shimmer-text u-heading-bold">Overview/);
    assert.match(html, /card sx-card sx-card--accent/);
  });
});

describe('overview wiring', () => {
  it('is a sidebar entry and a tab, first in the list, hidden until shown', () => {
    const html = read('../index.html');
    assert.match(html, /id="snav-overview" onclick="sidebarNav\('overview'\)"/);
    assert.match(html, /<div id="tab-overview" class="hidden"><\/div>/);
    assert.ok(html.indexOf('id="snav-overview"') < html.indexOf('id="snav-prod"'));
  });
  it('showTab hides and shows it and renders it, and rep mode cannot reach it', () => {
    const sales = read('../modules/utilities-sales.js');
    assert.match(sales, /'tab-overview', 'tab-prod'/);
    assert.match(sales, /'overview': async \(\) => \{[\s\S]*renderOverview/);
    assert.match(read('../modules/utilities-payments.js'), /const adminTabs = \['overview'/);
  });
  it('is the default view for full-access devices only', () => {
    const pay = read('../modules/utilities-payments.js');
    assert.match(pay, /preventAdminAccess\(\);\n  if \(appMode === 'admin' && typeof window\.showTab === 'function'\) window\.showTab\('overview'\);/);
    assert.match(read('../modules/main.js'), /import '\.\/overview\.js';/);
  });
});
