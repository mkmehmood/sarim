import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flattenFormula, resolveAll, formulaUsers, canLink, dependsOn, describeFormula, linkedPerKg, linkIngredient, isLink } from '../modules/formula-links.js';
import { feedsFromFormulas } from '../modules/formula-pools.js';
import { resolveSelectedFormula } from '../modules/link-graph.js';

const inventory = [{ id: 'm1', name: 'Urea', cost: 120, quantity: 500 }, { id: 'm2', name: 'DAP', cost: 90, quantity: 50 }];
const base = { id: 'base', name: 'Base', additionalCost: 10, costAdjustmentFactor: 1, ingredients: [
  { id: 'm1', name: 'Urea', cost: 100, quantity: 6 },
  { id: 'm2', name: 'DAP', cost: 90, quantity: 4 },
] };
const top = { id: 'top', name: 'Top', additionalCost: 3, costAdjustmentFactor: 2, ingredients: [
  { id: 'm1', name: 'Urea', cost: 100, quantity: 2 },
  { ...linkIngredient(base, 5) },
] };
const list = [base, top];

describe('live sub-formula links', () => {
  it('recognises link ingredients', () => {
    assert.equal(isLink(linkIngredient(base, 1)), true);
    assert.equal(isLink({ id: 'm1', quantity: 1 }), false);
    assert.deepEqual(linkIngredient(base, '2.5'), { id: 'formula:base', kind: 'formula', formulaId: 'base', name: 'Base', cost: 0, quantity: 2.5 });
  });

  it('flattens the linked formula into raw materials scaled to the kg used, merging with existing rows', () => {
    const f = flattenFormula(top, list);
    assert.deepEqual(f.ingredients.map((i) => [i.id, i.quantity]), [['m1', 5], ['m2', 2]]);
    assert.equal(f.ingredients.reduce((s, i) => s + i.quantity, 0), 7);
  });

  it('tags materials that come from a linked formula, merged per material', () => {
    const f = flattenFormula(top, list);
    assert.deepEqual(f.ingredients.map((i) => [i.id, i.via || null]), [['m1', ['Base']], ['m2', ['Base']]]);
    const only = flattenFormula({ id: 'x', ingredients: [{ id: 'm1', name: 'Urea', cost: 1, quantity: 1 }, linkIngredient(base, 10)] }, list);
    assert.equal(only.ingredients[0].quantity, 7);
    const plain = flattenFormula({ id: 'y', ingredients: [{ id: 'm9', name: 'Zinc', cost: 1, quantity: 1 }] }, list);
    assert.equal(plain.ingredients[0].via, undefined);
  });

  it('carries the linked formula\'s additional cost in proportion', () => {
    const f = flattenFormula(top, list);
    assert.equal(f.ownAdditionalCost, 3);
    assert.equal(f.extraCost, 5);
    assert.equal(f.additionalCost, 8);
  });

  it('follows changes made to the linked formula', () => {
    const changed = [{ ...base, ingredients: [{ id: 'm1', name: 'Urea', cost: 100, quantity: 1 }, { id: 'm2', name: 'DAP', cost: 90, quantity: 1 }], additionalCost: 0 }, top];
    const f = flattenFormula(top, changed);
    assert.deepEqual(f.ingredients.map((i) => [i.id, i.quantity]), [['m1', 4.5], ['m2', 2.5]]);
    assert.equal(f.additionalCost, 3);
  });

  it('works through several levels', () => {
    const mid = { id: 'mid', name: 'Mid', ingredients: [linkIngredient(top, 14)] };
    const f = flattenFormula(mid, [base, top, mid]);
    assert.deepEqual(f.ingredients.map((i) => [i.id, i.quantity]), [['m1', 10], ['m2', 4]]);
  });

  it('skips a missing or circular link and reports it', () => {
    const a = { id: 'a', name: 'A', ingredients: [{ id: 'm1', name: 'Urea', cost: 1, quantity: 1 }, linkIngredient({ id: 'b', name: 'B' }, 1)] };
    const b = { id: 'b', name: 'B', ingredients: [linkIngredient(a, 1), linkIngredient({ id: 'gone', name: 'Gone' }, 1)] };
    const f = flattenFormula(a, [a, b]);
    assert.deepEqual(f.ingredients.map((i) => i.id), ['m1']);
    assert.deepEqual(f.problems.map((p) => p.type).sort(), ['cycle', 'missing']);
  });

  it('refuses links that would create a loop', () => {
    assert.equal(canLink(list, 'base', 'top'), false);
    assert.equal(canLink(list, 'top', 'base'), true);
    assert.equal(canLink(list, 'base', 'base'), false);
    assert.equal(dependsOn(list, 'top', 'base'), true);
    assert.equal(dependsOn(list, 'base', 'top'), false);
  });

  it('lists the formulas that link a formula', () => {
    assert.deepEqual(formulaUsers(list, 'base').map((f) => f.id), ['top']);
    assert.deepEqual(formulaUsers(list, 'top'), []);
  });

  it('costs the formula from live inventory prices, including the linked part', () => {
    const d = describeFormula(top, list, inventory);
    assert.equal(d.weight, 7);
    assert.equal(d.raw, 5 * 120 + 2 * 90);
    assert.equal(d.perUnit, 780 + 8);
    assert.equal(d.perKg, (780 + 8) / 2);
    const b = describeFormula(base, list, inventory);
    assert.equal(linkedPerKg(base, list, inventory), b.perUnit / 10);
  });

  it('resolveAll leaves plain formulas untouched and flattens linked ones', () => {
    const out = resolveAll(list);
    assert.equal(out[0], base);
    assert.deepEqual(out[1].ingredients.map((i) => i.id), ['m1', 'm2']);
    assert.equal(out[1].additionalCost, 8);
    assert.equal(out[1].id, 'top');
  });

  it('feeds production defaults and costs with the flattened materials', () => {
    const f = feedsFromFormulas(list);
    assert.deepEqual(f.defaults.top.map((i) => [i.id, i.quantity]), [['m1', 5], ['m2', 2]]);
    assert.equal(f.costs.top, 8);
    assert.equal(f.adjustment.top, 2);
    assert.deepEqual(f.defaults.base.map((i) => [i.id, i.quantity]), [['m1', 6], ['m2', 4]]);
  });

  it('the production resolver gives flattened materials with live stock and the combined additional cost', () => {
    const sel = resolveSelectedFormula({ list, stores: [{ key: 's1', formulaId: 'top' }], inventory }, 's1');
    assert.deepEqual(sel.ingredients.map((i) => [i.id, i.quantity, i.cost, i.stock]), [['m1', 5, 120, 500], ['m2', 2, 90, 50]]);
    assert.equal(sel.additionalCost, 8);
  });

  it('the editor links a formula, blocks loops and blocks deleting a linked formula', () => {
    const ed = readFileSync(new URL('../screens/formula-store-edit.screen.html', import.meta.url), 'utf8');
    assert.match(ed, /data-formula="\$\{esc\(String\(f\.id\)\)\}"/);
    assert.match(ed, /canLink\(_ctx\.list, _editingId, f\.id\)/);
    assert.match(ed, /can't be linked back/);
    assert.match(ed, /Remove that link first/);
    assert.match(ed, /All materials in this formula/);
    assert.match(ed, /linkIngredient\(\{ id: inp\.dataset\.formulaId/);
  });
});
