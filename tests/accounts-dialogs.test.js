import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractFunctions } from './_extract.js';
import { ROLE_LABELS, cleanRoles } from '../modules/roles.js';

const SRC = readFileSync(new URL('../modules/accounts.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function harness(values, roles = [], extra = {}) {
  const dialogs = [];
  const els = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { id, value, disabled: false, textContent: '' }]));
  const scope = {
    document: { getElementById: (id) => els[id] || null },
    window: { notifyBlocking: (message, tone, title) => dialogs.push({ message, tone, title }), gcCommit: async () => true },
    navigator: { onLine: true },
    currentUser: { uid: 'me', email: 'admin@x.com' },
    firebaseDB: {},
    MIN_PASSWORD: 8,
    _newRoles: new Set(roles),
    ROLE_LABELS, cleanRoles,
    ...extra,
  };
  const fns = extractFunctions('modules/accounts.js', ['_warn', '_fail', '_who', '_roleNames', '_adminAddAccountRaw'], scope);
  return { dialogs, run: fns._adminAddAccountRaw, els };
}

const ok = { 'acct-new-email': 'a@b.com', 'acct-new-password': 'longenough', 'acct-new-name': 'Sam' };

describe('App Accounts uses the app dialogs, not an inline message', () => {
  it('has no inline message line any more', () => {
    assert.equal(/_setMsg|acct-add-msg/.test(SRC + HTML), false);
  });
  it('every dialog has a title and a tone', () => {
    const calls = SRC.match(/window\.notifyBlocking\([^;]*\);/g) || [];
    assert.ok(calls.length >= 2);
    for (const t of SRC.match(/_(warn|fail)\('[^']+'/g) || []) assert.ok(t.length > 8);
    assert.equal((SRC.match(/showGlassConfirm\(/g) || []).length >= 4, true);
    for (const m of SRC.matchAll(/title: ([^,}]+)/g)) assert.ok(m[1].trim().length > 0);
  });
});

describe('add-account validation raises a warning dialog', () => {
  const cases = [
    [{ ...ok, 'acct-new-email': '' }, ['rep'], 'Email Required'],
    [{ ...ok, 'acct-new-password': 'short' }, ['rep'], 'Password Too Short'],
    [{ ...ok, 'acct-new-name': ' ' }, ['rep'], 'Name Required'],
    [ok, [], 'Select a Role'],
  ];
  for (const [values, roles, title] of cases) {
    it(title, async () => {
      const h = harness(values, roles);
      await h.run();
      assert.equal(h.dialogs.length, 1);
      assert.equal(h.dialogs[0].title, title);
      assert.equal(h.dialogs[0].tone, 'warning');
    });
  }
  it('offline raises a dialog before anything is written', async () => {
    const h = harness(ok, ['rep'], { navigator: { onLine: false } });
    await h.run();
    assert.equal(h.dialogs[0].title, 'No Internet');
  });
});

describe('sensitive actions are confirmed', () => {
  it('granting or removing Admin asks first and a suspension or removal asks first', () => {
    assert.match(SRC, /title: granting \? 'Grant Admin Access' : 'Remove Admin Access'/);
    assert.match(SRC, /title: currentlyApproved \? 'Suspend Account' : 'Reinstate Account'/);
    assert.match(SRC, /title: 'Remove Account'/);
    assert.match(SRC, /title: 'Add Existing Login'/);
  });
  it('the form is cleared when the screen closes', () => {
    const reg = readFileSync(new URL('../modules/utilities-payments.js', import.meta.url), 'utf8');
    assert.match(reg, /'app-accounts-screen':[^\n]*resetAccountForm/);
  });
});
