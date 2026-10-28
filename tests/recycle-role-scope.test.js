import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { extractFunctions, readSource } from './_extract.js';
import * as mp from '../modules/money-privacy.js';
import { formatDateTime } from '../modules/date-format.js';

const SRC = readSource('modules/utilities-payments.js');
const constant = (name) => {
  const m = SRC.match(new RegExp(`export const ${name} = ([\\s\\S]*?);\\n\\n`));
  if (!m) throw new Error(`constant ${name} not found`);
  return new Function(`return ${m[1]};`)();
};

const TOMBS = () => [
  { id: 's1', recordId: 's1', collection: 'sales', deletedAt: Date.now(), snapshot: { customerName: 'ALI TRADERS', totalValue: 5000, date: '2026-10-01', paymentType: 'CREDIT', supplyStore: 'ZUBAIR' } },
  { id: 't1', recordId: 't1', collection: 'transactions', deletedAt: Date.now(), snapshot: { entityName: 'SUPPLIER ONE', amount: 2000, type: 'OUT', date: '2026-10-01' } },
  { id: 'e1', recordId: 'e1', collection: 'expenses', deletedAt: Date.now(), snapshot: { name: 'FUEL', amount: 700, category: 'operating', date: '2026-10-01' } },
  { id: 'p1', recordId: 'p1', collection: 'production', deletedAt: Date.now(), snapshot: { supplyStore: 'ZUBAIR', net: 120, date: '2026-10-01' } },
  { id: 'f1', recordId: 'f1', collection: 'factory', deletedAt: Date.now(), snapshot: { store: 'ZUBAIR', units: 4, date: '2026-10-01' } },
  { id: 'c1', recordId: 'c1', collection: 'customers', deletedAt: Date.now(), snapshot: { name: 'DEBTOR CUSTOMER', previousBalance: 90000 } },
  { id: 'n1', recordId: 'n1', collection: 'entities', deletedAt: Date.now(), snapshot: { name: 'PAYEE ENTITY' } },
  { id: 'd1', recordId: 'd1', collection: 'daily_ledger', deletedAt: Date.now(), snapshot: { name: 'LEDGER ROW', amount: 10 } },
  { id: 'x1', recordId: 'x1', collection: 'unknown', deletedAt: Date.now(), snapshot: { name: 'MYSTERY', amount: 5 } },
];

const textOf = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const AMOUNT_SPAN = /class="u-dd009f5"/;

let els; let notices; let confirms; let hardDeleted;

function env(mode, tabs, tombs = TOMBS()) {
  globalThis.window = { appMode: mode, _assignedUserTabs: tabs, _userRoleAllowedTabs: tabs, setDisplay() {}, notifyBlocking: (...a) => notices.push(a[0]) };
  globalThis.document = { getElementById: (id) => els[id] || null };
  const store = new Map([['deletions', tombs], ['erased', []]]);
  const scope = {
    window: globalThis.window,
    document: globalThis.document,
    sqliteStore: { get: async (k, d) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : d) },
    ensureArray: (v) => (Array.isArray(v) ? v : []),
    _recoveredThisSession: new Set(),
    firebaseDB: null,
    currentUser: null,
    fmtNum: (n) => String(n),
    formatDateTime,
    esc: (s) => String(s),
    getStoreLabel: (s) => s,
    _captureRecordSnapshot: Object.assign(async () => null, {}),
    _safeErr: (e) => e,
    isMoneyRestricted: mp.isMoneyRestricted,
    isRecycleRecordAllowed: mp.isRecycleRecordAllowed,
    recycleAmountText: mp.recycleAmountText,
    recycleFilters: mp.recycleFilters,
    RECYCLE_COLLECTION_TO_TAB: constant('RECYCLE_COLLECTION_TO_TAB'),
    RECYCLE_BIN_COLLECTION_LABELS: constant('RECYCLE_BIN_COLLECTION_LABELS'),
    RECYCLE_TAB_LABELS: constant('RECYCLE_TAB_LABELS'),
    RECYCLE_RECOVERABLE_COLLECTIONS: constant('RECYCLE_RECOVERABLE_COLLECTIONS'),
  };
  const { _recycleDenied } = extractFunctions('modules/utilities-payments.js', ['_recycleDenied'], scope);
  scope._recycleDenied = _recycleDenied;
  const { renderRecycleBin } = extractFunctions('modules/utilities-payments.js', ['renderRecycleBin'], scope);
  return { scope, renderRecycleBin, store };
}

