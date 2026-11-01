import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractFunctions, readSource } from './_extract.js';

function makeStore(initial = {}) {
  const data = { ...initial };
  const calls = { get: [], set: [] };
  return {
    data,
    calls,
    async get(name, fallback) {
      calls.get.push(name);
      return name in data ? data[name] : fallback;
    },
    async set(name, value) {
      calls.set.push(name);
      data[name] = value;
    },
  };
}

const ensureArray = v => (Array.isArray(v) ? v : []);
const isUuid = v => typeof v === 'string' && v.startsWith('id-');
const isTs = v => typeof v === 'number' && v > 0;

function businessHelpers(store, extra = {}) {
  return extractFunctions('modules/business.js', ['formatTime12', 'readNum', 'loadCollections', 'repairStoredRecords'], {
    sqliteStore: store,
    ensureArray,
    validateUUID: isUuid,
    validateTimestamp: isTs,
    ensureRecordIntegrity: r => ({ ...r, id: r.id || 'id-fixed', createdAt: r.createdAt || 1, updatedAt: r.updatedAt || 1, repaired: true }),
    document: { getElementById: () => null },
    ...extra,
  });
}

describe('formatTime12', () => {
  const { formatTime12 } = businessHelpers(makeStore());
  it('formats midnight and noon as 12-hour clock', () => {
    assert.equal(formatTime12(new Date(2026, 0, 1, 0, 5, 9)), '12:05:09 AM');
    assert.equal(formatTime12(new Date(2026, 0, 1, 12, 0, 0)), '12:00:00 PM');
  });
  it('zero-pads and switches to PM after noon', () => {
    assert.equal(formatTime12(new Date(2026, 0, 1, 9, 3, 7)), '09:03:07 AM');
    assert.equal(formatTime12(new Date(2026, 0, 1, 23, 59, 59)), '11:59:59 PM');
    assert.equal(formatTime12(new Date(2026, 0, 1, 13, 0, 0)), '01:00:00 PM');
  });
  it('defaults to the current time', () => {
    assert.match(formatTime12(), /^\d{2}:\d{2}:\d{2} (AM|PM)$/);
  });
});

describe('readNum', () => {
  const field = value => ({ getElementById: id => (id === 'x' ? { value } : null) });
  it('parses numeric input', () => {
    const { readNum } = businessHelpers(makeStore(), { document: field('12.5') });
    assert.equal(readNum('x'), 12.5);
  });
  it('treats blank or invalid input as zero', () => {
    assert.equal(businessHelpers(makeStore(), { document: field('') }).readNum('x'), 0);
    assert.equal(businessHelpers(makeStore(), { document: field('abc') }).readNum('x'), 0);
  });
  it('throws on a missing element, as the inline code did', () => {
    const { readNum } = businessHelpers(makeStore(), { document: field('1') });
    assert.throws(() => readNum('missing'));
  });
});

describe('loadCollections', () => {
  it('returns each named collection as an array, in the order requested', async () => {
    const store = makeStore({ sales: [{ id: 1 }], rep: 'not-an-array' });
    const { loadCollections } = businessHelpers(store);
    const out = await loadCollections('sales', 'rep', 'missing');
    assert.deepEqual(out, { sales: [{ id: 1 }], rep: [], missing: [] });
    assert.deepEqual(store.calls.get, ['sales', 'rep', 'missing']);
  });
  it('reads nothing when no names are given', async () => {
    const store = makeStore();
    const { loadCollections } = businessHelpers(store);
    assert.deepEqual(await loadCollections(), {});
    assert.deepEqual(store.calls.get, []);
  });
});

