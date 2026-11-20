import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIMITS, duplicateName, nameIssue, numberIssue, quantityIssue, unitCostIssue } from '../modules/input-guards.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('numberIssue', () => {
  it('accepts plain numbers inside the range', () => {
    assert.equal(numberIssue('12.5', { label: 'X', min: 0, max: 100 }), '');
    assert.equal(numberIssue('1,250', { label: 'X', min: 0, max: 10000 }), '');
    assert.equal(numberIssue('0', { label: 'X', min: 0 }), '');
  });
  it('rejects blanks unless allowed', () => {
    assert.equal(numberIssue('', { label: 'Cost' }), 'Cost is required.');
    assert.equal(numberIssue('  ', { label: 'Cost', allowBlank: true }), '');
  });
  it('rejects scientific notation, text, spaces inside and repeated dots', () => {
    for (const v of ['1e12', 'abc', '12 34', '1..5', '--1', '1e-3', '\u0665\u0660\u0660']) assert.match(numberIssue(v, { label: 'X' }), /plain number/, v);
  });
  it('rejects values below the minimum, including the exclusive case, and above the maximum', () => {
    assert.match(numberIssue('-1', { label: 'X', min: 0 }), /plain number|cannot be less/);
    assert.match(numberIssue('0', { label: 'X', min: 0, minExclusive: true }), /greater than 0/);
    assert.match(numberIssue('0.5', { label: 'X', min: 1 }), /cannot be less than 1/);
    assert.match(numberIssue('101', { label: 'X', max: 100 }), /cannot be more than 100/);
  });
});

describe('quantity, cost and name limits', () => {
  it('quantities must be between 0.001 and the maximum', () => {
    assert.equal(quantityIssue('0.001'), '');
    assert.equal(quantityIssue(String(LIMITS.QTY_MAX)), '');
    assert.match(quantityIssue('0.0001'), /cannot be less than 0.001/);
    assert.match(quantityIssue('1000001'), /cannot be more than 1,000,000/);
    assert.match(quantityIssue('1e12', 'Weight'), /Weight must be a plain number/);
  });
  it('costs must be at least 0.01 and below the unit cost maximum', () => {
    assert.equal(unitCostIssue('4000'), '');
    assert.match(unitCostIssue('0.001'), /cannot be less than 0.01/);
    assert.match(unitCostIssue('100000001'), /cannot be more than 100,000,000/);
    assert.match(unitCostIssue('0'), /cannot be less than 0.01/);
  });
  it('names are capped and control characters are refused', () => {
    assert.equal(nameIssue('Ali Khan'), '');
    assert.equal(nameIssue('x'.repeat(80)), '');
    assert.match(nameIssue('x'.repeat(81), 'Customer name'), /Customer name is too long \(at most 80 characters\)/);
    assert.match(nameIssue('a\u0007b'), /not allowed/);
    assert.match(nameIssue('x'.repeat(31), 'Unit name', LIMITS.UNIT_MAX), /at most 30/);
    assert.equal(nameIssue('  a   b  '), '');
  });
});

describe('duplicateName', () => {
  const known = [{ id: '1', name: 'STANDARD' }, { id: '2', name: 'Mix  A' }];
  it('ignores case and repeated spaces and returns the match', () => {
    assert.equal(duplicateName('standard ', known).id, '1');
    assert.equal(duplicateName('mix a', known).id, '2');
  });
  it('lets a record keep its own name and ignores blanks and non-arrays', () => {
    assert.equal(duplicateName('Standard', known, '1'), null);
    assert.equal(duplicateName('   ', known), null);
    assert.equal(duplicateName('x', null), null);
    assert.equal(duplicateName('New', known), null);
  });
});