beforeEach(() => {
  els = { recycleBinList: { innerHTML: '' }, recycleBinStats: { textContent: '' }, recycleBinFilter: { value: 'all' }, recycleBinEmptyBtn: { }, recycleBinEmptyBtnLabel: { textContent: '' } };
  notices = []; confirms = []; hardDeleted = [];
});
afterEach(() => { delete globalThis.window; delete globalThis.document; });

describe('renderRecycleBin as a restricted role', () => {
  it('sales role sees only sales records, with no currency', async () => {
    const { renderRecycleBin } = env('userrole', ['sales']);
    await renderRecycleBin('all');
    const html = els.recycleBinList.innerHTML;
    assert.match(html, /ALI TRADERS/);
    for (const hidden of ['SUPPLIER ONE', 'FUEL', 'Production', 'Factory', 'DEBTOR CUSTOMER', 'PAYEE ENTITY', 'LEDGER ROW', 'MYSTERY']) assert.doesNotMatch(html, new RegExp(hidden), hidden);
    assert.doesNotMatch(textOf(html), /₨|5000|5,000/);
    assert.doesNotMatch(html, AMOUNT_SPAN);
    assert.match(els.recycleBinStats.textContent, /^1 deleted record /);
    assert.match(els.recycleBinEmptyBtnLabel.textContent, /\(1\)/);
  });

  it('production role sees batches with kg but no money', async () => {
    const { renderRecycleBin } = env('userrole', ['prod']);
    await renderRecycleBin('all');
    const html = els.recycleBinList.innerHTML;
    assert.match(html, /Production – ZUBAIR/);
    assert.match(textOf(html), /120 kg/);
    assert.match(html, AMOUNT_SPAN);
    assert.doesNotMatch(html, /ALI TRADERS|FUEL|SUPPLIER ONE|Factory – /);
  });

  it('payments role sees transactions and expenses but never an amount', async () => {
    const { renderRecycleBin } = env('userrole', ['payments']);
    await renderRecycleBin('all');
    const html = els.recycleBinList.innerHTML;
    assert.match(html, /SUPPLIER ONE/);
    assert.match(html, /FUEL/);
    assert.doesNotMatch(textOf(html), /₨|2000|2,000|\b700\b/);
    assert.doesNotMatch(html, AMOUNT_SPAN);
    assert.doesNotMatch(html, /ALI TRADERS|PAYEE ENTITY|MYSTERY/);
    assert.match(els.recycleBinStats.textContent, /^2 deleted records /);
  });

  it('a filter for an unassigned tab falls back to the assigned scope', async () => {
    const { renderRecycleBin } = env('userrole', ['sales']);
    await renderRecycleBin('tab_payments');
    const html = els.recycleBinList.innerHTML;
    assert.match(html, /ALI TRADERS/);
    assert.doesNotMatch(html, /SUPPLIER ONE|FUEL/);
  });

  it('multi-tab role sees the union and nothing else', async () => {
    const { renderRecycleBin } = env('userrole', ['prod', 'factory', 'sales', 'payments']);
    await renderRecycleBin('all');
    const html = els.recycleBinList.innerHTML;
    for (const shown of ['ALI TRADERS', 'SUPPLIER ONE', 'FUEL', 'Production – ZUBAIR', 'Factory – ZUBAIR']) assert.match(html, new RegExp(shown), shown);
    for (const hidden of ['DEBTOR CUSTOMER', 'PAYEE ENTITY', 'LEDGER ROW', 'MYSTERY']) assert.doesNotMatch(html, new RegExp(hidden), hidden);
    assert.doesNotMatch(textOf(html), /₨/);
  });

  it('admin still sees everything including amounts', async () => {
    const { renderRecycleBin } = env('admin', []);
    await renderRecycleBin('all');
    const html = els.recycleBinList.innerHTML;
    for (const shown of ['ALI TRADERS', 'SUPPLIER ONE', 'DEBTOR CUSTOMER', 'LEDGER ROW', '₨5000']) assert.match(textOf(html), new RegExp(shown), shown);
    assert.match(els.recycleBinStats.textContent, /^9 deleted records /);
  });
});

