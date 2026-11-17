import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const approvals = read('../modules/approvals.js');
const push = read('../modules/push.js');

describe('opening the exact approval from a notification', () => {
  it('reads the pending id from the tapped notification and hands it to Approvals', () => {
    assert.match(push, /action\.notification\.data/);
    assert.match(push, /data\.pendingId/);
    assert.match(push, /window\.openApprovalFromPush\(id\)/);
    assert.match(approvals, /window\.openApprovalFromPush = openApprovalFromPush;/);
  });
  it('listens for taps as early as possible, once', () => {
    assert.match(push, /function ensureTapListener\(\)/);
    assert.match(push, /if \(isAndroidPushApp\(\)\) ensureTapListener\(\);/);
    assert.equal((push.match(/addListener\('pushNotificationActionPerformed'/g) || []).length, 1);
  });
  it('opens the sheet for the group that holds the notified item', () => {
    assert.match(approvals, /_groups\(\)\.find\(g => groupMembers\(g\)\.some\(p => p\.id === _wantedId\)\)/);
    assert.match(approvals, /openApprovalSheet\(g\.id\)/);
  });
  it('fetches the one notified document right away instead of waiting for the full list', () => {
    assert.match(approvals, /collection\('pending'\)\.doc\(id\)\.get\(\)/);
    assert.match(approvals, /if \(_wantedId\) \{ _showApprovalsScreen\(\); _fetchWanted\(_wantedId\); \}/);
  });
  it('says so when the item was already handled', () => {
    assert.match(approvals, /That approval was already handled/);
  });
  it('shows a loading card until the first server list arrives, not "All caught up"', () => {
    assert.match(approvals, /loading: !_loaded && !all\.length/);
    assert.match(read('../modules/approvals-ledger.js'), /Loading approvals…/);
    assert.match(approvals, /_loaded = true;/);
  });
});

describe('approval write path', () => {
  it('splits big approvals into batches under the 500-operation limit', () => {
    assert.match(approvals, /Math\.floor\(450 \/ opsPerItem\)/);
    assert.match(approvals, /_commitInChunks\(list, 3,/);
    assert.match(approvals, /_commitInChunks\(list, 1,/);
  });
  it('updates each local collection once, not once per item', () => {
    assert.match(approvals, /async function _upsertLocalMany\(list\)/);
    assert.match(approvals, /await _upsertLocalMany\(list\);/);
    assert.doesNotMatch(approvals, /for \(const p of list\) \{ if \(p\.action !== 'delete'\) await _upsertLocal\(p\); \}/);
  });
});
