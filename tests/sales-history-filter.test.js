import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractFunctions } from './_extract.js';

const mkCard = (date, customer) => ({ date, customer, shown: true, getAttribute(k) { return k === 'data-date' ? this.date : this.customer; } });
let cards; let emptyNodes; let input;
const list = {
  querySelectorAll: (sel) => (sel === '.hist-filter-empty' ? emptyNodes.map((n) => ({ remove() { emptyNodes = emptyNodes.filter((x) => x !== n); } })) : []),
  appendChild: (n) => emptyNodes.push(n)
};
let tiles = [];
const doc = {
  querySelectorAll: (sel) => (sel.includes(':not(.hc-metric)') ? cards : [...cards, ...tiles]),
  querySelector: () => list,
  createElement: () => ({ className: '', innerHTML: '' }),
  getElementById: (id) => (id === 'cust-name' ? input : null)
};
const win = { setDisplay: (el, v) => { el.shown = v !== 'none'; } };

const biz = extractFunctions('modules/business.js', ['selectedCustomerFilter', 'customerHistoryMatcher'], { document: doc });
const pay = extractFunctions('modules/utilities-payments.js', ['_filterHistoryByPeriod', '_cardInPeriod', '_showHistoryFilterEmpty', '_showFilterEmpty'], {
  document: doc, window: win, customerHistoryMatcher: biz.customerHistoryMatcher, hcEmptyHtml: (m) => `<div>${m}</div>`
});
const visible = (mode) => { pay._filterHistoryByPeriod('#custHistoryList', '2026-10-28', mode); return cards.filter((c) => c.shown).map((c) => `${c.customer}@${c.date}`); };

beforeEach(() => {
  cards = [mkCard('2026-10-28', 'ali'), mkCard('2026-10-25', 'ali khan'), mkCard('2026-10-10', 'sara'), mkCard('2026-03-01', 'ali'), mkCard('2025-12-31', 'sara')];
  emptyNodes = [];
  tiles = cards.map(() => ({ shown: true, getAttribute: () => null }));
  input = { value: '', dataset: {} };
});

describe('summary duration toggles hide and show history', () => {
  it('daily shows only the selected day', () => assert.deepEqual(visible('day'), ['ali@2026-10-28']));
  it('weekly shows the last 7 days', () => assert.equal(visible('week').length, 2));
  it('monthly shows the selected month', () => assert.equal(visible('month').length, 3));
  it('yearly shows the selected year', () => assert.equal(visible('year').length, 4));
  it('all time shows everything', () => assert.equal(visible('all').length, 5));
  it('switching back and forth restores hidden cards', () => {
    visible('day'); assert.equal(visible('all').length, 5);
  });
});

describe('name input filters history', () => {
  it('typing part of a name filters live', () => {
    input.value = 'ali';
    assert.deepEqual(visible('all'), ['ali@2026-10-28', 'ali khan@2026-10-25', 'ali@2026-03-01']);
  });
  it('picking a person shows exactly that person', () => {
    input.value = 'Ali'; input.dataset.histCustomer = 'ali';
    assert.deepEqual(visible('all'), ['ali@2026-10-28', 'ali@2026-03-01']);
  });
  it('name and duration combine', () => {
    input.value = 'ali'; input.dataset.histCustomer = 'ali';
    assert.deepEqual(visible('month'), ['ali@2026-10-28']);
  });
  it('clearing the name shows everyone again', () => {
    input.value = 'sara'; visible('all'); input.value = '';
    assert.equal(visible('all').length, 5);
  });
  it('never hides the stat tiles inside visible cards', () => {
    input.value = 'ali'; visible('all');
    assert.ok(tiles.every((t) => t.shown), 'metric tiles stay visible');
  });
  it('shows the empty message for a period with no sales even when no name is typed', () => {
    pay._filterHistoryByPeriod('#custHistoryList', '2026-01-01', 'day');
    assert.equal(emptyNodes.length, 1);
  });
  it('shows a message when nothing matches, and removes it afterwards', () => {
    input.value = 'zzz'; assert.equal(visible('all').length, 0); assert.equal(emptyNodes.length, 1);
    input.value = ''; visible('all'); assert.equal(emptyNodes.length, 0);
  });
});

describe('summary numbers follow the selected person', () => {
  const { computeCustomerPeriodStats } = extractFunctions('modules/utilities-sales.js', ['computeCustomerPeriodStats'], {});
  const sale = (customerName, date, totalValue, quantity) => ({ customerName, date, totalValue, quantity, paymentType: 'CASH', profit: 10 });
  const data = [sale('ali', '2026-10-28', 1000, 5), sale('sara', '2026-10-28', 400, 2), sale('ali', '2026-03-01', 300, 1)];
  it('everyone when no filter', () => {
    const s = computeCustomerPeriodStats(data, '2026-10-28', null);
    assert.equal(s.day.v, 1400); assert.equal(s.all.v, 1700); assert.equal(s.all.q, 8);
  });
  it('only the picked person when filtered', () => {
    const s = computeCustomerPeriodStats(data, '2026-10-28', (n) => n === 'ali');
    assert.equal(s.day.v, 1000); assert.equal(s.all.v, 1300); assert.equal(s.year.q, 6);
  });
});

describe('history cards can actually be hidden', () => {
  it('app.css lets d-none beat the flex display of .hc-card', () => {
    const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
    assert.match(css, /\.hc-card\.d-none\s*\{\s*display:\s*none/);
  });
});
