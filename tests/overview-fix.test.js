import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planFixes, applyFix, parseInput } from '../modules/overview-fix.js';

const today = '2026-11-16';
const sale = { id: 's1', date: '2026-11-01', quantity: 10, unitPrice: 100, totalValue: 1000, totalCost: 800, profit: 900 };
const ids = (col, rec, codes) => planFixes(col, rec, codes, today).map((f) => f.id);
const fix = (col, rec, codes, id) => planFixes(col, rec, codes, today).find((f) => f.id === id);

describe('fix planner', () => {
  it('recalculates a mismatched sale profit', () => {
    const f = fix('sales', sale, ['sale_profit_mismatch'], 'profit');
    assert.deepEqual(applyFix(sale, f).profit, 200);
    assert.equal(sale.profit, 900);
  });

  it('offers both ways to reconcile a sale total, and keeps profit consistent', () => {
    const rec = { ...sale, totalValue: 1500, profit: 700 };
    assert.deepEqual(ids('sales', rec, ['sale_total_mismatch']), ['total_from_price', 'price_from_total', 'delete', 'open']);
    const a = applyFix(rec, fix('sales', rec, ['sale_total_mismatch'], 'total_from_price'));
    assert.deepEqual([a.totalValue, a.profit], [1000, 200]);
    const b = applyFix(rec, fix('sales', rec, ['sale_total_mismatch'], 'price_from_total'));
    assert.equal(b.unitPrice, 150);
  });

  it('asks for the missing cost and recomputes profit from it', () => {
    const rec = { ...sale, totalCost: 0, profit: 1000 };
    const f = fix('sales', rec, ['sale_no_cost'], 'cost');
    assert.equal(parseInput(f, '').ok, false);
    assert.equal(parseInput(f, '0').ok, false);
    const p = parseInput(f, '650');
    assert.equal(p.ok, true);
    const next = applyFix(rec, f, p.value);
    assert.deepEqual([next.totalCost, next.profit], [650, 350]);
  });

  it('fixes dates, received flags, quantities and values', () => {
    assert.equal(applyFix(sale, fix('sales', sale, ['bad_date'], 'date'), '2026-10-01').date, '2026-10-01');
    assert.equal(fix('sales', sale, ['future_date'], 'date').input.value, today);
    assert.equal(parseInput(fix('sales', sale, ['bad_date'], 'date'), 'nope').ok, false);
    assert.equal(applyFix(sale, fix('sales', sale, ['sale_cash_unreceived'], 'received')).creditReceived, true);
    assert.equal(parseInput(fix('sales', sale, ['sale_bad_qty'], 'qty'), '-3').ok, false);
    const neg = applyFix({ ...sale, totalValue: -5 }, fix('sales', sale, ['sale_negative_value'], 'value'), 900);
    assert.deepEqual([neg.totalValue, neg.profit], [900, 100]);
  });

  it('offers a field fix for every value that is not a number', () => {
    const rec = { id: 'x', quantity: 'abc', totalValue: 'n/a', totalCost: 1, profit: 1, unitPrice: 1 };
    assert.deepEqual(ids('sales', rec, ['not_a_number']).slice(0, 2), ['num_quantity', 'num_totalValue']);
    assert.equal(applyFix(rec, fix('sales', rec, ['not_a_number'], 'num_quantity'), 7).quantity, 7);
  });

  it('fixes production, payments, expenses and stock', () => {
    const prod = { id: 'p', net: 5, totalSale: 100, totalCost: 40, profit: 10 };
    assert.equal(applyFix(prod, fix('production', prod, ['prod_profit_mismatch'], 'profit')).profit, 60);
    assert.equal(applyFix({ type: 'X' }, fix('transactions', {}, ['txn_bad_type'], 'type_out')).type, 'OUT');
    assert.equal(applyFix({ amount: 0 }, fix('transactions', {}, ['txn_bad_amount'], 'amount'), 5).amount, 5);
    assert.equal(parseInput(fix('expenses', {}, ['exp_bad_amount'], 'amount'), '0').ok, false);
    assert.equal(parseInput(fix('transactions', {}, ['txn_bad_amount'], 'amount'), '0').ok, true);
    assert.equal(parseInput(fix('transactions', {}, ['txn_bad_amount'], 'amount'), '-1').ok, false);
    assert.equal(applyFix({ quantity: -3 }, fix('inventory', {}, ['inv_negative_qty'], 'stock'), 0).quantity, 0);
    assert.equal(applyFix({ cost: 0 }, fix('inventory', {}, ['inv_bad_cost'], 'invcost'), 4).cost, 4);
  });

  it('assigns a formula to production with none, optionally recalculating cost and profit', () => {
    const formulas = [{ id: 'f1', name: 'STANDARD', additionalCost: 10, ingredients: [{ id: 'm1', name: 'Urea', cost: 50, quantity: 2 }] }];
    const inventory = [{ id: 'm1', name: 'Urea', cost: 100 }];
    const rec = { id: 'p', net: 20, formulaUnits: 2, totalSale: 1000, totalCost: 0, profit: 1000, formulaName: '' };
    const list = planFixes('production', rec, ['prod_no_formula'], today, { formulas, inventory });
    assert.deepEqual(list.map((f) => f.id), ['formula_cost', 'formula_only', 'delete', 'open']);
    const f = list[0];
    assert.equal(parseInput(f, '').ok, false);
    assert.equal(parseInput(f, 'nope').ok, false);
    assert.deepEqual(parseInput(f, 'f1'), { ok: true, value: 'f1' });
    const next = applyFix(rec, f, 'f1');
    assert.deepEqual([next.formulaId, next.formulaName, next.totalCost, next.formulaCost, next.cp, next.profit], ['f1', 'STANDARD', 420, 420, 21, 580]);
    const only = applyFix(rec, list[1], 'f1');
    assert.deepEqual([only.formulaName, only.totalCost, only.profit], ['STANDARD', 0, 1000]);
  });

  it('only offers the label fix when units are unknown, and nothing when there are no formulas', () => {
    const formulas = [{ id: 'f1', name: 'A', ingredients: [] }];
    assert.deepEqual(planFixes('production', { id: 'p', net: 5 }, ['prod_no_formula'], today, { formulas }).map((f) => f.id).slice(0, 1), ['formula_only']);
    assert.equal(planFixes('production', { id: 'p', net: 5 }, ['prod_no_formula'], today, { formulas: [] }).some((f) => f.id.startsWith('formula')), false);
  });

  it('offers a new id for duplicate ids and deletion for duplicate copies', () => {
    assert.ok(ids('sales', sale, ['duplicate_id']).includes('newid'));
    assert.equal(fix('sales', sale, ['duplicate_record'], 'delete').label, 'Delete this copy');
    assert.equal(fix('sales', sale, ['sale_no_cost'], 'delete').danger, true);
  });

  it('never offers deleting stock items, and always offers opening the screen', () => {
    assert.equal(ids('inventory', {}, ['inv_negative_qty']).includes('delete'), false);
    for (const col of ['sales', 'production', 'transactions', 'expenses', 'inventory']) assert.ok(ids(col, {}, ['bad_date']).includes('open'));
  });

  it('the overview opens this dialog from a flagged row and saves through the app save path', () => {
    const src = readFileSync(new URL('../modules/overview.js', import.meta.url), 'utf8');
    assert.match(src, /\[data-fix\]/);
    assert.match(src, /openDialog\(\{/);
    assert.match(src, /await unifiedSave\(col, arr, record\)/);
    assert.match(src, /notifyDataChange\(col\);\n  triggerAutoSync\(\);/);
    assert.match(src, /sales: 'deleteTransactionFromOverlay'/);
  });
});
