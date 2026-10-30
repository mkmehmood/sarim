import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const rep = read('modules/rep-sales.js');
const pay = read('modules/utilities-payments.js');
const sales = read('modules/utilities-sales.js');
const html = read('index.html');

describe('edit paths', () => {
  it('rep activity cards offer Edit and Delete through the repsale handler', () => {
    assert.match(rep, /actionRowHtml\('repsale', item\.id,/);
    assert.match(rep, /registerEditHandler\('repsale'/);
  });
  it('rep Edit is hidden for merged, settled and opening-balance records', () => {
    assert.match(rep, /item\.isMerged \|\| item\.isSettled \|\| isOldDebt\) \? ''/);
  });
  it('calculator cards offer Edit next to Delete', () => {
    assert.match(pay, /actionRowHtml\('calc', id,/);
  });
  it('calculator edit is registered and its save button switches to Update', () => {
    assert.match(sales, /registerEditHandler\('calc', startEditCalc\)/);
    assert.match(html, /id="btn-save-calculator"/);
  });
  it('seller, date, returned and expired are no longer locked while editing', () => {
    assert.doesNotMatch(sales, /selectBtn\.disabled = true/);
    assert.doesNotMatch(sales, /are locked\. Delete and re-enter/);
  });
});

describe('calculator edit: quick vs full', () => {
  it('unchanged side-effect fields take the quick path with the original prices', () => {
    assert.match(sales, /const _calcQuick = !!_calcEd && !_calcFull;/);
    assert.match(sales, /const costPerKg = _calcQuick \?/);
    assert.match(sales, /if \(_calcQuick\) \{/);
  });
  it('changing seller, date, returned, expired or the return target takes the full path', () => {
    assert.match(sales, /seller !== o\.seller \|\| date !== editDateValue/);
    assert.match(sales, /_r2e\(ret\) !== _r2e\(o\.returned\) \|\| _r2e\(exp\) !== _r2e\(o\.expired\)/);
    assert.match(sales, /window\._returnStore \|\| null\) !== \(o\.returnStore \|\| null\)/);
  });
  it('the full path confirms, keeps the id, replaces the record and restores it on failure', () => {
    assert.match(sales, /confirmEditChanges\(_fr, 'Update Calculator Entry\?'\)/);
    assert.match(sales, /let calcId = _ed \? _ed\.id/);
    assert.match(sales, /if \(_ed\) replaceRecord\(history, entry\)/);
    assert.match(sales, /restoreCalcAfterFailedEdit\(_rev\)/);
  });
  it('auto-fill does not overwrite the form while editing a calculator entry', () => {
    assert.match(pay, /autoFillTotalSoldQuantity\(\) \{\nif \(getEditCtx\('calc'\)\) return;/);
    assert.match(pay, /applyRepReturnsToCalculator\(seller, toDate\) \{\nif \(getEditCtx\('calc'\)\) return;/);
  });
});
