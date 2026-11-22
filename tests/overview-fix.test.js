import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyValues, planFields, validateValues } from '../modules/overview-fix.js';

const today = '2026-11-16';
const sale = { id: 's1', date: '2026-11-01', quantity: 10, unitPrice: 100, totalValue: 1000, totalCost: 800, profit: 900 };
const keys = (col, rec, codes, ctx) => planFields(col, rec, codes, today, ctx).fields.map((f) => f.key);
const field = (col, rec, codes, key, ctx) => planFields(col, rec, codes, today, ctx).fields.find((f) => f.key === key);

describe('the fix form shows only the broken inputs', () => {
  it('a profit mismatch shows just the profit, already filled with the correct figure', () => {
    assert.deepEqual(keys('sales', sale, ['sale_profit_mismatch']), ['profit']);
    assert.equal(field('sales', sale, ['sale_profit_mismatch'], 'profit').value, 200);
  });

  it('a total that does not match shows the unit price and the total value, and says what the product is', () => {
    const rec = { ...sale, totalValue: 1500 };
    const plan = planFields('sales', rec, ['sale_total_mismatch'], today);
    assert.deepEqual(plan.fields.map((f) => f.key), ['unitPrice', 'totalValue']);
    assert.match(plan.notes[0], /Quantity times unit price is 1,000, but the total value is 1,500/);
  });

  it('one input per problem: cost, quantity, value, date, received flag, weight, amount, stock and cost per unit', () => {
    assert.deepEqual(keys('sales', sale, ['sale_no_cost']), ['totalCost']);
    assert.deepEqual(keys('sales', sale, ['sale_bad_qty']), ['quantity']);
    assert.deepEqual(keys('sales', sale, ['sale_negative_value']), ['totalValue']);
    assert.deepEqual(keys('sales', sale, ['future_date']), ['date']);
    assert.equal(field('sales', sale, ['bad_date'], 'date').value, today);
    assert.equal(field('sales', sale, ['sale_cash_unreceived'], 'creditReceived').type, 'check');
    assert.deepEqual(keys('production', {}, ['prod_bad_net']), ['net']);
    assert.deepEqual(keys('transactions', {}, ['txn_bad_amount']), ['amount']);
    assert.deepEqual(keys('expenses', {}, ['exp_bad_amount']), ['amount']);
    assert.equal(field('inventory', {}, ['inv_negative_qty'], 'quantity').value, 0);
    assert.deepEqual(keys('inventory', {}, ['inv_bad_cost']), ['cost']);
  });

  it('values that are not numbers become one field each', () => {
    const rec = { id: 'x', quantity: 'n/a', totalValue: 'n/a', totalCost: 1, profit: 1, unitPrice: 1 };
    assert.deepEqual(keys('sales', rec, ['not_a_number']), ['quantity', 'totalValue']);
  });

  it('a losing sale shows its value and cost, nothing else', () => {
    assert.deepEqual(keys('sales', sale, ['sale_loss']), ['totalValue', 'totalCost']);
  });

  it('no formula shows a formula choice and explains whether cost is recalculated', () => {
    const formulas = [{ id: 'f1', name: 'STANDARD', ingredients: [] }];
    const withUnits = planFields('production', { formulaUnits: 2 }, ['prod_no_formula'], today, { formulas });
    assert.deepEqual(withUnits.fields.map((f) => [f.key, f.type]), [['formulaId', 'select']]);
    assert.match(withUnits.notes[0], /recalculated/);
    assert.match(planFields('production', {}, ['prod_no_formula'], today, { formulas }).notes[0], /saved cost stays/);
    assert.deepEqual(keys('production', {}, ['prod_no_formula'], { formulas: [] }), []);
  });

  it('a payment of the wrong type or with a missing account gets a choice, from the real accounts', () => {
    const t = planFields('transactions', {}, ['txn_bad_type'], today).fields[0];
    assert.deepEqual(t.options.map((o) => o.value), ['IN', 'OUT']);
    const e = planFields('transactions', {}, ['txn_missing_entity'], today, { entities: [{ id: 'a', name: 'Ali' }, { id: 'b', name: 'Gone', isDeleted: true }] }).fields[0];
    assert.deepEqual(e.options, [{ value: 'a', label: 'Ali' }]);
    assert.deepEqual(keys('transactions', {}, ['txn_missing_entity'], { entities: [] }), []);
  });

  it('problems with nothing to type say so: a duplicate id offers a new id, a duplicate record offers delete', () => {
    const id = planFields('sales', sale, ['duplicate_id'], today);
    assert.deepEqual([id.fields.length, id.newId, id.deletable], [0, true, false]);
    const dup = planFields('sales', sale, ['duplicate_record'], today);
    assert.deepEqual([dup.fields.length, dup.deletable], [0, true]);
    assert.equal(planFields('inventory', {}, ['duplicate_record'], today).deletable, false);
  });

  it('never shows the same input twice when several problems share it', () => {
    assert.deepEqual(keys('sales', sale, ['sale_loss', 'sale_no_cost', 'sale_profit_mismatch']), ['profit', 'totalCost', 'totalValue']);
  });
});

