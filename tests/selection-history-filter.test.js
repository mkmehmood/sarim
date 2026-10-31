import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractFunctions } from './_extract.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const mkCard = (attrs) => ({ attrs, shown: true, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } });

let lists; let inputs; let emptyNodes;
const doc = {
  getElementById: (id) => inputs[id] || null,
  querySelectorAll: (sel) => lists[sel] || [],
  querySelector: (sel) => (Object.keys(lists).some((k) => k.startsWith(`${sel} `)) ? { querySelectorAll: () => emptyNodes.map((n) => ({ remove() { emptyNodes = emptyNodes.filter((x) => x !== n); } })), appendChild: (n) => emptyNodes.push(n) } : null),
  createElement: () => ({ className: '', innerHTML: '' })
};
const win = { setDisplay: (el, v) => { el.shown = v !== 'none'; } };

const biz = extractFunctions('modules/business.js', ['selectedCustomerFilter', 'customerHistoryMatcher', 'selectedValueFilter', 'routeHistoryMatcher'], { document: doc });
const pay = extractFunctions('modules/utilities-payments.js',
  ['_showFilterEmpty', '_filterPaymentHistoryByPeriod', '_filterFactoryHistoryByMode', 'applyPaymentHistoryFilter', 'applyStockTransferFilter', 'applyPaymentTransferFilter'],
  { document: doc, window: win, localDateStr: () => '2026-10-31', hcEmptyHtml: (m) => `<div>${m}</div>`, ...biz });

const shownOf = (sel, attr) => lists[sel].filter((c) => c.shown).map((c) => c.attrs[attr]);

beforeEach(() => {
  emptyNodes = [];
  inputs = {};
  lists = {};
});

describe('routeHistoryMatcher', () => {
  const hidden = (value, picked) => ({ value, dataset: picked ? { histPicked: '1' } : {} });
  it('does nothing until a store was actually picked', () => {
    inputs = { f: hidden('zubair', false), t: hidden('mahmood', false) };
    assert.equal(biz.routeHistoryMatcher('f', 't'), null);
  });
  it('filters by the source only when only the source was picked', () => {
    inputs = { f: hidden('Zubair', true), t: hidden('mahmood', false) };
    const m = biz.routeHistoryMatcher('f', 't');
    assert.equal(m('zubair', 'asaan'), true);
    assert.equal(m('mahmood', 'zubair'), false);
  });
  it('filters by the destination only when only the destination was picked', () => {
    inputs = { f: hidden('zubair', false), t: hidden('asaan', true) };
    const m = biz.routeHistoryMatcher('f', 't');
    assert.equal(m('mahmood', 'asaan'), true);
    assert.equal(m('mahmood', 'zubair'), false);
  });
  it('needs both ends to match once both were picked', () => {
    inputs = { f: hidden('zubair', true), t: hidden('asaan', true) };
    const m = biz.routeHistoryMatcher('f', 't');
    assert.equal(m('zubair', 'asaan'), true);
    assert.equal(m('zubair', 'mahmood'), false);
    assert.equal(m('asaan', 'zubair'), false);
  });
  it('selectedValueFilter reads a hidden value trimmed and lowercased, and tolerates a missing field', () => {
    inputs = { v: { value: '  ABC-1 ', dataset: {} } };
    assert.equal(biz.selectedValueFilter('v'), 'abc-1');
    assert.equal(biz.selectedValueFilter('nope'), '');
  });
});

describe('payments tab history follows the entity name', () => {
  const SEL = '#paymentHistoryList .card';
  beforeEach(() => {
    inputs = { unifiedPeriodFilter: { value: 'all' }, expenseName: { value: '', dataset: {} } };
    lists[SEL] = [mkCard({ 'data-date': '2026-10-30', 'data-entity': 'ali traders' }), mkCard({ 'data-date': '2026-10-01', 'data-entity': 'ali' }), mkCard({ 'data-date': '2026-09-01', 'data-entity': 'sara' })];
  });
  const names = () => shownOf(SEL, 'data-entity');
  it('shows everything when no name is typed', () => {
    pay._filterPaymentHistoryByPeriod();
    assert.equal(names().length, 3);
  });
  it('typing part of a name filters live', () => {
    inputs.expenseName.value = 'ali';
    pay.applyPaymentHistoryFilter();
    assert.deepEqual(names(), ['ali traders', 'ali']);
  });
  it('picking an entity shows exactly that entity', () => {
    inputs.expenseName.value = 'Ali'; inputs.expenseName.dataset.histCustomer = 'ali';
    pay.applyPaymentHistoryFilter();
    assert.deepEqual(names(), ['ali']);
  });
  it('shows a message when nothing matches and removes it once cleared', () => {
    inputs.expenseName.value = 'zzz';
    pay.applyPaymentHistoryFilter();
    assert.equal(names().length, 0); assert.equal(emptyNodes.length, 1);
    inputs.expenseName.value = '';
    pay.applyPaymentHistoryFilter();
    assert.equal(names().length, 3); assert.equal(emptyNodes.length, 0);
  });
  it('combines with the period filter', () => {
    inputs.unifiedPeriodFilter.value = 'all';
    inputs.expenseName.value = 'sara';
    pay.applyPaymentHistoryFilter();
    assert.deepEqual(names(), ['sara']);
  });
});

