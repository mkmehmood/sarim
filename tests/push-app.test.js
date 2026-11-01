import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('push rules', () => {
  const rules = read('../firestore.rules');
  it('lets an admin manage only their own device tokens', () => {
    assert.match(rules, /match \/users\/\{uid\}\/fcm_tokens\/\{tokenId\}/);
    assert.match(rules, /allow read, delete: if inWorkspace\(uid\) && isAdmin\(\)\s*&& resource\.data\.uid == request\.auth\.uid/);
    assert.match(rules, /request\.resource\.data\.uid == request\.auth\.uid/);
    assert.match(rules, /tokenId\.matches\(request\.auth\.uid \+ '_\.\*'\)/);
    assert.match(rules, /hasOnly\(\['uid', 'token', 'platform', 'updatedAt'\]\)/);
  });
  it('keeps tokens out of every general rule, including the owner rule', () => {
    assert.match(rules, /function canRead[\s\S]*?subcollection != 'fcm_tokens'/);
    assert.match(rules, /function canWrite[\s\S]*?subcollection != 'fcm_tokens'/);
    const ownerRules = rules.match(/allow read, write: if isOwner\(uid\) && notSuspended\(\) && subcollection != 'fcm_tokens'/g) || [];
    assert.equal(ownerRules.length, 2);
  });
});

describe('push app wiring', () => {
  const push = read('../modules/push.js');
  it('points at the Worker and the CSP allows it', () => {
    assert.match(push, /PUSH_WORKER_URL = 'https:\/\/sarim-push\.3mahmoodkhan\.workers\.dev\/notify'/);
    assert.ok(read('../index.html').includes('https://sarim-push.3mahmoodkhan.workers.dev'));
  });
  it('registers only admin Android devices and cleans up on sign out', () => {
    assert.match(push, /appMode !== 'admin'/);
    assert.match(push, /isAndroidPushApp\(\)/);
    assert.match(read('../modules/sync.js'), /await removePushToken\(\)\.catch\(\(\) => \{\}\);\nif \(auth\) await auth\.signOut\(\)/);
    assert.match(read('../modules/approvals.js'), /registerAdminPush\(\)\.catch/);
  });
  it('asks the Worker after a submission, in single and batch paths', () => {
    const a = read('../modules/approvals.js');
    assert.match(a, /_markSubmitted\(collection, docId\);\n\s*notifyAdminsPush\(doc\.id\)/);
    assert.match(a, /batch\.set\(ref, doc\);\n\s*notifyAdminsPush\(doc\.id\)/);
  });
  it('sends only the pending id, never record details, and throttles bursts', () => {
    assert.match(push, /body: JSON\.stringify\(\{ pendingId \}\)/);
    assert.match(push, /NOTIFY_GAP_MS/);
  });
  it('avoids a double alert when the app is hidden and push is active', () => {
    assert.match(read('../modules/approvals.js'), /!\(window\._pushActive && document\.hidden\)/);
  });
  it('ships the Android pieces', () => {
    assert.ok(existsSync(new URL('../android/app/google-services.json', import.meta.url)));
    const gs = JSON.parse(read('../android/app/google-services.json'));
    assert.equal(gs.client[0].client_info.android_client_info.package_name, 'com.gullzubair.sarim');
    assert.match(read('../android/capacitor.settings.gradle'), /capacitor-push-notifications/);
    const m = read('../android/app/src/main/AndroidManifest.xml');
    assert.match(m, /default_notification_channel_id"\s+android:value="approvals"/);
    assert.match(m, /default_notification_icon/);
    assert.ok(read('../sw.js').includes("'./modules/push.js'"));
    assert.ok(read('../modules/main.js').includes("import './push.js';"));
  });
});