describe('the ranges are enforced where the data is entered', () => {
  it('raw material purchase checks name, quantity, cost, conversion factor and unit', () => {
    const src = read('../modules/factory.js');
    assert.match(src, /import \{ LIMITS, dateIssue, nameIssue, numberIssue, phoneIssue, quantityIssue, unitCostIssue \} from '\.\/input-guards\.js'/);
    assert.match(src, /quantityIssue\(_el\('factoryMaterialQuantity'\)\.value, 'Quantity'\)/);
    assert.match(src, /unitCostIssue\(_el\('factoryMaterialCost'\)\.value, 'Cost'\)/);
    assert.match(src, /label: 'Conversion factor', min: LIMITS\.QTY_MIN, max: LIMITS\.FACTOR_MAX/);
    assert.match(src, /Enter the unit name, for example bag\./);
    assert.match(src, /nameIssue\(_el\('factorySupplierName'\)\.value, 'Supplier name'\)/);
  });

  it('production needs a plain gross weight, a non-negative container weight and formula units in range', () => {
    const src = read('../modules/utilities-core.js');
    assert.match(src, /label: 'Gross weight', min: LIMITS\.QTY_MIN, max: LIMITS\.QTY_MAX/);
    assert.match(src, /label: 'Container weight', min: 0, max: LIMITS\.QTY_MAX, allowBlank: true/);
    assert.match(src, /label: 'Formula units', min: 0, minExclusive: true, max: LIMITS\.QTY_MAX, allowBlank: true/);
    assert.ok(src.indexOf("label: 'Gross weight'") < src.indexOf('const net = parseFloat(netElement.value)'));
  });

  it('sales and rep sales cap name length and quantity', () => {
    const sales = read('../modules/utilities-sales.js');
    assert.match(sales, /nameIssue\(name, 'Customer name'\) \|\| \(_qRaw\.trim\(\) \? quantityIssue\(_qRaw, 'Quantity'\) : ''\)/);
    const rep = read('../modules/rep-sales.js');
    assert.match(rep, /nameIssue\(name, 'Customer name'\) \|\| \(repTransactionMode === 'sale' && _repQtyRaw\.trim\(\) \? quantityIssue\(_repQtyRaw, 'Quantity'\) : ''\)/);
    assert.doesNotMatch(rep, /stock delivered|availableForRep/);
  });

  it('the calculator limits commission and cash, blocks future settlement dates, and asks before saving a short or over settlement', () => {
    const src = read('../modules/calc-tab.js');
    assert.match(src, /commissionPerUnit > LIMITS\.COMMISSION_MAX/);
    assert.match(src, /rec > MAX_AMOUNT \|\| commissionPaid > MAX_AMOUNT \|\| fieldExp > MAX_AMOUNT \|\| prev > MAX_AMOUNT/);
    assert.match(src, /if\(!_calcEd\) \{\nconst _calcDateIssue = dateIssue\(date, localDateStr\(\)\);/);
    assert.match(src, /Cash received \$\{fmtAmt\(safeNumber\(rec, 0\)\)\} but expected \$\{fmtAmt\(safeNumber\(totalExpected, 0\)\)\}/);
    assert.match(src, /confirmText: 'Save anyway'/);
    assert.match(src, /\{ label: 'Settlement', late: true/);
    assert.doesNotMatch(src, /\{ label: 'Sale', late: true/);
  });

  it('the shortage question is skipped for quick edits and when there is no difference', () => {
    const src = read('../modules/calc-tab.js');
    assert.match(src, /if \(!_calcQuick && Math\.abs\(diff\) > 0\.01 && typeof window\.showGlassConfirm === 'function'\)/);
  });

  it('the formula editor limits cost, factor and quantities and blocks duplicate names', () => {
    const src = read('../screens/formula-store-edit.screen.html');
    assert.match(src, /label: 'Additional cost', min: 0, max: LIMITS\.UNIT_COST_MAX, allowBlank: true/);
    assert.match(src, /label: 'Cost factor', min: 0, minExclusive: true, max: LIMITS\.COST_FACTOR_MAX, allowBlank: true/);
    assert.match(src, /i\.quantity < LIMITS\.QTY_MIN \|\| i\.quantity > LIMITS\.QTY_MAX/);
    assert.match(src, /duplicateName\(c\.name, fresh, _editingId\)/);
    assert.match(src, /already exists\. Choose a different name or edit that formula\./);
    assert.match(read('../screens/compiled/formula-store-edit.screen.js'), /duplicateName\(c\.name, fresh, _editingId\)/);
  });

  it('a store price must be a plain number of at least 0.01, not silently turned into zero', () => {
    const src = read('../screens/store-manager.screen.html');
    assert.match(src, /label: 'Sale price', min: 0\.01, max: LIMITS\.UNIT_COST_MAX, allowBlank: true/);
    assert.match(src, /nameIssue\(nameRaw, 'Store name'\)/);
    assert.ok(src.indexOf("label: 'Sale price'") < src.indexOf('const stores = (await'));
    assert.match(read('../screens/compiled/store-manager.screen.js'), /label: 'Sale price'/);
  });

  it('stock transfers, expenses and entities limit quantity and text length', () => {
    assert.match(read('../screens/stock-transfer.screen.html'), /quantityIssue\(\(document\.getElementById\('stock-transfer-qty'\) \|\| \{\}\)\.value, 'Quantity'\)/);
    assert.match(read('../modules/payments-tab.js'), /nameIssue\(name, 'Name'\) \|\| nameIssue\(description, 'Description', 300\)/);
    assert.match(read('../modules/utilities-payments.js'), /phoneIssue\(phone\) \|\| nameIssue\(name, 'Name'\) \|\| nameIssue\(wallet, 'Wallet details', 120\)/);
  });
});