describe('factory tab history follows the selected formula', () => {
  const SEL = '#factoryHistoryList .hc-card';
  beforeEach(() => {
    inputs = { 'factory-date': { value: '2026-10-28' }, 'factory-formula-value': { value: 'f-A', dataset: {} } };
    lists[SEL] = [
      mkCard({ 'data-date': '2026-10-28', 'data-formula': 'f-a' }),
      mkCard({ 'data-date': '2026-10-28', 'data-formula': 'f-b' }),
      mkCard({ 'data-date': '2026-10-20', 'data-formula': 'f-a' }),
      mkCard({ 'data-date': '2026-03-01', 'data-formula': 'f-b' })
    ];
  });
  const rows = () => lists[SEL].filter((c) => c.shown).map((c) => `${c.attrs['data-formula']}@${c.attrs['data-date']}`);
  it('keeps only the selected formula, case-insensitively', () => {
    pay._filterFactoryHistoryByMode('all');
    assert.deepEqual(rows(), ['f-a@2026-10-28', 'f-a@2026-10-20']);
  });
  it('combines the formula with the summary duration', () => {
    pay._filterFactoryHistoryByMode('daily');
    assert.deepEqual(rows(), ['f-a@2026-10-28']);
  });
  it('switching formula shows the other formula', () => {
    inputs['factory-formula-value'].value = 'f-b';
    pay._filterFactoryHistoryByMode('all');
    assert.deepEqual(rows(), ['f-b@2026-10-28', 'f-b@2026-03-01']);
  });
  it('shows everyone when no formula is selected', () => {
    inputs['factory-formula-value'].value = '';
    pay._filterFactoryHistoryByMode('all');
    assert.equal(rows().length, 4);
  });
  it('shows a message when the formula has nothing in the period', () => {
    inputs['factory-formula-value'].value = 'f-c';
    pay._filterFactoryHistoryByMode('all');
    assert.equal(rows().length, 0); assert.equal(emptyNodes.length, 1);
  });
});

describe('stock transfer history follows the picked stores', () => {
  const SEL = '#stockTransferHistoryList .card';
  const hidden = (value, picked) => ({ value, dataset: picked ? { histPicked: '1' } : {} });
  beforeEach(() => {
    lists[SEL] = [mkCard({ 'data-from': 'zubair', 'data-to': 'mahmood' }), mkCard({ 'data-from': 'mahmood', 'data-to': 'zubair' }), mkCard({ 'data-from': 'zubair', 'data-to': 'asaan' })];
  });
  const routes = () => lists[SEL].filter((c) => c.shown).map((c) => `${c.attrs['data-from']}>${c.attrs['data-to']}`);
  it('shows all transfers on open, even though the form has default stores', () => {
    inputs = { 'stock-transfer-from-value': hidden('zubair', false), 'stock-transfer-to-value': hidden('mahmood', false) };
    pay.applyStockTransferFilter();
    assert.equal(routes().length, 3);
  });
  it('picking the From store shows transfers out of it', () => {
    inputs = { 'stock-transfer-from-value': hidden('zubair', true), 'stock-transfer-to-value': hidden('mahmood', false) };
    pay.applyStockTransferFilter();
    assert.deepEqual(routes(), ['zubair>mahmood', 'zubair>asaan']);
  });
  it('picking both stores shows exactly that route', () => {
    inputs = { 'stock-transfer-from-value': hidden('zubair', true), 'stock-transfer-to-value': hidden('asaan', true) };
    pay.applyStockTransferFilter();
    assert.deepEqual(routes(), ['zubair>asaan']);
  });
  it('shows a message for a route with no transfers', () => {
    inputs = { 'stock-transfer-from-value': hidden('asaan', true), 'stock-transfer-to-value': hidden('zubair', true) };
    pay.applyStockTransferFilter();
    assert.equal(routes().length, 0); assert.equal(emptyNodes.length, 1);
  });
});

