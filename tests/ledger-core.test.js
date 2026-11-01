import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isCashMode, isBankMode, isDefaultMode, isHomeExpense, parseAmount, normalizeRows, buildStatement, computeSummary, filterRows, buildLists, suggest, buildEntry, savedMessage, voucherText, auditText, defaultCategory, sortNewestFirst } from '../modules/ledger-core.js';
const fmt = (n) => String(n);
const row = (o) => ({ id: o.id, type: 'IN', amount: 0, mode: 'Cash', toMode: '', category: '', scope: '', party: '', note: '', ref: '', date: '2026-01-01', timestamp: 1, ...o });
describe('payment mode classification matches the reference', () => {
  it('cash and bank aliases', () => {
    assert.ok(isCashMode(' Petty Cash '));
    assert.ok(isBankMode('Cheque'));
    assert.ok(isBankMode('bank_transfer'));
    assert.equal(isDefaultMode('Easypaisa'), false);
    assert.equal(isBankMode('Online Transfer'), false);
  });
});
describe('home expense detection', () => {
  it('uses scope first, then keywords', () => {
    assert.ok(isHomeExpense('Raw Materials', 'HOME'));
    assert.ok(isHomeExpense('Home Rent'));
    assert.ok(isHomeExpense('School / Tuition Fees'));
    assert.equal(isHomeExpense('Raw Materials', 'BUSINESS'), false);
    assert.equal(isHomeExpense(''), false);
  });
});
describe('amount parsing', () => {
  it('handles decimal comma, thousands commas and junk', () => {
    assert.equal(parseAmount('12,5'), 12.5);
    assert.equal(parseAmount('1,000'), 1000);
    assert.equal(parseAmount('1,25,000'), 125000);
    assert.equal(parseAmount('1,25'), 1.25);
    assert.equal(parseAmount(' 7 50 '), 750);
    assert.equal(parseAmount('abc'), null);
  });
});
describe('legacy rows are normalised', () => {
  it('maps type aliases, defaults mode and derives scope', () => {
    const [a, b, c] = normalizeRows([{ id: 1, type: 'CASH_OUT', amount: '50', category: 'Home Rent' }, { id: 2, type: 'TRANSFER', amount: 5, mode: 'Cash' }, { id: 3, amount: 9 }, { amount: 1 }, { id: 4, amount: 'x' }]);
    assert.equal(a.type, 'OUT');
    assert.equal(a.scope, 'HOME');
    assert.equal(a.amount, 50);
    assert.equal(b.toMode, 'Bank Transfer');
    assert.equal(c.type, 'IN');
    assert.equal(c.mode, 'Cash');
  });
});
describe('running statement and summary', () => {
  const rows = [
    row({ id: 'a', type: 'IN', amount: 1000, mode: 'Cash', category: 'Sales', date: '2026-01-01' }),
    row({ id: 'b', type: 'OUT', amount: 300, mode: 'Cash', category: 'Raw Materials', date: '2026-01-02' }),
    row({ id: 'c', type: 'TRANSFER', amount: 200, mode: 'Cash', toMode: 'Bank Transfer', date: '2026-01-03' }),
    row({ id: 'd', type: 'IN', amount: 50, mode: 'Easypaisa', category: 'Sales', date: '2026-01-04' })
  ];
  it('transfers have zero statement impact', () => {
    const m = buildStatement(rows);
    assert.deepEqual(m.get('b'), { before: 1000, after: 700, impact: -300 });
    assert.deepEqual(m.get('c'), { before: 700, after: 700, impact: 0 });
    assert.equal(m.get('d').after, 750);
  });
  it('splits balances by mode and keeps transfers out of totals', () => {
    const s = computeSummary(rows);
    assert.equal(s.inHand, 750);
    assert.equal(s.cash, 500);
    assert.equal(s.bank, 200);
    assert.equal(s.others, 50);
    assert.equal(s.totalTransferred, 200);
    assert.equal(s.transferCount, 1);
    assert.deepEqual(s.byCategory, { Sales: 1050, 'Raw Materials': 300 });
    assert.equal(s.byMode['Bank Transfer'], 200);
  });
});
describe('history filters', () => {
  const rows = [
    row({ id: 'a', type: 'OUT', amount: 10, category: 'Raw Materials', party: 'Ali', scope: 'BUSINESS' }),
    row({ id: 'b', type: 'OUT', amount: 20, category: 'Groceries & Food', scope: 'HOME' }),
    row({ id: 'c', type: 'TRANSFER', amount: 30, mode: 'Cash', toMode: 'Easypaisa' }),
    row({ id: 'd', type: 'IN', amount: 40, mode: 'Bank Transfer', category: 'Sales', note: 'invoice 9' })
  ];
  const ids = (o) => filterRows(rows, o).map((r) => r.id);
  it('type chips', () => {
    assert.deepEqual(ids({ type: 'BUSINESS' }), ['a']);
    assert.deepEqual(ids({ type: 'HOME' }), ['b']);
    assert.deepEqual(ids({ type: 'TRANSFER' }), ['c']);
    assert.deepEqual(ids({ type: 'IN' }), ['d']);
  });
  it('mode chips include the destination of a transfer', () => {
    assert.deepEqual(ids({ mode: 'OTHERS' }), ['c']);
    assert.deepEqual(ids({ mode: 'BANK' }), ['d']);
    assert.deepEqual(ids({ mode: 'easypaisa' }), ['c']);
  });
  it('search covers party, note, category and amount', () => {
    assert.deepEqual(ids({ query: 'ali' }), ['a']);
    assert.deepEqual(ids({ query: 'invoice' }), ['d']);
    assert.deepEqual(ids({ query: '30' }), ['c']);
  });
});
describe('suggestion lists and auto-create', () => {
  it('learns custom categories and modes from entries', () => {
    const l = buildLists([row({ id: 'a', type: 'OUT', category: 'Noman Shah', scope: 'BUSINESS', mode: 'Raast' }), row({ id: 'b', type: 'IN', category: 'Scrap Sale', party: 'Zed' })]);
    assert.ok(l.business.includes('Noman Shah'));
    assert.ok(l.income.includes('Scrap Sale'));
    assert.ok(l.modes.includes('Raast'));
    assert.deepEqual(l.parties, ['Zed']);
  });
  it('suggest flags unknown text as new', () => {
    assert.equal(suggest(['Cash', 'Cheque'], 'ch').matches.join(), 'Cheque');
    assert.equal(suggest(['Cash'], 'Raast').isNew, true);
    assert.equal(suggest(['Cash'], 'cash').isNew, false);
  });
});
describe('entry building and validation', () => {
  const ctx = { id: 'new', now: 99, today: '2026-02-02', modes: ['Cash', 'Bank Transfer'] };
  it('rejects bad amounts and same-channel transfers', () => {
    assert.equal(buildEntry({ type: 'IN', amount: '0' }, null, ctx).ok, false);
    const r = buildEntry({ type: 'TRANSFER', amount: '5', mode: 'cash', toMode: 'CASH' }, null, ctx);
    assert.equal(r.ok, false);
    assert.match(r.error, /must be different/);
  });
  it('defaults blank category and canonicalises the mode', () => {
    const r = buildEntry({ type: 'OUT', scope: 'BUSINESS', amount: '10', mode: 'cash', category: '' }, null, ctx);
    assert.equal(r.entry.category, 'Raw Materials');
    assert.equal(r.entry.mode, 'Cash');
    assert.equal(r.entry.date, '2026-02-02');
  });
  it('a home-style category forces the HOME scope', () => {
    assert.equal(buildEntry({ type: 'OUT', scope: 'BUSINESS', amount: '10', category: 'Home Rent' }, null, ctx).entry.scope, 'HOME');
  });
  it('income entries carry no scope and transfers carry no party', () => {
    assert.equal(buildEntry({ type: 'IN', amount: '1', category: 'Sales' }, null, ctx).entry.scope, '');
    const t = buildEntry({ type: 'TRANSFER', amount: '1', mode: 'Cash', toMode: 'Bank Transfer', party: 'x' }, null, ctx).entry;
    assert.equal(t.party, '');
    assert.equal(t.category, 'Account Transfer');
  });
  it('edit keeps id and creation timestamp', () => {
    const r = buildEntry({ type: 'IN', amount: '2' }, { id: 'old', timestamp: 5 }, ctx);
    assert.equal(r.entry.id, 'old');
    assert.equal(r.entry.timestamp, 5);
    assert.equal(r.entry.updatedAt, 99);
  });
  it('save messages follow the reference wording', () => {
    assert.equal(savedMessage({ type: 'TRANSFER', amount: 5, mode: 'Cash', toMode: 'Bank' }, false, fmt), 'Transferred 5: Cash ➔ Bank');
    assert.equal(savedMessage({ type: 'OUT', scope: 'HOME' }, false, fmt), 'Cash Out (Home Expense) saved.');
    assert.equal(savedMessage({ type: 'IN' }, true, fmt), 'Transaction updated successfully.');
  });
  it('default categories per type', () => {
    assert.equal(defaultCategory('IN', 'BUSINESS'), 'Sales');
    assert.equal(defaultCategory('OUT', 'HOME'), 'Groceries & Food');
    assert.equal(defaultCategory('TRANSFER', 'BUSINESS'), 'Account Transfer');
  });
});
describe('voucher and audit exports', () => {
  const rows = [row({ id: 'a', type: 'IN', amount: 100, category: 'Sales', party: 'Ali', ref: 'B1', note: 'n' }), row({ id: 'b', type: 'OUT', amount: 40, category: 'Raw Materials', scope: 'BUSINESS', date: '2026-01-02' })];
  const stmt = buildStatement(rows);
  it('voucher lists statement balances and optional fields', () => {
    const v = voucherText(rows[0], stmt.get('a'), fmt);
    assert.match(v, /Balance Before: 0/);
    assert.match(v, /Balance After:  100/);
    assert.match(v, /Party \/ Name: Ali/);
    assert.match(v, /Ref \/ Bill No: B1/);
  });
  it('audit log carries totals, breakdowns and per-row balance', () => {
    const a = auditText(computeSummary(rows), sortNewestFirst(rows), stmt, fmt);
    assert.match(a, /TOTAL CASH IN HAND: 60/);
    assert.match(a, /PAYMENT CHANNEL BREAKDOWN:/);
    assert.match(a, /\[Biz\]/);
    assert.match(a, /Bal After: 60/);
  });
});
describe('ledger screen has no trailing note and is wired', () => {
  it('index.html drops the bottom note and keeps the screen', async () => {
    const { readFileSync } = await import('node:fs');
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const start = html.indexOf('id="daily-ledger-screen"');
    const block = html.slice(start, html.indexOf('id="raw-material-screen"'));
    assert.ok(start > 0);
    assert.equal(block.includes('<strong class="u-cab13eb">Note:</strong>'), false);
    assert.equal(block.includes('kept separately on this device'), false);
  });
});
