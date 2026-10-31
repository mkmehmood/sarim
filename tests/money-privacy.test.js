import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isMoneyRestricted, applyMoneyPrivacy, scrubMoney } from '../modules/money-privacy.js';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const read = (f) => readFileSync(new URL(`../modules/${f}`, import.meta.url), 'utf8');

const tagged = (id) => new RegExp(`<[a-z]+ [^>]*data-money[^>]*id="${id}"|<[a-z]+ [^>]*id="${id}"[^>]*data-money`).test(HTML);

describe('who is money restricted', () => {
  it('restricts user-role devices only', () => {
    assert.equal(isMoneyRestricted('userrole'), true);
    for (const m of ['admin', 'rep', 'production', 'factory', undefined, null]) assert.equal(isMoneyRestricted(m), false, String(m));
  });
});

describe('applyMoneyPrivacy', () => {
  let attr; let scrubbed;
  beforeEach(() => {
    attr = false; scrubbed = [];
    const leaf = { children: { length: 0 }, matches: () => false };
    Object.defineProperty(leaf, 'textContent', { get: () => 'secret', set: (v) => { scrubbed.push(v); } });
    const list = () => ({ forEach: (fn) => fn(leaf) });
    globalThis.document = {
      documentElement: { toggleAttribute: (n, on) => { assert.equal(n, 'data-money-locked'); attr = on; } },
      querySelectorAll: list,
    };
  });

  it('turns the lock on for user roles and clears tagged leaf values', () => {
    assert.equal(applyMoneyPrivacy('userrole'), true);
    assert.equal(attr, true);
    assert.deepEqual(scrubbed, ['']);
  });

  it('turns the lock off again for admin without touching content', () => {
    applyMoneyPrivacy('userrole');
    scrubbed = [];
    assert.equal(applyMoneyPrivacy('admin'), false);
    assert.equal(attr, false);
    assert.deepEqual(scrubbed, []);
  });

  it('is a no-op without a DOM', () => {
    delete globalThis.document;
    assert.equal(applyMoneyPrivacy('userrole'), false);
    scrubMoney();
  });
});

describe('money areas are tagged', () => {
  const ids = [
    'prodHistoryList', 'prod-history-header', 'combinedOverview', 'combinedChart', 'prod-analytics-section', 'prod-toggle-container',
    'prod-formula-cost-block', 'prod-profit-block', 'prod-sale-price-field', 'dynamic-cost-display',
    'custHistoryList', 'sales-summary-card', 'customers-card', 'sale-result-cost', 'sale-result-profit', 'cust-coll-result', 'customer-info-display',
    'repHistoryList', 'rep-customers-card', 'rep-customer-info-display', 'admin-rep-analytics',
    'historyList', 'combinedSection', 'individualChartSection', 'sidebar-btn-stores',
  ];
  for (const id of ids) it(`#${id} is hidden for restricted roles`, () => assert.ok(tagged(id), id));

  it('also tags the sales summary header, sales analytics card and the history headers', () => {
    assert.match(HTML, /data-money class="section-header">\s*<h3>Summary<\/h3>/);
    assert.match(HTML, /data-money class="card chart-card">\s*<div class="section-header">\s*<h3 class="u-heading-main" >Analytics<\/h3>\s*<div class="toggle-group">\s*<div class="toggle-opt active" id="cust-week-btn"/);
    assert.match(HTML, /data-money class="u-03ee4e9 d-flex">\s*<span class="u-9daf5c8">Sales History<\/span>/);
    assert.match(HTML, /data-money class="u-03ee4e9 d-flex">\s*<span class="u-9daf5c8">Calculator History<\/span>/);
  });

  it('keeps Total Value visible so a seller can quote the customer', () => {
    assert.ok(!tagged('sale-result-value'));
  });
});

describe('the lock is enforced in CSS and in the renderers', () => {
  it('hides every tagged element under the lock attribute', () => {
    assert.match(CSS, /html\[data-money-locked\]:not\(\[data-rep-own\]\) \[data-money\],\s*html\[data-money-locked\]\[data-rep-own\] \[data-money\]:not\(\[data-money-rep\]\) \{ display: none; \}/);
  });

  it('is driven by every app-mode change', () => {
    assert.match(read('business.js'), /export function _set_appMode\(v\) \{[^}]*applyMoneyPrivacy\(v\);/);
  });

  it('keeps history lists, summaries, overviews, charts and customer balances out of the DOM', () => {
    const sales = read('utilities-sales.js');
    assert.match(sales, /getElementById\('prodHistoryList'\);\nif \(isMoneyRestricted\(\)\) \{\nhistContainer\.replaceChildren\(\);/);
    assert.match(sales, /getElementById\('custHistoryList'\);\nif \(isMoneyRestricted\(\)\) \{\nhistContainer\.replaceChildren\(\);/);
    for (const fn of ['updateIndChart() {', "updateStoreComparisonChart(mode = 'day') {", 'updateMfgCharts() {', "updateAllStoresOverview(mode = 'day') {", 'updateCustomerCharts() {']) {
      assert.ok(sales.includes(`${fn}\nif (isMoneyRestricted()) return;`), fn);
    }
    assert.ok(read('utilities-payments.js').includes('setSalesSummaryMode(mode) {\ncurrentSalesSummaryMode = mode; window.currentSalesSummaryMode = currentSalesSummaryMode;\nif (isMoneyRestricted()) return;'));
    assert.ok(read('utilities-payments.js').includes('updateSalesCharts(comp) {\nif (isMoneyRestricted()) return;'));
    assert.match(read('customers.js'), /renderCustomersTable\(page = 1\) \{\nif \(isMoneyRestricted\(\)\) \{/);
  });
});

describe('own-rep exemption and payment history', async () => {
  const mp = await import('../modules/money-privacy.js');
  const withTabs = (tabs, fn) => {
    globalThis.window = { _userRoleAllowedTabs: tabs };
    try { return fn(); } finally { delete globalThis.window; }
  };
  it('a rep holding a restricted role may open its own customer screens, nothing else', () => {
    withTabs(['sales', 'rep'], () => {
      assert.equal(mp.isScreenAllowed('rep-customer-management-screen', 'userrole'), true);
      assert.equal(mp.isScreenAllowed('customer-management-screen', 'userrole'), false);
    });
    withTabs(['sales'], () => assert.equal(mp.isScreenAllowed('rep-customer-management-screen', 'userrole'), false));
  });
  it('hides payment history only for the payments role', () => {
    withTabs(['payments'], () => assert.equal(mp.hidesPaymentHistory('userrole'), true));
    withTabs(['sales'], () => assert.equal(mp.hidesPaymentHistory('userrole'), false));
    withTabs(['payments'], () => assert.equal(mp.hidesPaymentHistory('admin'), false));
  });
  it('tags the rep list, rep history and rep customer info as exempt', () => {
    for (const id of ['repHistoryList', 'rep-customers-card', 'rep-customer-info-display'])
      assert.match(HTML, new RegExp(`data-money data-money-rep id="${id}"`));
  });
});