describe('repairStoredRecords', () => {
  const good = { id: 'id-1', createdAt: 5, updatedAt: 6 };
  it('leaves valid records alone and does not write', async () => {
    const store = makeStore();
    const { repairStoredRecords } = businessHelpers(store);
    const out = await repairStoredRecords('sales', [good]);
    assert.deepEqual(out, [good]);
    assert.deepEqual(store.calls.set, []);
  });
  it('repairs records missing an id or timestamps and persists the repaired set', async () => {
    const store = makeStore();
    const { repairStoredRecords } = businessHelpers(store);
    const bad = { createdAt: 5, updatedAt: 6 };
    const out = await repairStoredRecords('sales', [good, bad]);
    assert.equal(out[0], good);
    assert.equal(out[1].repaired, true);
    assert.equal(out[1].id, 'id-fixed');
    assert.deepEqual(store.calls.set, ['sales']);
    assert.equal(store.data.sales, out);
  });
  it('treats an invalid timestamp as needing repair', async () => {
    const store = makeStore();
    const { repairStoredRecords } = businessHelpers(store);
    const out = await repairStoredRecords('rep', [{ id: 'id-2', createdAt: 5, updatedAt: -1 }]);
    assert.equal(out[0].repaired, true);
  });
  it('returns non-arrays and empty arrays untouched', async () => {
    const store = makeStore();
    const { repairStoredRecords } = businessHelpers(store);
    const empty = [];
    assert.equal(await repairStoredRecords('x', empty), empty);
    assert.equal(await repairStoredRecords('x', null), null);
    assert.deepEqual(store.calls.set, []);
  });
});

describe('rangeCutoffDate', () => {
  const { rangeCutoffDate } = extractFunctions('modules/utilities-core.js', ['rangeCutoffDate']);
  const today = new Date(2026, 2, 31);
  it('today returns the same day', () => {
    assert.equal(rangeCutoffDate('today', today), today);
  });
  it('week is seven days back', () => {
    assert.deepEqual(rangeCutoffDate('week', today), new Date(2026, 2, 24));
  });
  it('month is one calendar month back', () => {
    assert.deepEqual(rangeCutoffDate('month', new Date(2026, 4, 15)), new Date(2026, 3, 15));
  });
  it('year is one calendar year back', () => {
    assert.deepEqual(rangeCutoffDate('year', today), new Date(2025, 2, 31));
  });
  it('all and unknown ranges have no cutoff', () => {
    assert.equal(rangeCutoffDate('all', today), null);
    assert.equal(rangeCutoffDate('bogus', today), null);
  });
  it('never mutates the date it was given', () => {
    const d = new Date(2026, 5, 10);
    rangeCutoffDate('week', d);
    rangeCutoffDate('month', d);
    rangeCutoffDate('year', d);
    assert.deepEqual(d, new Date(2026, 5, 10));
  });
});

describe('styleStatementRow', () => {
  const { styleStatementRow } = extractFunctions('modules/utilities-core.js', ['styleStatementRow']);
  const cell = (index, text, rowIndex = 1) => ({ row: { index: rowIndex }, column: { index }, cell: { text: [text], styles: {} } });
  it('highlights the opening row only when there is a prior balance', () => {
    const withPrior = cell(1, 'CASH', 0);
    styleStatementRow(withPrior, true);
    assert.deepEqual(withPrior.cell.styles.fillColor, [220, 235, 255]);
    assert.equal(withPrior.cell.styles.fontStyle, 'bold');
    const without = cell(1, 'CASH', 0);
    styleStatementRow(without, false);
    assert.equal(without.cell.styles.fillColor, undefined);
    assert.deepEqual(without.cell.styles.textColor, [40, 167, 69]);
  });
  it('colours the type column by transaction type', () => {
    const colour = t => { const c = cell(1, t); styleStatementRow(c, false); return c.cell.styles.textColor; };
    assert.deepEqual(colour('CASH'), [40, 167, 69]);
    assert.deepEqual(colour('CREDIT'), [200, 100, 0]);
    assert.deepEqual(colour('COLLECTION'), [40, 167, 69]);
    assert.deepEqual(colour('PARTIAL'), [200, 100, 0]);
    assert.deepEqual(colour('OLD DEBT'), [220, 53, 69]);
  });
  it('colours the balance column', () => {
    const colour = t => { const c = cell(5, t); styleStatementRow(c, false); return c.cell.styles.textColor; };
    assert.deepEqual(colour('SETTLED'), [100, 100, 100]);
    assert.deepEqual(colour('OVERPAID Rs 5'), [40, 167, 69]);
    assert.deepEqual(colour('Rs 5'), [220, 53, 69]);
  });
  it('leaves other columns unstyled', () => {
    const c = cell(3, 'Rs 5');
    styleStatementRow(c, false);
    assert.deepEqual(c.cell.styles, {});
  });
});

