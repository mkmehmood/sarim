import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractFunctions } from './_extract.js';
import {
  GATED_COLLECTIONS, buildPendingDoc, bulkSheetModel, groupBySubmitter, groupPending, groupRowSummary,
  isGatedCollection, pendingId, pendingSummaryLine, resolutionNotice, sheetModel, summarizePending,
} from '../modules/approvals-core.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const fmt = (n) => 'Rs ' + n;
const who = { uid: 'u1', name: 'Sam', email: 's@x.com' };
const mk = (over = {}) => buildPendingDoc({ collection: 'rep', docId: 'abc12345-x', action: 'set', data: { customerName: 'Zed', totalValue: 500 }, who, now: 1, isEdit: false, ...over });

describe('pending documents', () => {
  it('has a stable id per record so repeat edits replace each other', () => {
    assert.equal(pendingId('rep', 'a/b'), 'rep__a_b');
    assert.equal(mk().id, 'rep__abc12345-x');
  });
  it('records who submitted it and starts pending', () => {
    const p = mk();
    assert.equal(p.status, 'pending');
    assert.deepEqual(p.submittedBy, who);
    assert.equal(p.action, 'set');
  });
  it('a delete carries no data', () => assert.equal(mk({ action: 'delete', data: { a: 1 } }).data, null));
  it('only the 12 data collections are gated; config is not', () => {
    assert.equal(GATED_COLLECTIONS.length, 12);
    assert.equal(isGatedCollection('sales'), true);
    for (const c of ['settings', 'formulas', 'stores', 'photos', 'deletions', 'pending']) assert.equal(isGatedCollection(c), false);
  });
});

const CTX = { fmt, num: (n) => String(Number(n) || 0), store: (c) => 'Store ' + c, when: (d, t) => [d, t].filter(Boolean).join(' @ ') };
const sale = (over = {}) => mk({ docId: 's1', data: { date: '29 OCT 2026', time: '10:32:00 AM', customerName: 'ASAAN', paymentType: 'CREDIT', quantity: 55.8, unitPrice: 310, totalValue: 17298, supplyStore: 'ZUBAIR', salesRep: 'NONE' }, ...over });
const mat = (id, name, qty) => buildPendingDoc({ collection: 'inventory', docId: id, action: 'set', data: { name, quantity: qty, cost: 10, totalPayable: qty * 10 }, who, now: 1 });
const factory = (ids) => buildPendingDoc({ collection: 'factory', docId: 'f1', action: 'set', who, now: 1,
  data: { date: '31 OCT 2026', time: '09:11 PM', units: 40, formulaName: 'Formula A', totalCost: 5000, store: 'ZUBAIR', materialsUsed: ids.map(([id, name, quantity]) => ({ id, name, quantity })) } });

describe('the approval sheet shows the complete details, like the transaction sheet', () => {
  it('a credit sale reads like the history sheet', () => {
    const m = sheetModel({ id: 'x', main: sale(), children: [] }, CTX);
    assert.equal(m.title, 'Credit sale');
    assert.equal(m.amount, 'Rs 17298');
    assert.deepEqual(m.lines, ['29 OCT 2026 @ 10:32:00 AM', 'ASAAN', '55.8 kg @ Rs 310 = Rs 17298', 'Supply: Store ZUBAIR']);
    assert.equal(m.submittedLine, 'New entry from Sam');
    assert.match(m.note, /adds it to the shared records/);
  });
  it('edits and deletions are labelled and explained', () => {
    assert.equal(sheetModel({ id: 'x', main: sale({ isEdit: true }), children: [] }, CTX).submittedLine, 'Change from Sam');
    const del = sheetModel({ id: 'x', main: { ...mk({ action: 'delete', docId: 'q1' }), _cloud: { paymentType: 'CASH', customerName: 'Zed', quantity: 2, totalValue: 20 } }, children: [] }, CTX);
    assert.equal(del.title, 'Delete Cash sale');
    assert.match(del.note, /removes this record for everyone/);
    assert.ok(del.lines.includes('Zed'));
  });
  it('a delete with no copy of the record still says what it is', () => {
    const m = sheetModel({ id: 'x', main: mk({ action: 'delete', docId: 'abcdef123456' }), children: [] }, CTX);
    assert.deepEqual(m.lines, ['Record abcdef12']);
  });
  it('collections, payments and expenses have their own wording', () => {
    assert.equal(sheetModel({ main: mk({ data: { paymentType: 'COLLECTION', collectedAmount: 99, customerName: 'Z' } }), children: [] }, CTX).amount, 'Rs 99');
    assert.equal(sheetModel({ main: mk({ collection: 'transactions', data: { type: 'IN', entityName: 'E', amount: 7 } }), children: [] }, CTX).title, 'Payment received');
    assert.equal(sheetModel({ main: mk({ collection: 'expenses', data: { name: 'Fuel', amount: 5, category: 'Travel' } }), children: [] }, CTX).lines.at(-1), 'Category: Travel');
  });
});

