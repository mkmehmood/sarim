import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { importParties, directionOfPayment, directionOfSale, isCashMode, isBankMode, isDefaultMode, isHomeExpense, parseAmount, normalizeRows, buildStatement, computeSummary, filterRows, buildLists, suggest, buildEntry, savedMessage, voucherText, auditText, defaultCategory, sortNewestFirst } from '../modules/ledger-core.js';
const fmt = (n) => String(n);
const row = (o) => ({ id: o.id, type: 'IN', amount: 0, mode: 'Cash', toMode: '', category: '', scope: '', party: '', note: '', ref: '', date: '2026-01-01', timestamp: 1, ...o });
describe('payment mode classification matches the reference', () => {
  it('cash and bank aliases', () => {
    assert.ok(isCashMode(' Petty Cash '));
    assert.ok(isBankMode('Cheque'));
    assert.ok(isBankMode('bank_transfer'));
    assert.equal(isDefaultMode('Easypaisa'), false);
    assert.equal(isBankMode('Online Transfer'), false);
    assert.ok(isBankMode('HBL Bank'));
    assert.ok(isBankMode('MEEZAN BANK'));
    assert.ok(isBankMode('bank alfalah'));
    assert.equal(isDefaultMode('Faysal Bank'), true);
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

it('buildPartyPool merges sales customers, payment entities and ledger parties without duplicates', async () => {
  const { buildPartyPool, flowLabel } = await import('../modules/ledger-core.js');
  const pool = buildPartyPool({
    ledgerParties: ['ali store', 'Recent Only'],
    customers: [{ name: 'Ali Store' }, { name: 'Bilal' }],
    sales: [{ customerName: 'Chaudhry' }, { customerName: 'bilal' }],
    entities: [{ name: 'Zubair', isSupplier: true }, { name: 'Payor Co', type: 'payor' }, { name: 'Rent', isExpenseEntity: true }]
  });
  const byName = Object.fromEntries(pool.map((p) => [p.value, p.tag]));
  assert.equal(byName['Zubair'], 'Vendor');
  assert.equal(byName['Payor Co'], 'Entity');
  assert.equal(byName['Ali Store'], 'Customer');
  assert.equal(byName['Chaudhry'], 'Customer');
  assert.equal(byName['Recent Only'], 'Recent');
  assert.equal(byName['Rent'], undefined);
  assert.equal(pool.filter((p) => p.value.toLowerCase() === 'bilal').length, 1);
  assert.match(flowLabel('IN'), /Cash In/);
  assert.match(flowLabel('OUT'), /Cash Out/);
});

import { isTabEntry, tabEntryNotice, mirrorLedgerEntry, resolveLedgerTarget, linkedDrift, missingLinks, linkedDescription } from '../modules/ledger-core.js';
import { test as t2 } from 'node:test';
import assert2 from 'node:assert/strict';

t2('resolveLedgerTarget routes party to entity, customer or operating expense', () => {
  const entities = [{ id: 'e1', name: 'Ali Traders' }, { id: 'e2', name: 'Rent', isExpenseEntity: true }, { id: 'e3', name: 'Both Co' }];
  const customers = [{ name: 'Bilal Store' }, { name: 'Both Co' }];
  const base = { entities, customers, sales: [{ customerName: 'Old Cust' }] };
  assert2.equal(resolveLedgerTarget({ ...base, type: 'OUT', party: 'ali traders' }).kind, 'entity');
  assert2.equal(resolveLedgerTarget({ ...base, type: 'IN', party: 'Bilal Store' }).customer, 'Bilal Store');
  assert2.equal(resolveLedgerTarget({ ...base, type: 'IN', party: 'old cust' }).kind, 'customer');
  assert2.equal(resolveLedgerTarget({ ...base, type: 'IN', party: 'Both Co' }).kind, 'both');
  const exp = { ...base, expenseCategories: ['Rent', 'Electricity'] };
  assert2.equal(resolveLedgerTarget({ ...exp, type: 'OUT', party: '', category: 'rent', scope: 'BUSINESS' }).name, 'Rent');
  assert2.equal(resolveLedgerTarget({ ...exp, type: 'OUT', party: '', category: 'Tea', scope: 'BUSINESS' }).kind, 'none');
  assert2.equal(resolveLedgerTarget({ ...exp, type: 'OUT', party: 'Unknown Person', category: 'Rent', scope: 'BUSINESS' }).kind, 'none');
  assert2.equal(resolveLedgerTarget({ ...base, type: 'OUT', party: '', scope: 'HOME' }).kind, 'none');
  assert2.equal(resolveLedgerTarget({ ...base, type: 'IN', party: 'Nobody' }).kind, 'none');
  assert2.equal(resolveLedgerTarget({ ...base, type: 'TRANSFER', party: 'Ali Traders' }).kind, 'none');
});

t2('linkedDrift and missingLinks mirror edits and deletes from other tabs', () => {
  const rows = [
    { id: 'l1', amount: 100, date: '2026-01-01', link: { kind: 'entity', txId: 't1' } },
    { id: 'l2', amount: 50, date: '2026-01-01', link: { kind: 'customer', saleId: 's1' } },
    { id: 'l3', amount: 70, date: '2026-01-01' }
  ];
  const drift = linkedDrift(rows, { transactions: [{ id: 't1', amount: 120, date: '2026-01-02' }], sales: [{ id: 's1', totalValue: 0, collectedAmount: 50, date: '2026-01-01' }] });
  assert2.deepEqual(drift, [{ id: 'l1', amount: 120, date: '2026-01-02' }]);
  assert2.deepEqual(missingLinks(rows, new Set(['s1'])).map((r) => r.id), ['l2']);
  assert2.equal(linkedDescription({ type: 'IN', category: 'Sales', note: '', ref: 'B1', party: 'X' }), 'Ref B1');
});

describe('sales customers and payment entities import into the ledger party list', () => {
  const sales = [
    { customerName: 'Ali Store', currentRepProfile: 'admin', paymentType: 'CASH' },
    { customerName: 'Rep Only Shop', currentRepProfile: 'rep1', paymentType: 'CASH' },
    { customerName: 'Paid Out Man', currentRepProfile: 'admin', isMoneyOut: true, paymentType: 'MONEY_OUT' }
  ];
  const customers = [{ name: 'ali store' }, { name: 'Bilal Traders' }];
  const entities = [
    { id: 'e1', name: 'Raw Supplier', type: 'payee' },
    { id: 'e2', name: 'Cash Payer', type: 'payor' },
    { id: 'e3', name: 'Untyped In', type: '' },
    { id: 'e4', name: 'Electricity', type: 'payee', isExpenseEntity: true }
  ];
  const transactions = [{ entityId: 'e3', type: 'IN' }];
  it('customers are money in, payees are money out, expense entities are skipped', () => {
    const list = importParties({ sales, customers, entities, transactions });
    const by = (n) => list.find((p) => p.value === n);
    assert.equal(by('Ali Store').dir, 'IN');
    assert.equal(by('Bilal Traders').source, 'customer');
    assert.equal(by('Raw Supplier').dir, 'OUT');
    assert.equal(by('Raw Supplier').tag, 'Vendor \u2022 Money Out');
    assert.equal(by('Cash Payer').dir, 'IN');
    assert.equal(by('Untyped In').dir, 'IN');
    assert.ok(!by('Electricity'));
    assert.ok(!by('Rep Only Shop'));
    assert.ok(!by('Paid Out Man'));
    assert.equal(list.filter((p) => p.value.toLowerCase() === 'ali store').length, 1);
  });
  it('a name seen with opposite directions has no forced direction', () => {
    const list = importParties({ customers: [{ name: 'Zed' }], entities: [{ id: 'z', name: 'zed', type: 'payee' }] });
    assert.equal(list[0].dir, '');
    assert.equal(list[0].tag, 'Customer');
  });
  it('previous ledger parties come first and keep their last direction', () => {
    const rows = normalizeRows([{ id: 1, type: 'OUT', amount: 5, party: 'Old Vendor', date: '2026-02-01' }]);
    const list = importParties({ customers: [{ name: 'Bilal' }], ledgerRows: rows });
    assert.equal(list[0].value, 'Old Vendor');
    assert.equal(list[0].dir, 'OUT');
  });
  it('payment and sale directions follow money movement', () => {
    assert.equal(directionOfPayment({ type: 'IN' }), 'IN');
    assert.equal(directionOfPayment({ type: 'OUT' }), 'OUT');
    assert.equal(directionOfSale({ paymentType: 'CASH' }), 'IN');
    assert.equal(directionOfSale({ paymentType: 'MONEY_OUT', isMoneyOut: true }), 'OUT');
  });
});

t2('mirrorLedgerEntry turns Sales and Payments records into linked ledger rows', () => {
  const base = { amount: 250, date: '2026-02-03', name: 'Bilal Store', id: 'dl_1', now: 5 };
  const coll = mirrorLedgerEntry({ ...base, source: 'collection', link: { saleId: 's1' } });
  assert2.deepEqual([coll.type, coll.category, coll.party, coll.link], ['IN', 'Customer Payment', 'Bilal Store', { kind: 'customer', name: 'Bilal Store', saleId: 's1', origin: 'tab' }]);
  const out = mirrorLedgerEntry({ ...base, source: 'moneyOut', link: { saleId: 's2' } });
  assert2.deepEqual([out.type, out.scope], ['OUT', 'BUSINESS']);
  const pin = mirrorLedgerEntry({ ...base, source: 'paymentIn', link: { entityId: 'e1', txId: 't1' } });
  assert2.deepEqual([pin.type, pin.link.kind, pin.link.txId], ['IN', 'entity', 't1']);
  assert2.equal(mirrorLedgerEntry({ ...base, amount: 0, source: 'paymentOut' }), null);
});

t2('calculator entries mirror as cash in, expense out and commission out, linked to the calc record', () => {
  const base = { date: '2026-03-01', name: 'Rep A', id: 'dl_9', now: 1, link: { calcId: 'c1' } };
  const cash = mirrorLedgerEntry({ ...base, source: 'calcCash', amount: 900 });
  const exp = mirrorLedgerEntry({ ...base, source: 'calcExpense', amount: 120 });
  const com = mirrorLedgerEntry({ ...base, source: 'calcCommission', amount: 60 });
  assert2.deepEqual([cash.type, exp.type, com.type], ['IN', 'OUT', 'OUT']);
  assert2.deepEqual([cash.category, exp.category, com.category], ['Sales', 'Field Expenses', 'Sales Commission']);
  assert2.deepEqual(cash.link, { kind: 'calc', name: 'Rep A', calcId: 'c1', origin: 'tab', part: 'cash' });
  assert2.equal(mirrorLedgerEntry({ ...base, source: 'calcExpense', amount: 0 }), null);
  assert2.deepEqual(missingLinks([cash], new Set(['c1'])).map((r) => r.id), ['dl_9']);
});

t2('tab-origin ledger entries are locked and follow their parent record', () => {
  const sale = mirrorLedgerEntry({ source: 'collection', amount: 100, date: '2026-04-01', name: 'Ali', id: 'dl_a', now: 1, link: { saleId: 's1' } });
  const own = { id: 'dl_b', amount: 5, link: { kind: 'entity', txId: 't1' } };
  assert2.equal(isTabEntry(sale), true);
  assert2.equal(isTabEntry(own), false);
  assert2.equal(isTabEntry({ id: 'x' }), false);
  assert2.match(tabEntryNotice(sale), /Sales tab/);
  const cash = mirrorLedgerEntry({ source: 'calcCash', amount: 900, date: '2026-04-01', name: 'Rep', id: 'dl_c', now: 1, link: { calcId: 'c1' } });
  const com = mirrorLedgerEntry({ source: 'calcCommission', amount: 60, date: '2026-04-01', name: 'Rep', id: 'dl_d', now: 1, link: { calcId: 'c1' } });
  const calculator = [{ id: 'c1', received: 950, fieldExpenses: 0, commissionPaid: 0, date: '2026-04-02', seller: 'Rep B' }];
  const drift = linkedDrift([cash, com], { calculator });
  assert2.deepEqual(drift, [{ id: 'dl_c', amount: 950, date: '2026-04-02', party: 'Rep B' }, { id: 'dl_d', remove: true }]);
});

t2('a cash sale mirrors as Cash In linked to the sale and follows later edits and deletes', async () => {
  const row = mirrorLedgerEntry({ source: 'cashSale', amount: 1800, date: '2026-04-01', name: 'Ali Store', id: 'dl_cs', now: 3, link: { saleId: 'sale1' } });
  assert2.deepEqual([row.type, row.category, row.mode, row.party], ['IN', 'Sales', 'Cash', 'Ali Store']);
  assert2.deepEqual(row.link, { kind: 'customer', name: 'Ali Store', saleId: 'sale1', origin: 'tab', part: 'sale' });
  assert2.ok(isTabEntry(row));
  assert2.deepEqual(linkedDrift([row], { sales: [{ id: 'sale1', totalValue: 2000, date: '2026-04-01' }] }), [{ id: 'dl_cs', amount: 2000 }]);
  assert2.deepEqual(missingLinks([row], new Set(['sale1'])).map((r) => r.id), ['dl_cs']);
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const sales = readFileSync(new URL('../modules/utilities-sales.js', import.meta.url), 'utf8');
  assert2.match(html, /id="saleAddToLedger"/);
  assert2.match(sales, /isLedgerChecked\('saleAddToLedger'\)/);
  assert2.match(sales, /source: 'cashSale'/);
  assert2.match(sales, /paymentType === 'CASH' && totalValue > 0 && \(isLedgerChecked/);
});

t2('linked ledger rows follow renames and cash-to-credit changes made in the other tabs', () => {
  const sale = mirrorLedgerEntry({ source: 'cashSale', amount: 500, date: '2026-05-01', name: 'Ali', id: 'dl_a', now: 1, link: { saleId: 's9' } });
  const coll = mirrorLedgerEntry({ source: 'collection', amount: 70, date: '2026-05-01', name: 'Ali', id: 'dl_b', now: 1, link: { saleId: 's8' } });
  const pay = mirrorLedgerEntry({ source: 'paymentOut', amount: 90, date: '2026-05-01', name: 'Old Vendor', id: 'dl_c', now: 1, link: { entityId: 'e1', txId: 't1' } });
  const cols = {
    sales: [{ id: 's9', totalValue: 500, date: '2026-05-01', paymentType: 'CASH', customerName: 'Ali Khan' }, { id: 's8', collectedAmount: 70, date: '2026-05-01', paymentType: 'COLLECTION', customerName: 'Ali' }],
    transactions: [{ id: 't1', entityId: 'e1', amount: 90, date: '2026-05-01', entityName: 'Old Vendor' }],
    entities: [{ id: 'e1', name: 'New Vendor' }]
  };
  const byId = Object.fromEntries(linkedDrift([sale, coll, pay], cols).map((d) => [d.id, d]));
  assert2.deepEqual(byId.dl_a, { id: 'dl_a', party: 'Ali Khan' });
  assert2.equal(byId.dl_b, undefined);
  assert2.deepEqual(byId.dl_c, { id: 'dl_c', party: 'New Vendor' });
  const toCredit = linkedDrift([sale], { sales: [{ id: 's9', totalValue: 500, date: '2026-05-01', paymentType: 'CREDIT', customerName: 'Ali' }] });
  assert2.deepEqual(toCredit, [{ id: 'dl_a', remove: true }]);
});
