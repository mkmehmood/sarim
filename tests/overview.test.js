import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOverview, overviewHtml, analyseProfit, dayKey, RANGES } from '../modules/overview-data.js';

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
  it('does not count returns or transfers as production kg', () => {
    const d = { production: [
      { date: '2026-11-16', net: 100, profit: 10, store: 'A', formulaName: 'Base' },
      { date: '2026-11-16', net: 40, isReturn: true, store: 'A' },
      { date: '2026-11-16', net: 30, isTransfer: true, store: 'B' },
      { date: '2026-11-16', net: 20, isTransfer: true, isReturn: true, store: 'B' },
    ] };
    const m = buildOverview(d, now, 3);
    assert.equal(m.months[2].prodKg, 100);
    assert.equal(m.totals.prodKg, 100);
    assert.equal(m.running.todayProdKg, 100);
    assert.equal(m.running.todayProdCount, 1);
    assert.deepEqual(m.formulas.map((f) => [f.name, f.value]), [['Base', 100]]);
    assert.deepEqual(m.formulaMoves.map((f) => [f.name, f.value]).sort(), [['Returns', 40], ['Transfers', 50]]);
    assert.ok(m.storeMoves.some((r) => r.name.endsWith('Returns') && r.value === 40));
  });
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
    assert.equal(Math.round(t.salesMargin), 10);
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

  it('no card, tile, chart or row opens another tab, so examining a chart never navigates away', () => {
    const html = overviewHtml(buildOverview(data, now), 6);
    assert.doesNotMatch(html, /data-go=|data-screen=/);
    assert.match(html, /Right now/);
    assert.match(html, /class="ov-kpis"/);
    assert.match(html, /data-range="3"/);
    assert.match(html, /toggle-opt active" role="button" tabindex="0" data-range="6"/);
    for (const part of ['Top customers', 'Production by formula', 'Production by store', 'Expenses by category', 'Stock by value', 'Recent activity', 'Monthly summary', 'Cash in and out']) assert.match(html, new RegExp(part));
    assert.match(html, /class="shimmer-text u-heading-bold">Overview/);
    assert.match(html, /card sx-card sx-card--accent/);
  });
});