describe('recycle actions are refused outside the assigned tabs', () => {
  const grouped = () => {
    const t = TOMBS();
    t[0].groupId = 'g1';
    t[1].groupId = 'g1';
    return t;
  };

  const actionScope = (scope, deletions) => ({
    ...scope,
    findGroupMembers: (tomb, all) => (tomb.groupId ? all.filter((x) => x.groupId === tomb.groupId) : [tomb]),
    expandGroups: (recs, all) => { const ids = new Set(recs.map((r) => r.groupId).filter(Boolean)); return all.filter((x) => recs.some((r) => r.id === x.id) || (x.groupId && ids.has(x.groupId))); },
    showGlassConfirm: async (m) => { confirms.push(m); return false; },
    hardDeleteRecord: async (id) => { hardDeleted.push(id); return true; },
    recoverRecord: async () => true,
    showToast() {},
    sqliteStore: { get: async (k) => (k === 'deletions' ? deletions : []) },
  });

  it('delete forever on a group that includes another tab never reaches the confirm', async () => {
    const { scope } = env('userrole', ['sales'], grouped());
    const { _attemptHardDeleteImpl } = extractFunctions('modules/utilities-payments.js', ['_attemptHardDeleteImpl'], actionScope(scope, grouped()));
    await _attemptHardDeleteImpl('s1', 'sales');
    assert.equal(confirms.length, 0);
    assert.equal(hardDeleted.length, 0);
    assert.equal(notices.length, 1);
    assert.match(notices[0], /outside your assigned tabs/);
  });

  it('the same delete reaches the confirm when both tabs are assigned', async () => {
    const { scope } = env('userrole', ['sales', 'payments'], grouped());
    const { _attemptHardDeleteImpl } = extractFunctions('modules/utilities-payments.js', ['_attemptHardDeleteImpl'], actionScope(scope, grouped()));
    await _attemptHardDeleteImpl('s1', 'sales');
    assert.equal(confirms.length, 1);
    assert.equal(notices.length, 0);
  });

  it('a direct call for an unassigned collection is refused before any work', async () => {
    const { scope } = env('userrole', ['sales']);
    const fns = extractFunctions('modules/utilities-payments.js', ['hardDeleteRecord', 'recoverRecord'], scope);
    assert.equal(await fns.hardDeleteRecord('t1', 'transactions'), false);
    assert.equal(await fns.recoverRecord('t1', 'transactions'), false);
    assert.equal(await fns.hardDeleteRecord('e1', 'entities'), false);
  });

  it('empty bin refuses when expanding groups pulls in another tab', async () => {
    const { scope } = env('userrole', ['sales'], grouped());
    const { _emptyRecycleBinImpl } = extractFunctions('modules/utilities-payments.js', ['_emptyRecycleBinImpl'], actionScope(scope, grouped()));
    scope.window._recycleBinCurrentFiltered = [grouped()[0]];
    scope.window._recycleBinCurrentFilterKey = 'all';
    await _emptyRecycleBinImpl();
    assert.equal(confirms.length, 0);
    assert.equal(notices.length, 1);
  });
});