describe('year-close merge helpers', () => {
  const fns = extractFunctions('modules/admin-data.js', ['_classifyMergeItem', '_sumMergeBucket', '_bucketBalances', '_mergedSettlementFields']);
  const bucket = () => ({ sales: [], oldDebt: 0, collectionTotal: 0, partialPaymentTotal: 0, partialPaymentsBySale: {} });

  it('classifies partial payments, collections, old debt and ordinary sales', () => {
    const b = bucket();
    fns._classifyMergeItem(b, { paymentType: 'PARTIAL_PAYMENT', totalValue: 40, relatedSaleId: 's1', customerName: 'Ali' }, 'Ali');
    fns._classifyMergeItem(b, { paymentType: 'PARTIAL_PAYMENT', totalValue: 10, linkedSaleId: 's1' }, 'Ali');
    fns._classifyMergeItem(b, { paymentType: 'COLLECTION', totalValue: 25 }, 'Ali');
    fns._classifyMergeItem(b, { transactionType: 'OLD_DEBT', totalValue: 100, partialPaymentReceived: 30 }, 'Ali');
    fns._classifyMergeItem(b, { transactionType: 'OLD_DEBT', totalValue: 10, partialPaymentReceived: 30 }, 'Ali');
    const sale = { paymentType: 'CASH', totalValue: 5 };
    fns._classifyMergeItem(b, sale, 'Ali');
    assert.equal(b.partialPaymentTotal, 50);
    assert.deepEqual(b.partialPaymentsBySale, { s1: 50 });
    assert.deepEqual(b.partialPaymentCustomers, { s1: 'Ali' });
    assert.equal(b.collectionTotal, 25);
    assert.equal(b.oldDebt, 70);
    assert.deepEqual(b.sales, [sale]);
  });

  it('totals cash, credit and profit buckets', () => {
    const t = fns._sumMergeBucket([
      { paymentType: 'CASH', quantity: 2, totalValue: 100, totalCost: 60, profit: 40 },
      { paymentType: 'CREDIT', creditReceived: true, quantity: 1, totalValue: 50, totalCost: 30, profit: 20 },
      { paymentType: 'CREDIT', quantity: 3, totalValue: 200, totalCost: 120, profit: 80, partialPaymentReceived: 50 },
    ]);
    assert.deepEqual(t, { totalQty: 6, totalValue: 350, totalCost: 210, totalProfit: 140, realizedProfit: 60, unrealizedProfit: 80, cashValue: 150, unpaidCreditNet: 150 });
  });

  it('totals an empty bucket to zero', () => {
    assert.deepEqual(fns._sumMergeBucket([]), { totalQty: 0, totalValue: 0, totalCost: 0, totalProfit: 0, realizedProfit: 0, unrealizedProfit: 0, cashValue: 0, unpaidCreditNet: 0 });
  });

  it('works out outstanding, advance credit and settled state', () => {
    assert.deepEqual(fns._bucketBalances(150, 20, 100), { grossOutstanding: 170, netOutstanding: 70, advanceCredit: 0, isSettled: false });
    assert.deepEqual(fns._bucketBalances(50, 0, 80), { grossOutstanding: 50, netOutstanding: 0, advanceCredit: 30, isSettled: true });
  });

  it('builds the merged record fields for a settled and an unsettled customer', () => {
    const base = { nowISODate: '2026-01-01', oldDebt: 0, sales: [{}], recordCount: 1, b: { partialPaymentTotal: 5, partialPaymentsBySale: { s: 5 } }, cashValue: 10, unpaidCreditNet: 0, collectionTotal: 0, advanceCredit: 0, realizedProfit: 1, unrealizedProfit: 0, grossOutstanding: 0, allDates: ['2025-02-01', '2025-09-09'], originalRecordIds: ['a'] };
    const settled = fns._mergedSettlementFields({ ...base, isSettled: true, netOutstanding: 0, alreadyPaid: 10 });
    assert.equal(settled.paymentType, 'CASH');
    assert.equal(settled.creditReceived, true);
    assert.equal(settled.creditReceivedDate, '2026-01-01');
    assert.equal(settled.creditValue, 0);
    assert.equal(settled.partialPaymentReceived, 0);
    assert.equal(settled.balancePaid, 10);
    assert.deepEqual(settled.mergedSummary.dateRange, { from: '2025-02-01', to: '2025-09-09' });
    assert.equal(settled.mergedSummary.partialPayments, 5);
    const open = fns._mergedSettlementFields({ ...base, isSettled: false, netOutstanding: 70, alreadyPaid: 30, oldDebt: 5, sales: [] });
    assert.equal(open.paymentType, 'CREDIT');
    assert.equal(open.transactionType, 'OLD_DEBT');
    assert.equal(open.creditValue, 70);
    assert.equal(open.partialPaymentReceived, 30);
    assert.equal(open.creditReceivedDate, null);
  });

  it('falls back to today for the date range when there are no dated sales', () => {
    const r = fns._mergedSettlementFields({ nowISODate: '2026-01-01', isSettled: true, netOutstanding: 0, alreadyPaid: 0, oldDebt: 0, sales: [], recordCount: 0, b: {}, cashValue: 0, unpaidCreditNet: 0, collectionTotal: 0, advanceCredit: 0, realizedProfit: 0, unrealizedProfit: 0, grossOutstanding: 0, allDates: [], originalRecordIds: [] });
    assert.deepEqual(r.mergedSummary.dateRange, { from: '2026-01-01', to: '2026-01-01' });
    assert.equal(r.mergedSummary.partialPayments, 0);
    assert.deepEqual(r.mergedSummary.partialPaymentsBySale, {});
  });
});

