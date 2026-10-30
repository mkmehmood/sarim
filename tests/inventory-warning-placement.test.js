import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SALES = readFileSync(new URL('../modules/utilities-sales.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('sale inventory notice placement', () => {

  it('the sale save button sits inside the footer band, not directly in the card', () => {
    assert.match(HTML, /<div class="form-foot"><button class="btn btn-main" id="btn-save-cust-transaction"/);
  });

  it('the stock tile is static markup inside the single results card, above the footer band', () => {
    assert.match(HTML, /id="sale-result-card">[\s\S]*id="cust-profit"[\s\S]*id="inventory-warning"[^>]*><\/button>\s*<\/div>[\s\S]*<div class="form-foot"><button class="btn btn-main" id="btn-save-cust-transaction"/);
    assert.doesNotMatch(SALES, /createInventoryWarningElement/);
  });
});

describe('camera screen colours', () => {
  const CSS = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
  const camRules = CSS.split('\n').filter(l => /^\s*\.cam-|^\s+(width: \d+px; height: \d+px; padding: 5px|min-width: 40px)/.test(l) || /^\.cam-/.test(l));
  it('uses fixed white (not the theme text colour) on the always-black camera screen', () => {
    const start = CSS.indexOf('.cam-modal {');
    const end = CSS.indexOf('@keyframes camFocus');
    assert.ok(start > 0 && end > start);
    assert.doesNotMatch(CSS.slice(start, end), /var\(--text-main\)/);
    assert.ok(camRules.length > 0);
  });
});

describe('sale form layout', () => {
  it('puts cost, value, profit and stock in one card', () => {
    const card = HTML.slice(HTML.indexOf('id="sale-result-card"'), HTML.indexOf('id="cust-coll-result"'));
    for (const id of ['sale-result-cost', 'sale-result-value', 'sale-result-profit', 'inventory-warning']) assert.ok(card.includes(`id="${id}"`), id);
  });
  it('keeps the supply stores in their own row above payment', () => {
    const qty = HTML.slice(HTML.indexOf('id="cust-quantity"'), HTML.indexOf('id="cust-return-inputs"'));
    assert.ok(!qty.includes('id="supply-store-toggles"'));
    const row = HTML.slice(HTML.indexOf('id="cust-sale-supply-payment"'), HTML.indexOf('id="sale-result-card"'));
    assert.ok(row.includes('id="supply-store-toggles"') && row.includes('id="supply-store-value"'));
    assert.ok(row.indexOf('id="supply-store-toggles"') < row.indexOf('id="btn-payment-cash"'));
  });
});

describe('calculator results card', () => {
  it('puts expected cash, status and the three commission rows in one card', () => {
    const card = HTML.slice(HTML.indexOf('id="calc-result-card"'), HTML.indexOf('id="btn-save-calculator"'));
    for (const id of ['totalExpectedCash', 'discrepancyStatus', 'grossCommissionEarned', 'commissionPaidDisplay', 'commissionPayableDisplay']) assert.ok(card.includes(`id="${id}"`), id);
    assert.equal((card.match(/class="card /g) || []).length, 0);
  });
  it('colours the status and payable values, not whole boxes', () => {
    assert.match(SALES, /const _tone = \(ok\) => \(ok \? 'u-text-accent u-fw-800' : 'u-danger-bold'\)/);
    assert.doesNotMatch(SALES, /discrepancyBox'\)\s*;\s*[\s\S]{0,40}box\.className/);
  });
});
