import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const payments = read('modules/utilities-payments.js');
const rep = read('modules/rep-sales.js');
const sales = read('modules/utilities-sales.js');
const business = read('modules/business.js');
const start = business.indexOf('export function selectedCustomerFilter');
const end = business.indexOf('\n}\n', start) + 3;
const make = (inputs) => new Function('document', business.slice(start, end).replace('export ', '') + '\nreturn selectedCustomerFilter;')({ getElementById: (id) => inputs[id] || null });
describe('selectedCustomerFilter', () => {
  let inputs;
  beforeEach(() => { inputs = { 'cust-name': { value: 'Ali Store', dataset: { histCustomer: 'ali store' } } }; });
  it('filters when the typed name is the picked customer, ignoring case and spaces', () => {
    assert.equal(make(inputs)('cust-name'), 'ali store');
    inputs['cust-name'].value = '  ALI store ';
    assert.equal(make(inputs)('cust-name'), 'ali store');
  });
  it('does not filter once the field is changed or cleared', () => {
    inputs['cust-name'].value = 'Ali';
    assert.equal(make(inputs)('cust-name'), '');
    inputs['cust-name'].value = '';
    assert.equal(make(inputs)('cust-name'), '');
  });
  it('does not filter when nothing was picked or the field is missing', () => {
    inputs['cust-name'].dataset.histCustomer = '';
    assert.equal(make(inputs)('cust-name'), '');
    assert.equal(make(inputs)('rep-cust-name'), '');
  });
});
describe('customer history filter wiring', () => {
  it('sales cards carry the customer and the period filter hides other customers', () => {
    assert.match(sales, /'data-customer': String\(item\.customerName/);
    assert.match(payments, /selectedCustomerFilter\('cust-name'\)/);
    assert.match(payments, /card\.getAttribute\('data-customer'\) !== customerOnly/);
  });
  it('typing or picking a customer refreshes the history in both tabs', () => {
    assert.match(payments, /applyCustomerHistoryFilter\(isRep \? 'rep' : 'admin'\)/);
    assert.match(payments, /applyCustomerHistoryFilter\('admin'\)/);
    assert.match(payments, /applyCustomerHistoryFilter\('rep'\)/);
  });
  it('rep history keeps only the picked customer on the chosen date', () => {
    assert.match(rep, /selectedCustomerFilter\('rep-cust-name'\)/);
    assert.match(rep, /String\(s\.customerName \|\| ''\)\.trim\(\)\.toLowerCase\(\) === pickedCustomer/);
  });
});