describe('a factory production is one item that lists its materials', () => {
  const m1 = mat('m1', 'KHAKA 01', 12.5);
  const m2 = mat('m2', 'CHORA', 3);
  const other = mat('m9', 'UNRELATED', 1);
  const f = factory([['m1', 'KHAKA 01', 12.5], ['m2', 'CHORA', 3]]);
  const groups = groupPending([m1, f, other, m2]);
  it('folds the matching raw-material updates into the production', () => {
    assert.equal(groups.length, 2);
    const g = groups.find(x => x.main.collection === 'factory');
    assert.deepEqual(g.children.map(c => c.docId).sort(), ['m1', 'm2']);
  });
  it('leaves unrelated material changes as their own items, in the original order', () => {
    assert.deepEqual(groups.map(g => g.main.docId), ['f1', 'm9']);
    assert.ok(groups.some(g => g.main.docId === 'm9' && g.children.length === 0));
  });
  it('lists every material and quantity from the unit formula', () => {
    const g = groups.find(x => x.main.collection === 'factory');
    const m = sheetModel(g, CTX);
    assert.equal(m.title, 'Factory production');
    assert.equal(m.amount, '40 units');
    assert.equal(m.sectionTitle, 'Raw materials used (2)');
    assert.deepEqual(m.sectionLines, ['KHAKA 01 — 12.5 kg', 'CHORA — 3 kg']);
    assert.match(m.note, /2 stock updates above are included/);
    assert.equal(m.count, 3);
  });
  it('the list row says how many materials it covers', () => {
    const g = groups.find(x => x.main.collection === 'factory');
    assert.match(groupRowSummary(g, CTX).body, /2 materials$/);
  });
  it('a deleted production finds its materials through the shared copy', () => {
    const del = { ...mk({ collection: 'factory', action: 'delete', docId: 'f2' }), _cloud: { materialsUsed: [{ id: 'm1', name: 'KHAKA 01', quantity: 1 }] } };
    const g = groupPending([del, mat('m1', 'KHAKA 01', 1)]);
    assert.equal(g.length, 1);
    assert.equal(g[0].children.length, 1);
  });
  it('17 raw-material items collapse into the one production', () => {
    const ids = Array.from({ length: 17 }, (_, i) => ['k' + i, 'M' + i, i + 1]);
    const all = [factory(ids), ...ids.map(([id, n, q]) => mat(id, n, q))];
    assert.equal(groupPending(all).length, 1);
  });
});

describe('bulk sheet', () => {
  it('states the count, the people and what happens', () => {
    const groups = [{ id: 'a', main: sale(), children: [] }, { id: 'b', main: sale({ docId: 's2' }), children: [] }];
    const a = bulkSheetModel('approve', groups);
    assert.equal(a.title, 'Approve all (2)');
    assert.equal(a.submittedLine, 'From Sam');
    assert.match(a.note, /2 records become part of the shared records/);
    const d = bulkSheetModel('discard', groups);
    assert.equal(d.confirmText, 'Discard all');
    assert.match(d.note, /cannot be reversed/);
  });
});

describe('dialog wording', () => {
  it('summary line and grouping', () => {
    assert.equal(pendingSummaryLine([]), 'Nothing is waiting for approval.');
    assert.equal(pendingSummaryLine([mk()]), '1 action from Sam waiting for approval.');
    assert.equal(groupBySubmitter([mk(), mk({ docId: 'k' })]).length, 1);
  });
  it('summarises new, changed and deleted records for notifications', () => {
    assert.deepEqual(summarizePending(mk(), fmt), { title: 'New sale', body: 'Zed — Rs 500' });
    assert.equal(summarizePending(mk({ isEdit: true }), fmt).title, 'Change sale');
    assert.match(summarizePending(mk({ action: 'delete' }), fmt).title, /^Delete sale/);
  });
  it('tells the member how their action was decided', () => {
    assert.equal(resolutionNotice(mk(), 'approved', fmt).title, 'Approved');
    assert.match(resolutionNotice(mk(), 'discarded', fmt).body, /removed from this device/);
  });
});

