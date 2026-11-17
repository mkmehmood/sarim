import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractFunctions } from './_extract.js';
import { deriveSession } from '../modules/roles.js';

const TABS = ['prod', 'sales', 'calc', 'factory', 'payments', 'rep'];

function setup(roles) {
  const session = deriveSession(roles);
  const els = new Map();
  const mk = (id) => {
    const cls = new Set();
    const el = { id, display: null, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), has: (c) => cls.has(c) } };
    els.set(id, el);
    return el;
  };
  TABS.forEach((t) => { mk('tab-' + t); mk('snav-' + t); });
  const shown = [];
  const toasts = [];
  const win = {
    _assignedUserTabs: session.tabs, _userRoleAllowedTabs: session.tabs, _assignedManagerName: 'Sam',
    setDisplay: (el, v) => { el.display = v; },
    setStyle() {},
    showTab: (t) => shown.push(t),
  };
  const doc = {
    getElementById: (id) => els.get(id) || null,
    querySelectorAll: (sel) => (sel === '[id^="snav-"]' ? TABS.map((t) => els.get('snav-' + t)) : []),
    querySelector: () => null,
  };
  const scope = { window: win, document: doc, appMode: session.mode, updateSystemName() {}, showToast: (m) => toasts.push(m), showTab: win.showTab };
  const fns = extractFunctions('modules/utilities-payments.js', ['lockToUserRoleMode', 'preventAdminAccess'], scope);
  fns.lockToUserRoleMode();
  fns.preventAdminAccess();
  return { els, win, shown, toasts, session };
}

describe('unassigned tabs are hidden the same way for every role combination', () => {
  const combos = [['payments'], ['production', 'payments'], ['sales', 'rep'], ['factory', 'sales', 'payments']];
  for (const roles of combos) {
    it(`roles ${roles.join('+')}`, () => {
      const { els, win, shown, toasts, session } = setup(roles);
      assert.equal(session.mode, 'userrole');
      for (const t of TABS) {
        const allowed = session.tabs.includes(t);
        assert.equal(els.get('tab-' + t).classList.has('hidden'), true, 'pane ' + t + ' starts hidden');
        if (session.tabs.length > 1) assert.equal(els.get('snav-' + t).display, allowed ? '' : 'none', 'nav ' + t);
        else assert.equal(els.get('snav-' + t).display, 'none', 'single-tab users get no nav');
      }
      assert.equal(shown[0], session.tabs[0], 'first assigned tab opens');
      for (const t of TABS.filter((x) => !session.tabs.includes(x))) {
        shown.length = 0;
        win.showTab(t);
        assert.equal(shown.length, 0, 'blocked ' + t);
      }
      assert.ok(toasts.length > 0);
      shown.length = 0;
      win.showTab(session.tabs[0]);
      assert.deepEqual(shown, [session.tabs[0]]);
    });
  }
});
