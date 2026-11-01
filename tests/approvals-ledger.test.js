import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupPending, ledgerRow, ledgerSheet } from '../modules/approvals-core.js';
import { ledgerListHtml, ledgerSheetHtml } from '../modules/approvals-ledger.js';

const ctx = { fmt: (n) => `Rs ${Math.round(n)}`, num: (n) => String(Number(n) || 0), store: (c) => `Store ${c}`, time: () => '2:22 PM', when: (d, t) => [d, t].filter(Boolean).join(' ') };
const who = { name: 'Sara', email: 's@x.com' };
const P = (collection, docId, data, extra = {}) => ({ id: `${collection}:${docId}`, collection, docId, action: 'set', isEdit: false, data, submittedBy: who, submittedAt: Date.UTC(2026, 10, 1, 9, 0), ...extra });
const one = (p) => groupPending([p])[0];

describe('approval rows read like the customer ledger', () => {
  it('a credit sale shows the customer, kg at price, store, amount and who sent it', () => {
    const r = ledgerRow(one(P('sales', 's1', { customerName: 'Al Noor', paymentType: 'CREDIT', quantity: 50, unitPrice: 600, totalValue: 30000, supplyStore: 'main', date: '2026-11-01' })), ctx);
    assert.equal(r.title, 'Al Noor');
    assert.equal(r.sub, 'Credit sale · 50 kg @ Rs 600 · Store main');
    assert.equal(r.amount, 'Rs 30000');
    assert.equal(r.rKind, 'cr');
    assert.equal(r.rIn, false);
    assert.equal(r.dkey, '2026-11-01');
    assert.equal(r.byline, 'Sara · 2:22 PM');
  });
  it('a collection is money in, marked with the incoming style', () => {
    const r = ledgerRow(one(P('sales', 's2', { customerName: 'Bismillah', paymentType: 'COLLECTION', collectedAmount: 12000, date: '2026-11-01' })), ctx);
    assert.equal(r.rKind, 'in');
    assert.equal(r.rIn, true);
    assert.equal(r.sub, 'Collection · Payment received');
    assert.equal(r.amount, 'Rs 12000');
  });
  it('changes and deletions carry a tag; new entries do not', () => {
    const base = { customerName: 'A', paymentType: 'CASH', quantity: 1, unitPrice: 1, totalValue: 1, date: '2026-11-01' };
    assert.equal(ledgerRow(one(P('sales', 'a', base)), ctx).tag, '');
    assert.match(ledgerRow(one(P('sales', 'b', base, { isEdit: true })), ctx).tag, />Change</);
    assert.match(ledgerRow(one(P('sales', 'c', null, { action: 'delete' })), ctx).tag, /is-bad">Delete</);
  });
  it('a record without a date falls back to the day it was submitted', () => {
    const r = ledgerRow(one(P('expenses', 'e', { name: 'Diesel', category: 'Fuel', amount: 8500 })), ctx);
    assert.match(r.dkey, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(r.title, 'Diesel');
  });
  it('a factory production says how many materials it covers', () => {
    const f = P('factory', 'f', { units: 400, formulaName: 'Std', materialsUsed: [{ id: 'm1', name: 'Maize', quantity: 5 }], date: '2026-11-01' });
    const m = P('inventory', 'm1', { name: 'Maize', quantity: 5 });
    const g = groupPending([f, m])[0];
    assert.match(ledgerRow(g, ctx).sub, /· 1 materials$/);
  });
});

describe('the list groups rows into day cards like the ledger', () => {
  const rows = [
    { id: 'a', dkey: '2026-11-01', ms: 2, rKind: 'cr', rIn: false, title: 'A', sub: 's', amount: 'Rs 1', tag: '', byline: 'Sara', submitter: 'Sara' },
    { id: 'b', dkey: '2026-11-01', ms: 1, rKind: 'in', rIn: true, title: 'B', sub: 's', amount: 'Rs 2', tag: '', byline: 'Imran', submitter: 'Imran' },
    { id: 'c', dkey: '2026-10-31', ms: 3, rKind: 'cash', rIn: false, title: 'C', sub: 's', amount: 'Rs 3', tag: '', byline: 'Sara', submitter: 'Sara' },
  ];
  const html = ledgerListHtml(rows);
  it('makes one card per day, newest day first, with the date only on its first row', () => {
    assert.equal((html.match(/class="card cm-day"/g) || []).length, 2);
    assert.ok(html.indexOf('data-day="2026-11-01"') < html.indexOf('data-day="2026-10-31"'));
    assert.equal((html.match(/<span class="cm-date"><b>/g) || []).length, 2);
  });
  it('uses the ledger row classes and opens the approval sheet', () => {
    assert.match(html, /class="row cm-row cm-cr"/);
    assert.match(html, /class="row cm-row cm-in"/);
    assert.match(html, /onclick="openApprovalSheet\(this\.dataset\.id\)"/);
    assert.match(html, /<b class="is-in">\+ Rs 2<\/b>/);
  });
  it('closes each day with a count and who sent them', () => {
    assert.match(html, /<div class="cm-day-foot"><span>2 waiting · Sara, Imran<\/span>/);
    assert.match(html, /onclick="discardDayPending\(this\.dataset\.day\)"/);
    assert.match(html, /onclick="approveDayPending\(this\.dataset\.day\)"/);
  });
  it('escapes anything typed by a team member', () => {
    const bad = ledgerListHtml([{ ...rows[0], title: '<img src=x onerror=1>' }]);
    assert.ok(!bad.includes('<img'));
    assert.ok(bad.includes('&lt;img'));
  });
});

describe('the approval sheet follows the ledger transaction sheet', () => {
  it('shows customer and amount in the head, details in the body and a waiting strip', () => {
    const g = one(P('sales', 's1', { customerName: 'Al Noor', paymentType: 'CREDIT', quantity: 50, unitPrice: 600, totalValue: 30000, supplyStore: 'main', date: '2026-11-01' }));
    const m = ledgerSheet(g, ctx);
    assert.equal(m.title, 'Al Noor');
    assert.equal(m.amtText, 'Rs 30000');
    assert.equal(m.typeLine, 'Credit sale');
    assert.ok(!m.lines.includes('Al Noor'));
    assert.equal(m.stripText, 'New · Sara');
    const html = ledgerSheetHtml(m, '<button>x</button>');
    assert.match(html, /class="cm-sheet-head"/);
    assert.match(html, /class="cust-history-info"/);
    assert.match(html, /class="txn-balance-after txn-balance-neutral"><span>Waiting for approval<\/span><b>New · Sara<\/b>/);
    assert.match(html, /class="cm-sheet-actions"><button>x<\/button>/);
  });
  it('a collection shows its amount as money in', () => {
    const m = ledgerSheet(one(P('sales', 's2', { customerName: 'B', paymentType: 'COLLECTION', collectedAmount: 5, date: '2026-11-01' })), ctx);
    assert.equal(m.rIn, true);
    assert.match(ledgerSheetHtml(m, ''), /cm-sheet-amt is-in">\+ Rs 5/);
  });
  it('a deletion says so in the strip', () => {
    const m = ledgerSheet(one(P('sales', 'd', null, { action: 'delete' })), ctx);
    assert.equal(m.stripText, 'Delete · Sara');
  });
  it('the screen uses these builders with the ledger list class', () => {
    const ui = readFileSync(new URL('../modules/approvals.js', import.meta.url), 'utf8');
    assert.match(ui, /list\.className = 'cm-list';/);
    assert.match(ui, /ledgerListHtml\(groups\.map\(\(g\) => ledgerRow\(g, ctx\)\)\)/);
    assert.match(ui, /ledgerSheetHtml\(m,/);
  });
});