function adminHarness() {
  const ops = [];
  const batch = { set: (ref, data, opt) => ops.push(['set', ref.path, data, opt]), delete: (ref) => ops.push(['delete', ref.path]), commit: async () => { ops.push(['commit']); } };
  const col = (c) => ({ doc: (id) => ({ path: `${c}/${id}`, set: async (data, opt) => { ops.push(['set', `${c}/${id}`, data, opt]); } }) });
  const store = new Map([['rep', [{ id: 'old', x: 1 }]]]);
  const scope = {
    dataRootRef: () => ({ collection: col }),
    firebase: { firestore: { FieldValue: { serverTimestamp: () => 'TS' }, Timestamp: { fromMillis: (n) => n } } },
    firebaseDB: { batch: () => batch },
    currentUser: { uid: 'admin1', email: 'a@x.com', displayName: 'Boss' },
    window: { _assignedManagerName: 'Boss' },
    APP_CONFIG: { TOMBSTONE_EXPIRY_MS: 1000 },
    sqliteStore: { get: async (k) => store.get(k) || [], set: async (k, v) => { store.set(k, v); } },
    ensureArray: (v) => (Array.isArray(v) ? v : []),
    getSQLiteKey: (c) => c,
    DeltaSync: { markUploaded() {} },
    UUIDSyncRegistry: { markUploaded() {} },
  };
  const fns = extractFunctions('modules/approvals.js', ['_decider', '_markSubmitted', '_upsertLocal', '_writeApproval', 'approveMany', 'discardMany', 'approveOne', 'discardOne'], scope);
  return { fns, ops, store };
}

describe('admin decisions', () => {
  it('approving a group writes every record, clears tombstones and marks every item approved, in one batch', async () => {
    const { fns, ops, store } = adminHarness();
    const f = factory([['m1', 'KHAKA', 2]]);
    const m = mat('m1', 'KHAKA', 2);
    await fns.approveMany([f, m]);
    const paths = ops.map(o => `${o[0]}:${o[1] || ''}`);
    assert.deepEqual(paths, [
      'set:factory/f1', 'delete:deletions/f1', 'set:pending/factory__f1',
      'set:inventory/m1', 'delete:deletions/m1', 'set:pending/inventory__m1', 'commit:',
    ]);
    assert.equal(ops.filter(o => o[0] === 'commit').length, 1);
    assert.equal(ops[0][2].approvedBy, 'Boss');
    assert.equal(ops[2][2].status, 'approved');
    assert.ok(store.get('factory').some(r => r.id === 'f1'));
    assert.ok(store.get('inventory').some(r => r.id === 'm1'));
  });
  it('approving a delete removes the cloud record and writes the tombstone', async () => {
    const { fns, ops } = adminHarness();
    await fns.approveOne(mk({ action: 'delete' }));
    assert.deepEqual(ops.map(o => `${o[0]}:${o[1] || ''}`), ['delete:rep/abc12345-x', 'set:deletions/abc12345-x', 'set:pending/rep__abc12345-x', 'commit:']);
  });
  it('discarding a group marks each item discarded in one batch and touches no real data', async () => {
    const { fns, ops } = adminHarness();
    await fns.discardMany([mk(), mk({ docId: 'z' })]);
    assert.deepEqual(ops.map(o => `${o[0]}:${o[1] || ''}`), ['set:pending/rep__abc12345-x', 'set:pending/rep__z', 'commit:']);
    assert.ok(ops.slice(0, 2).every(o => o[2].status === 'discarded'));
  });
});