describe('profit check', () => {
  const sales = [
    { date: '2026-11-16', quantity: 10, totalValue: 900, totalCost: 1000, profit: -100, customerName: 'Ali', supplyStore: 'A' },
    { date: '2026-11-10', quantity: 10, totalValue: 1200, totalCost: 1000, profit: 200, customerName: 'Sara', supplyStore: 'A' },
    { date: '2026-10-05', quantity: 5, totalValue: 500, totalCost: 0, profit: 500, customerName: 'Ali', supplyStore: 'B' },
    { date: '2026-10-06', quantity: 5, totalValue: 400, totalCost: 300, profit: -50, customerName: 'Ali', supplyStore: 'B' },
    { date: '2026-10-07', quantity: 0, totalValue: 0, totalCost: 0, profit: 0 },
    { date: '2025-01-01', quantity: 1, totalValue: 1, totalCost: 9, profit: -8 },
    { date: '2026-10-08', quantity: 1, totalValue: 1, totalCost: 9, profit: -8, isDeleted: true },
  ];
  const keys = new Set(['2026-09', '2026-10', '2026-11']);
  const p = analyseProfit(sales, keys);

  it('splits losses from gains and adds up the net', () => {
    assert.equal(p.count, 5);
    assert.deepEqual([p.losing.count, p.losing.sum, p.gaining.count, p.gaining.sum, p.net], [2, -150, 3, 700, 550]);
  });
  it('finds records that make profit unreliable', () => {
    assert.deepEqual([p.noCost.count, p.noCost.value], [1, 500]);
    assert.deepEqual([p.mismatch.count, p.mismatch.sum], [1, -150]);
    assert.equal(p.zeroQty, 1);
  });
  it('ignores ledger rows (old debts, collections, money out, rep returns) in the reliability checks', () => {
    const ledger = [
      { date: '2026-10-03', quantity: 0, totalValue: 20710, transactionType: 'OLD_DEBT', paymentType: 'CREDIT' },
      { date: '2026-10-06', quantity: 0, totalValue: 3200, totalCost: 0, profit: 0, paymentType: 'COLLECTION', isCollection: true },
      { date: '2026-11-13', quantity: 0, totalValue: 4500, totalCost: 0, profit: 0, paymentType: 'MONEY_OUT' },
      { date: '2026-11-13', quantity: 0, totalValue: 0, totalCost: 0, profit: 0, paymentType: 'REP_RETURN' },
    ];
    const r = analyseProfit(ledger, keys);
    assert.deepEqual([r.noCost.count, r.mismatch.count, r.zeroQty], [0, 0, 0]);
    const mixed = analyseProfit([...ledger, { date: '2026-11-10', quantity: 5, totalValue: 500, totalCost: 0, profit: 500 }], keys);
    assert.deepEqual([mixed.noCost.count, mixed.zeroQty], [1, 0]);
  });
  it('compares average price and cost per kg', () => {
    assert.equal(p.qty, 30);
    assert.equal(Math.round(p.avgPrice * 100) / 100, 100);
    assert.equal(Math.round(p.avgCost * 100) / 100, 76.67);
  });
  it('lists the worst sales and the customers, stores and months that lose', () => {
    assert.deepEqual(p.worst.map((w) => [w.customer, w.profit, w.price, w.cost]), [['Ali', -100, 90, 100], ['Ali', -50, 80, 60]]);
    assert.deepEqual(p.byCustomer, []);
    const losing = analyseProfit([{ date: '2026-11-01', quantity: 1, totalValue: 5, totalCost: 9, profit: -4, customerName: 'Zed', supplyStore: 'C' }], keys);
    assert.deepEqual(losing.byCustomer, [{ name: 'Zed', value: -4 }]);
    assert.deepEqual(losing.byStore, [{ name: 'C', value: -4 }]);
    assert.deepEqual(p.byStore, []);
    assert.deepEqual(p.byMonth.map((r) => r.name), ['2026-10', '2026-11']);
  });
  it('is part of the overview and shows plain-language findings', () => {
    const m = buildOverview({ sales }, new Date(2026, 10, 16), 3);
    assert.equal(m.profit.count, 5);
    const html = overviewHtml(m, 3);
    assert.match(html, /Profit and data check/);
    assert.equal((html.match(/Profit and data check/g) || []).length, 1);
    assert.doesNotMatch(html, />Profit check<|>Data integrity</);
    assert.match(html, /of 5 sales made a loss/);
    assert.match(html, /no cost recorded/);
    assert.match(html, /Biggest losses/);
    assert.match(html, /Profit by month/);
    assert.doesNotThrow(() => overviewHtml(buildOverview({}, new Date(2026, 10, 16), 3), 3));
  });
});

describe('net profit follows the Total combined card', () => {
  const production = [
    { date: '2026-11-02', net: 100, totalSale: 3000, totalCost: 1800, profit: 1200, store: 'A', formulaName: 'F' },
    { date: '2026-10-02', net: 20, totalSale: 600, totalCost: 400, profit: 200, store: 'A', formulaName: 'F' },
    { date: '2026-11-05', net: 7, isReturn: true, totalSale: 999, totalCost: 999, profit: 999 },
    { date: '2026-11-06', net: 50, isTransfer: true, totalSale: 999, totalCost: 999, profit: 999 },
  ];
  const sales = [
    { date: '2026-11-03', quantity: 60, totalValue: 500, profit: -300, customerName: 'Ali', supplyDate: '2026-11-03' },
    { date: '2026-10-04', quantity: 10, totalValue: 100, profit: 50, customerName: 'Sara', supplyDate: '2026-11-01' },
    { date: '2026-11-07', quantity: 5, totalValue: 0, profit: 0, customerName: 'Ali', isCollection: true },
  ];
  const m = buildOverview({ production, sales }, now, 3);

  it('takes profit, value and cost from production, not from sales, leaving out returns and transfers', () => {
    assert.deepEqual([m.totals.prodValue, m.totals.prodCost, m.totals.prodProfit], [3600, 2200, 1400]);
    assert.equal(Math.round(m.totals.margin * 10) / 10, 38.9);
    assert.equal(m.totals.salesProfit, -250);
  });

  it('works out stock in, sold and remaining the way the card does, by supply date and without ledger rows', () => {
    assert.deepEqual([m.totals.prodKg, m.totals.returnsKg, m.totals.inKg], [120, 7, 127]);
    assert.equal(m.totals.soldKg, 70);
    assert.equal(m.totals.remainingKg, 57);
    assert.deepEqual(m.months.map((x) => x.soldKg), [0, 0, 70]);
    assert.deepEqual(m.customersKg.map((c) => [c.name, c.value]), [['Ali', 60], ['Sara', 10]]);
  });

  it('shows net profit with its margin, remaining kg and sold-by-customer kg, and explains why sales profit is not added', () => {
    const html = overviewHtml(m, 3);
    assert.match(html, /<span class="ov-kpi-l">Net profit<\/span><span class="ov-kpi-v">1,400<\/span>[\s\S]*?38\.9% margin on 3,600/);
    assert.match(html, /<span class="ov-kpi-l">Remaining<\/span><span class="ov-kpi-v">57 kg<\/span>[\s\S]*?127 in \u00b7 70 sold/);
    assert.match(html, /Sold by customer \(kg\)/);
    assert.match(html, /Stock movement \(kg\)/);
    assert.match(html, /Money trends/);
    assert.match(html, /production value <b>3,600<\/b> minus production cost <b>2,200<\/b> is <b>1,400<\/b>[\s\S]*?not added on top/);
    assert.match(html, /<th>Net profit<\/th><th>Sales profit<\/th>/);
    assert.doesNotMatch(html, /Total profit/);
  });
});

