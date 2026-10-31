import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractFunctions } from './_extract.js';
import {
  GATED_COLLECTIONS, approveConfirm, buildPendingDoc, bulkConfirm, discardConfirm, groupBySubmitter,
  isGatedCollection, pendingId, pendingSummaryLine, resolutionNotice, summarizePending,
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

describe('dialog wording', () => {
  it('summarises new, changed and deleted records', () => {
    assert.deepEqual(summarizePending(mk(), fmt), { title: 'New sale', body: 'Zed — Rs 500' });
    assert.equal(summarizePending(mk({ isEdit: true }), fmt).title, 'Change sale');
    assert.match(summarizePending(mk({ action: 'delete' }), fmt).title, /^Delete sale/);
  });
  it('approve and discard dialogs name the person and the consequence', () => {
    const a = approveConfirm(mk(), fmt);
    assert.equal(a.title, 'Approve Action');
    assert.match(a.message, /from Sam/);
    assert.match(a.message, /shared records/);
    const d = discardConfirm(mk(), fmt);
    assert.equal(d.title, 'Discard Action');
    assert.equal(d.danger, true);
    assert.match(d.message, /Sam's device will undo it/);
  });
  it('approving a deletion is flagged dangerous', () => {
    const a = approveConfirm(mk({ action: 'delete' }), fmt);
    assert.equal(a.title, 'Approve Deletion');
    assert.equal(a.danger, true);
  });
  it('bulk dialogs state the count and the people', () => {
    const items = [mk(), mk({ docId: 'z' }), buildPendingDoc({ collection: 'sales', docId: 'q', action: 'set', data: {}, who: { uid: 'u2', name: 'Pat' }, now: 1 })];
    assert.match(bulkConfirm('approve', items).message, /all 3 waiting actions/);
    assert.match(bulkConfirm('approve', items).message, /Sam, Pat/);
    assert.equal(bulkConfirm('discard', items).danger, true);
    assert.equal(bulkConfirm('discard', items).confirmText, 'Discard 3');
  });
  it('summary line and grouping', () => {
    assert.equal(pendingSummaryLine([]), 'Nothing is waiting for approval.');
    assert.equal(pendingSummaryLine([mk()]), '1 action from Sam waiting for approval.');
    assert.equal(groupBySubmitter([mk(), mk({ docId: 'k' })]).length, 1);
  });
  it('tells the member how their action was decided', () => {
    assert.equal(resolutionNotice(mk(), 'approved', fmt).title, 'Approved');
    assert.match(resolutionNotice(mk(), 'discarded', fmt).body, /removed from this device/);
  });
});

function adminHarness() {
  const ops = [];
  const batch = { set: (ref, data, opt) => ops.push(['set', ref.path, data, opt]), delete: (ref) => ops.push(['delete', ref.path]), commit: async () => ops.push(['commit']) };
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
  const fns = extractFunctions('modules/approvals.js', ['_decider', '_markSubmitted', '_upsertLocal', 'approveOne', 'discardOne'], scope);
  return { fns, ops, store };
}

describe('admin decisions', () => {
  it('approving a create writes the record, clears any tombstone and marks the item approved, in one batch', async () => {
    const { fns, ops, store } = adminHarness();
    await fns.approveOne(mk());
    const paths = ops.map(o => `${o[0]}:${o[1] || ''}`);
    assert.deepEqual(paths, ['set:rep/abc12345-x', 'delete:deletions/abc12345-x', 'set:pending/rep__abc12345-x', 'commit:']);
    assert.equal(ops[0][2].approvedBy, 'Boss');
    assert.equal(ops[2][2].status, 'approved');
    assert.ok(store.get('rep').some(r => r.id === 'abc12345-x' && r.customerName === 'Zed'));
    assert.equal(store.get('rep').length, 2);
  });
  it('approving a delete removes the cloud record and writes the tombstone', async () => {
    const { fns, ops } = adminHarness();
    await fns.approveOne(mk({ action: 'delete' }));
    assert.deepEqual(ops.map(o => `${o[0]}:${o[1] || ''}`), ['delete:rep/abc12345-x', 'set:deletions/abc12345-x', 'set:pending/rep__abc12345-x', 'commit:']);
  });
  it('discarding only marks the item discarded and touches no real data', async () => {
    const { fns, ops } = adminHarness();
    await fns.discardOne(mk());
    assert.deepEqual(ops.map(o => `${o[0]}:${o[1]}`), ['set:pending/rep__abc12345-x']);
    assert.equal(ops[0][2].status, 'discarded');
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

describe('screen and dialogs', () => {
  const html = read('index.html');
  it('has the Approvals screen with approve all, discard all and a badge', () => {
    assert.match(html, /id="approvals-screen"/);
    assert.match(html, /approveAllPending\(\)/);
    assert.match(html, /discardAllPending\(\)/);
    assert.match(html, /data-approvals-count/);
  });
  it('each decision asks first and failures use dialogs', () => {
    const a = read('modules/approvals.js');
    assert.ok(a.indexOf('showGlassConfirm') < a.indexOf('await approveOne(p); else await discardOne(p);'));
    assert.match(a, /'Not Approved'/);
    assert.match(a, /'Not Discarded'/);
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