describe('checking what was typed', () => {
  const cost = planFields('sales', sale, ['sale_no_cost'], today).fields;

  it('accepts a plain number in range and returns it as a number', () => {
    assert.deepEqual(validateValues(cost, { totalCost: '650' }, today), { ok: true, values: { totalCost: 650 } });
    assert.deepEqual(validateValues(cost, { totalCost: '1,250.5' }, today), { ok: true, values: { totalCost: 1250.5 } });
  });

  it('rejects blanks, text, scientific notation, zero and too-large values with a message', () => {
    for (const v of ['', 'abc', '1e12', '0', '99999999999999']) assert.equal(validateValues(cost, { totalCost: v }, today).ok, false, v);
    assert.match(validateValues(cost, { totalCost: 'abc' }, today).message, /Total cost/);
  });

  it('allows a negative profit, because a loss is a real profit figure', () => {
    const profit = planFields('sales', sale, ['sale_profit_mismatch'], today).fields;
    assert.deepEqual(validateValues(profit, { profit: '-250.5' }, today), { ok: true, values: { profit: -250.5 } });
    assert.equal(validateValues(profit, { profit: '--5' }, today).ok, false);
  });

  it('checks dates, choices and the received flag', () => {
    const date = planFields('sales', sale, ['future_date'], today).fields;
    assert.equal(validateValues(date, { date: '2031-01-01' }, today).ok, false);
    assert.equal(validateValues(date, { date: '' }, today).ok, false);
    assert.deepEqual(validateValues(date, { date: '2026-11-10' }, today), { ok: true, values: { date: '2026-11-10' } });
    const type = planFields('transactions', {}, ['txn_bad_type'], today).fields;
    assert.match(validateValues(type, { type: '' }, today).message, /Choose a type/);
    assert.equal(validateValues(type, { type: 'OUT' }, today).values.type, 'OUT');
    const rec = planFields('sales', sale, ['sale_cash_unreceived'], today).fields;
    assert.equal(validateValues(rec, { creditReceived: true }, today).values.creditReceived, true);
  });
});

describe('saving the typed values', () => {
  it('sets the typed fields and works out the profit itself when value or cost changed', () => {
    const next = applyValues('sales', { ...sale, totalCost: 0, profit: 1000 }, { totalCost: 650 });
    assert.deepEqual([next.totalCost, next.profit], [650, 350]);
    assert.equal(applyValues('sales', sale, { totalValue: 1200 }).profit, 400);
  });

  it('keeps a profit the user typed instead of overwriting it', () => {
    assert.equal(applyValues('sales', sale, { totalCost: 700, profit: 123 }).profit, 123);
  });

  it('does not change the original record', () => {
    const before = { ...sale };
    applyValues('sales', sale, { totalCost: 1 });
    assert.deepEqual(sale, before);
  });

  it('assigns a formula and recalculates production cost and profit from live inventory prices', () => {
    const formulas = [{ id: 'f1', name: 'STANDARD', additionalCost: 10, ingredients: [{ id: 'm1', name: 'Urea', cost: 50, quantity: 2 }] }];
    const inventory = [{ id: 'm1', name: 'Urea', cost: 100 }];
    const rec = { id: 'p', net: 20, formulaUnits: 2, totalSale: 1000, totalCost: 0, profit: 1000, formulaName: '' };
    const next = applyValues('production', rec, { formulaId: 'f1' }, { formulas, inventory });
    assert.deepEqual([next.formulaId, next.formulaName, next.totalCost, next.formulaCost, next.cp, next.profit], ['f1', 'STANDARD', 420, 420, 21, 580]);
    const noUnits = applyValues('production', { ...rec, formulaUnits: 0 }, { formulaId: 'f1' }, { formulas, inventory });
    assert.deepEqual([noUnits.formulaName, noUnits.totalCost, noUnits.profit], ['STANDARD', 0, 1000]);
  });

  it('assigns the chosen account to a payment', () => {
    const next = applyValues('transactions', { id: 't', entityId: 'gone', entityName: 'Old' }, { entityId: 'a' }, { entities: [{ id: 'a', name: 'Ali' }] });
    assert.deepEqual([next.entityId, next.entityName], ['a', 'Ali']);
  });

  it('the overview saves through the app save path and deletes with the app delete', () => {
    const src = readFileSync(new URL('../modules/overview.js', import.meta.url), 'utf8');
    assert.match(src, /await unifiedSave\(col, arr, record\)/);
    assert.match(src, /notifyDataChange\(col\);\n  triggerAutoSync\(\);/);
    assert.match(src, /sales: 'deleteTransactionFromOverlay'/);
  });
});