describe('payment transfer history follows the entities', () => {
  const SEL = '#paymentTransferHistoryList .card';
  beforeEach(() => {
    inputs = { 'payment-transfer-from-search': { value: '', dataset: {} }, 'payment-transfer-to-search': { value: '', dataset: {} } };
    lists[SEL] = [mkCard({ 'data-from': 'ali', 'data-to': 'sara' }), mkCard({ 'data-from': 'ali khan', 'data-to': 'omar' }), mkCard({ 'data-from': 'sara', 'data-to': 'ali' })];
  });
  const routes = () => lists[SEL].filter((c) => c.shown).map((c) => `${c.attrs['data-from']}>${c.attrs['data-to']}`);
  it('shows all when both fields are empty', () => {
    pay.applyPaymentTransferFilter();
    assert.equal(routes().length, 3);
  });
  it('typing in From filters live by source', () => {
    inputs['payment-transfer-from-search'].value = 'ali';
    pay.applyPaymentTransferFilter();
    assert.deepEqual(routes(), ['ali>sara', 'ali khan>omar']);
  });
  it('picking From is exact, not a substring', () => {
    inputs['payment-transfer-from-search'].value = 'Ali'; inputs['payment-transfer-from-search'].dataset.histCustomer = 'ali';
    pay.applyPaymentTransferFilter();
    assert.deepEqual(routes(), ['ali>sara']);
  });
  it('From and To combine', () => {
    inputs['payment-transfer-from-search'].value = 'ali';
    inputs['payment-transfer-to-search'].value = 'omar';
    pay.applyPaymentTransferFilter();
    assert.deepEqual(routes(), ['ali khan>omar']);
  });
  it('shows a message when nothing matches', () => {
    inputs['payment-transfer-to-search'].value = 'zzz';
    pay.applyPaymentTransferFilter();
    assert.equal(routes().length, 0); assert.equal(emptyNodes.length, 1);
  });
});

describe('selection filter wiring', () => {
  const payments = read('modules/utilities-payments.js');
  const sales = read('modules/utilities-sales.js');
  const factory = read('modules/factory.js');
  const formulaStore = read('modules/formula-store.js');
  const ledger = read('modules/daily-ledger.js');
  const html = read('index.html');

  it('payment, transfer and factory cards carry what the filters read', () => {
    assert.match(payments, /'data-entity': String\(entityName/);
    assert.match(payments, /'data-from': String\(t\.entityName/);
    assert.match(payments, /'data-to': String\(t\.transferPeerEntityName/);
    assert.match(sales, /'data-from': item\.store/);
    assert.match(sales, /'data-to': item\.transferPeerStore/);
    assert.match(factory, /'data-formula': entry\.formulaId/);
  });
  it('picking from a dropdown refreshes the filter', () => {
    assert.match(payments, /_nameInput\.dataset\.histCustomer = String\(name/);
    assert.match(payments, /type === 'entity' && \(inputId === 'payment-transfer-from-search'/);
  });
  it('the inputs refresh their history as you type or pick', () => {
    assert.match(html, /oninput="handleExpenseSearch\(\); applyPaymentHistoryFilter\(\)"/);
    assert.match(html, /dailyLedgerSetParty\(\)/);
    assert.match(html, /applyPaymentTransferFilter\(\)/);
    assert.match(html, /histPicked='1';[^"]*applyStockTransferFilter/);
  });
  it('factory summary and history follow the formula picker', () => {
    assert.match(sales, /selectedValueFilter\('factory-formula-value'\)/);
    assert.match(payments, /selectedValueFilter\('factory-formula-value'\)/);
    assert.match(formulaStore, /window\.refreshFactoryFormulaFilter/);
    assert.match(factory, /export function refreshFactoryFormulaFilter/);
  });
  it('daily ledger totals and list follow the party, but cash balances stay global', () => {
    assert.match(ledger, /customerHistoryMatcher\('dl-party'\)/);
    assert.match(ledger, /filterRows\(sortNewestFirst\(partyRows\(_rows\)\)/);
    assert.match(ledger, /el\('dl-hero-amt'\)\.textContent = fmtAmt\(all\.inHand\)/);
    assert.match(ledger, /el\('dl-sum-in'\)\.textContent = fmtAmt\(s\.totalIn\)/);
    assert.match(ledger, /inputId === 'dl-party'/);
  });
  it('sales analytics charts follow the selected customer', () => {
    assert.match(sales, /_chartMatch = customerHistoryMatcher\('cust-name'\)/);
    assert.match(payments, /window\.updateCustomerCharts\(\)/);
  });
});