describe('fetchLocationInto', () => {
  function run(ids) {
    const els = {};
    const get = id => (els[id] ||= { id, style: {}, textContent: '', innerHTML: '', placeholder: '', disabled: false });
    const button = { disabled: false };
    const queries = [];
    const win = { setStyle: (el, prop, cls) => { el.style[prop] = cls; } };
    const { fetchLocationInto } = extractFunctions('modules/customers.js', ['fetchLocationInto'], {
      document: { getElementById: get, querySelector: q => { queries.push(q); return button; } },
      navigator: {},
      window: win,
    });
    return fetchLocationInto(...ids).then(() => ({ els, button, queries }));
  }
  it('reports missing GPS support on the status element it was given', async () => {
    const { els, queries } = await run(['rep-location-status', 'rep-edit-cust-address', 'fetchRepDeviceLocation']);
    assert.equal(els['rep-location-status'].textContent, 'GPS not supported on this device.');
    assert.deepEqual(queries, ['button[onclick="fetchRepDeviceLocation()"]']);
  });
  it('is the single implementation behind both location buttons', () => {
    const customers = readSource('modules/customers.js');
    const rep = readSource('modules/rep-sales.js');
    assert.match(customers, /fetchLocationInto\('location-status', 'edit-cust-address', 'fetchDeviceLocation'\)/);
    assert.match(rep, /fetchLocationInto\('rep-location-status', 'rep-edit-cust-address', 'fetchRepDeviceLocation'\)/);
    assert.equal((customers.match(/navigator\.geolocation\.watchPosition/g) || []).length, 1);
    assert.equal((rep.match(/navigator\.geolocation\.watchPosition/g) || []).length, 0);
  });
});
