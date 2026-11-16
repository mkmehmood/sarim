import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOverview, overviewHtml, dayKey, RANGES } from '../modules/overview-data.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const now = new Date(2026, 10, 16);
const data = {
  production: [
    { date: '2026-11-16', net: 100 }, { date: '2026-11-02', net: 50 }, { date: '2026-10-20', net: 70 },
    { date: '2025-01-01', net: 999 }, { date: '2026-11-16', net: 5, isDeleted: true },
  ],
  sales: [
    { date: '2026-11-16', totalValue: 1000, profit: 100, paymentType: 'CASH' },
    { date: '2026-11-10', totalValue: 500, profit: 50, paymentType: 'CREDIT', creditReceived: false },
    { date: '2026-10-05', totalValue: 300, profit: 30, paymentType: 'CREDIT', creditReceived: true },
  ],
  inventory: [{ quantity: 10, cost: 5 }, { quantity: 0, cost: 9 }, { quantity: 4, cost: 2, isPurchaseLot: true }],
  transactions: [{ date: '2026-11-03' }, { date: '2026-10-03' }],
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
    assert.deepEqual([r.openCreditValue, r.openCreditCount], [500, 1]);
    assert.deepEqual([r.stockValue, r.stockItems], [50, 1]);
    assert.equal(r.paymentsThisMonth, 1);
  });

  it('copes with empty or odd data', () => {
    const m = buildOverview({ production: null, sales: [null, {}], inventory: undefined, transactions: [{}] }, now);
    assert.equal(m.months.length, 6);
    assert.equal(m.running.stockValue, 0);
    assert.equal(dayKey({ timestamp: new Date(2026, 0, 5).getTime() }), '2026-01-05');
    assert.equal(dayKey({}), '');
  });

  it('every tile, chart and the table link to the content they summarise', () => {
    const html = overviewHtml(buildOverview(data, now), 6);
    for (const go of ['prod', 'sales', 'payments']) assert.match(html, new RegExp(`data-go="${go}"`));
    assert.match(html, /data-screen="raw-material-screen"/);
    assert.match(html, /Running now/);
    assert.match(html, /Over time/);
    assert.match(html, /data-range="3"/);
    assert.match(html, /aria-pressed="true"[^>]*>6M|data-range="6" aria-pressed="true"/);
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