describe('every non-admin write is diverted to pending', () => {
  const sync = read('modules/sync.js');
  const core = read('modules/utilities-core.js');
  it('single saves and deletes', () => {
    assert.match(sync, /if \(gates\(collectionName\)\) \{\s*const pendingData[\s\S]*?submitPending\(collectionName, String\(record\.id\), 'set'/);
    assert.match(sync, /if \(gates\(collectionName\)\) \{\s*await submitPending\(collectionName, String\(recordId\), 'delete', null\)/);
  });
  it('the offline queue replay', () => {
    assert.match(core, /window\.gatesCollection\(collection\)\)[\s\S]*?window\.submitPending\(/);
    assert.ok(core.indexOf('window.gatesCollection') < core.indexOf("switch (action) {") || core.indexOf('window.gatesCollection') < core.indexOf('switch (action)'));
  });
  it('the bulk upload writes to pending and skips shared config for gated sessions', () => {
    assert.match(sync, /submitPendingBatch\(getOrNewBatch\(\), userRef, collectionName, docId, 'set', sanitizedItem\)/);
    for (const k of ['factorySettingsDirty', 'localSettingsTs &&', 'localExpCatTs &&', 'localLedgerTs &&', 'localCatTs &&', 'localStoresTs &&'])
      assert.match(sync, new RegExp('!gated && ' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  it('unsynced deletions become pending deletions', () => {
    assert.match(sync, /submitPendingBatch\(dBatch, userRef, dr\.collection, String\(dr\.id\), 'delete', null\)/);
  });
  it('recycle-bin writes are blocked for gated sessions', () => {
    const pay = read('modules/utilities-payments.js');
    for (const fn of ['purgeRecoveredId', 'flushErasedTombstones', 'hardDeleteRecord']) {
      const i = pay.indexOf('export async function ' + fn);
      assert.match(pay.slice(i, i + 600), /isGatedSession/, fn);
    }
  });
  it('listeners: members watch their own items, admins watch the queue', () => {
    assert.match(sync, /if \(isGatedSession\(\)\) realtimeRefs\.push\(watchOwnPending\(userRef\)\);\s*else if \(appMode === 'admin'\) realtimeRefs\.push\(watchPendingApprovals\(userRef\)\)/);
  });
  it('the gate applies only to workspace members who are not admins', () => {
    const a = read('modules/approvals.js');
    assert.match(a, /!!currentUser && appMode !== 'admin' && !!window\._workspaceOwnerUid/);
  });
});

describe('screen, sheet and member wording', () => {
  const html = read('index.html');
  const ui = read('modules/approvals.js');
  it('has the Approvals screen with per-day approve and discard (no global buttons) and a badge', () => {
    assert.match(html, /id="approvals-screen"/);
    assert.doesNotMatch(html, /approveAllPending\(\)/);
    assert.doesNotMatch(html, /discardAllPending\(\)/);
    assert.match(read('modules/approvals-ledger.js'), /approveDayPending\(this\.dataset\.day\)/);
    assert.match(read('modules/approvals-ledger.js'), /discardDayPending\(this\.dataset\.day\)/);
    assert.match(html, /data-approvals-count/);
  });
  it('uses the shared bottom sheet with Discard and Approve buttons, not a separate dialog', () => {
    assert.match(ui, /getElementById\('cm-sheet'\)/);
    assert.match(ui, /class="btn btn-danger"[^>]*decideApproval\('discard'/);
    assert.match(ui, /class="btn btn-main u-mt-8"[^>]*decideApproval\('approve'/);
    assert.equal(/showGlassConfirm/.test(ui), false);
  });
  it('rows open the sheet when tapped and failures use dialogs', () => {
    assert.match(read('modules/approvals-ledger.js'), /onclick="openApprovalSheet\(this\.dataset\.id\)"/);
    assert.match(ui, /'Not Approved'/);
    assert.match(ui, /'Not Discarded'/);
  });
  it('team accounts see "Send for Admin Approval" on the save buttons', () => {
    const css = read('app.css');
    assert.match(css, /content: 'Send for Admin Approval'/);
    for (const id of ['btn-save-rep-transaction', 'btn-save-production', 'btn-save-cust-transaction', 'btn-save-calculator', 'btn-save-factory-production', 'factorySaveMaterialBtn', 'cust-edit-save-btn', 'rep-cust-edit-save-btn']) {
      assert.ok(css.includes(`html[data-needs-approval] #${id}::after`), id);
      assert.ok(html.includes(`id="${id}"`), id + ' exists');
    }
    assert.match(read('modules/utilities-payments.js'), /toggleAttribute\('data-needs-approval'/);
  });
  it('the save confirmation says it goes to the admin', () => {
    const g = read('modules/confirm-guard.js');
    assert.match(g, /'Send for Approval'/);
    assert.match(g, /The admin must approve it before it becomes part of the shared records/);
  });
});

describe('firestore.rules enforce the approval', () => {
  const rules = read('firestore.rules');
  it('members can write only photos and their own pending items', () => {
    assert.match(rules, /function canWrite\(owner, subcollection\)[\s\S]*?isAdmin\(\) \|\| subcollection == 'photos'/);
    assert.match(rules, /match \/users\/\{uid\}\/pending\/\{pid\}/);
    assert.match(rules, /d\.submittedBy\.uid == request\.auth\.uid/);
    assert.match(rules, /d\.status == 'pending'/);
  });
  it('members cannot read other people\'s pending items', () => {
    assert.match(rules, /subcollection != 'pending'/);
    assert.match(rules, /resource\.data\.submittedBy\.uid == request\.auth\.uid/);
  });
  it('pending items can only target the gated data collections', () => {
    for (const c of GATED_COLLECTIONS) assert.ok(rules.includes(`'${c}'`), c);
  });
});
