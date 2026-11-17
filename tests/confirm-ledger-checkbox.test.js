import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../modules/${f}`, import.meta.url), 'utf8');

describe('Add to Daily Ledger checkbox in the Save Transaction dialog', () => {
  it('the glass confirm dialog accepts several checkboxes and reports each one', () => {
    const src = read('dialog.js');
    assert.match(src, /\[\]\.concat\(checkbox \|\| \[\]\)/);
    assert.match(src, /data-dlg-check="\$\{i\}"/);
    assert.match(src, /boxes\.forEach\(\(cb, i\) =>/);
    assert.match(src, /boxes\.map\(checkboxMarkup\)/);
  });

  it('the confirm guard adds a ledger checkbox beside Share invoice and clears its flag each time', () => {
    const src = read('confirm-guard.js');
    assert.match(src, /label: opts\.ledger\.label \|\| 'Add to Daily Ledger'/);
    assert.match(src, /window\._gcLedger = !!v/);
    assert.match(src, /window\._gcLedger = null;/);
    assert.equal((src.match(/checkbox: dialogBoxes\(opts, verb\)/g) || []).length, 2);
  });

  it('only cash sales and collections offer it, never while editing, and the save honours it', () => {
    const src = read('utilities-sales.js');
    assert.match(src, /ledger: \{ when: \(\) => !getEditCtx\(\) && \(\(window\.custTransactionMode === 'sale' && .*=== 'CASH'\)\) \|\| window\.custTransactionMode === 'collection'\)/);
    assert.match(src, /isLedgerChecked\('saleAddToLedger'\) \|\| window\._gcLedger === true/);
    assert.match(src, /isLedgerChecked\('custAddToLedger'\) \|\| window\._gcLedger === true/);
  });

  it('Payments IN/OUT and the Calculator offer it in their confirm dialogs and honour the answer', () => {
    const pay = read('payments-tab.js');
    assert.match(pay, /ledger: \{ when: \(\) => !getEditCtx\(\) && \(window\._expenseCategory === 'IN' \|\| window\._expenseCategory === 'OUT'\), formBox: 'expenseAddToLedger' \}/);
    assert.match(pay, /if \(_seToLedger \|\| window\._gcLedger === true\) await addToLedgerSafely/);
    const calc = read('calc-tab.js');
    assert.match(calc, /ledger: \{ when: \(\) => !getEditCtx\('calc'\), label: 'Add cash, expenses & commission to Daily Ledger', formBox: 'calcAddToLedger' \}/);
    assert.match(calc, /isLedgerChecked\('calcAddToLedger'\) \|\| window\._gcLedger === true/);
  });

  it('the payment flag is read after the late confirm, not before it', () => {
    const pay = read('payments-tab.js');
    assert.ok(pay.indexOf('await window.gcCommit({})') < pay.indexOf('window._gcLedger === true) await addToLedgerSafely'));
  });

  it('the Money Out dialog uses the dialog checkbox style, not the form one', () => {
    const src = read('money-out.js');
    assert.match(src, /checkboxMarkup\(\{ label: 'Add to Daily Ledger', checked: false \}, 'ledger'\)/);
    assert.doesNotMatch(src, /pf-check/);
    assert.match(src, /toLedger: !!\(overlay\.querySelector\('\[data-dlg-check="ledger"\]'\) \|\| \{\}\)\.checked/);
  });
});