describe('compact layout', () => {
  const html = overviewHtml(buildOverview(data, now, 6), 6);
  const hiddenPanels = (h) => [...h.matchAll(/data-panel-id="(\w+)"( hidden)?/g)].filter((m) => m[2]).map((m) => m[1]);

  it('shows one panel at a time, sales first, with every other panel present but hidden', () => {
    assert.deepEqual(hiddenPanels(html), ['prod', 'money', 'stock', 'checks', 'activity']);
    assert.deepEqual(hiddenPanels(overviewHtml(buildOverview(data, now, 6), 6, { panel: 'checks' })), ['sales', 'prod', 'money', 'stock', 'activity']);
    assert.deepEqual(hiddenPanels(overviewHtml(buildOverview(data, now, 6), 6, { panel: 'nope' })), ['prod', 'money', 'stock', 'checks', 'activity']);
    for (const id of ['sales', 'prod', 'money', 'stock', 'checks', 'activity']) assert.match(html, new RegExp(`data-panel="${id}"`));
  });

  it('has a KPI strip with trends and a right-now strip instead of tall stat cards', () => {
    assert.equal((html.match(/class="ov-kpi /g) || []).length, 8);
    assert.match(html, /<svg class="ov-spark"/);
    assert.match(html, /class="ov-now-strip"/);
    assert.equal((html.match(/class="ov-pill /g) || []).length, 4);
    assert.doesNotMatch(html, /sx-hero|class="section-header"/);
  });

  it('shows trend arrows against the previous month and tolerates flat or empty series', () => {
    assert.match(html, /ov-delta">[\u25b2\u25bc] \d+%/);
    assert.doesNotThrow(() => overviewHtml(buildOverview({}, now, 3), 3));
  });

  it('draws cash against credit as a donut', () => {
    const sales = [{ date: '2026-11-10', totalValue: 300, paymentType: 'CASH' }, { date: '2026-11-11', totalValue: 100, paymentType: 'CREDIT' }];
    const h = overviewHtml(buildOverview({ sales }, now, 3), 3);
    assert.match(h, /class="ov-donut sx-tone-good" style="--p:75"/);
    assert.match(h, /Cash<b>300<\/b><em>75%/);
  });

  it('switches panels without re-rendering and remembers the choice', () => {
    const src = read('../modules/overview.js');
    assert.match(src, /el\.hidden = el\.getAttribute\('data-panel-id'\) !== _panel/);
    assert.match(src, /panel: _panel/);
  });
});

describe('back button returns to overview', () => {
  const native = read('../modules/native.js');
  it('goes to overview from any other main tab, only for full-access devices, after closing dialogs, screens and the menu', () => {
    assert.match(native, /const tab = window\.currentActiveTab;\n  if \(tab && tab !== 'overview' && typeof window\.overviewIsHome === 'function' && window\.overviewIsHome\(\)/);
    assert.ok(native.indexOf("window.sidebarNav('overview')") > native.indexOf('window.closeSidebar()'));
    assert.ok(native.indexOf("window.sidebarNav('overview')") < native.indexOf("Press back again to exit"));
    assert.match(read('../modules/overview.js'), /window\.overviewIsHome = \(\) => appMode === 'admin';/);
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
