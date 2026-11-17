import { describe, it, mock, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const editCtx = { current: null };
mock.module('../modules/edit-mode.js', { namedExports: { getEditCtx: () => editCtx.current } });
mock.module('../modules/money-privacy.js', { namedExports: { sanitizeConfirmExtra: (x) => x } });

globalThis.window = globalThis;
const formBox = { checked: false };
globalThis.document = { getElementById: (id) => (id === 'form-box' ? formBox : null) };
globalThis.localStorage = { getItem: () => '0', setItem() {} };
const { confirmGuard } = await import('../modules/confirm-guard.js');

let dialog;
let tick;
beforeEach(() => {
  editCtx.current = null;
  formBox.checked = false;
  dialog = null;
  tick = [];
  window._gcLedger = undefined;
  window._gcShare = undefined;
  window.showGlassConfirm = async (_msg, opts) => {
    dialog = opts;
    [].concat(opts.checkbox || []).forEach((cb, i) => cb.onResult(!!tick[i]));
    return true;
  };
});
const guard = (ledger, extra = {}) => confirmGuard('t', async () => 'done', { label: 'Sale', share: { kind: 'cust' }, ledger, ...extra });

describe('confirmGuard ledger checkbox at runtime', () => {
  it('shows Share invoice and Add to Daily Ledger together, ledger first ticked from the form box', async () => {
    formBox.checked = true;
    await guard({ when: () => true, formBox: 'form-box' });
    assert.deepEqual(dialog.checkbox.map((c) => [c.label, c.checked]), [['Share invoice after saving', false], ['Add to Daily Ledger', true]]);
  });

  it('reports each box separately after the user confirms', async () => {
    tick = [false, true];
    await guard({ when: () => true, formBox: 'form-box' });
    assert.equal(window._gcLedger, true);
    assert.equal(window._gcShare, null);
    tick = [true, false];
    await guard({ when: () => true, formBox: 'form-box' });
    assert.equal(window._gcLedger, false);
    assert.deepEqual(window._gcShare, { kind: 'cust' });
  });

  it('leaves the ledger box out when the rule says no, and clears an old answer', async () => {
    window._gcLedger = true;
    await guard({ when: () => false });
    assert.deepEqual(dialog.checkbox.map((c) => c.label), ['Share invoice after saving']);
    assert.equal(window._gcLedger, null);
  });

  it('uses the custom label and works without a share box', async () => {
    await confirmGuard('t', async () => 1, { label: 'Sale', ledger: { when: () => true, label: 'Add cash, expenses & commission to Daily Ledger' } });
    assert.deepEqual(dialog.checkbox.map((c) => c.label), ['Add cash, expenses & commission to Daily Ledger']);
  });

  it('late dialogs (gcCommit) get the same boxes and set the flag before the save continues', async () => {
    tick = [false, true];
    let flagAtSave;
    await confirmGuard('late', async () => { await window.gcCommit({}); flagAtSave = window._gcLedger; }, { label: 'Sale', late: true, share: { kind: 'cust' }, ledger: { when: () => true } });
    assert.equal(dialog.checkbox.length, 2);
    assert.equal(flagAtSave, true);
  });
});
