import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../modules/factory.js', import.meta.url), 'utf8');
function grab(name) {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const open = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1).replace('export ', '');
  }
  throw new Error('unbalanced ' + name);
}
const resolveLive = src.slice(src.indexOf('export function resolveLiveCost('), src.indexOf('export async function getCostPerUnit(')).replace('export ', '');

function build(data, selected) {
  const sqliteStore = { get: async (k) => data[k] };
  const getSelectedFormula = async () => selected || null;
  const ensureArray = (v) => Array.isArray(v) ? v : [];
  const getStorePool = async (s) => ({ zubair: 'F1', mahmood: 'F1', asaan: 'F2' })[s] || '';
  const getFormulaNames = async () => ({ F1: 'Standard', F2: 'Asaan' });
  const body = `${resolveLive}\n${grab('calculateDynamicCost')}\nreturn { calculateDynamicCost, resolveLiveCost };`;
  return new Function('sqliteStore', 'ensureArray', 'getSelectedFormula', 'getStorePool', 'getFormulaNames', body)(sqliteStore, ensureArray, getSelectedFormula, getStorePool, getFormulaNames);
}
const data = {
  inventory: [{ id: 'a', name: 'Tobacco', cost: 120 }, { id: 'b', name: 'Lime', cost: 0 }],
};

const stdFormula = { type: 'standard', name: 'Standard', additionalCost: 30, ingredients: [{ id: 'a', name: 'Tobacco', quantity: 10, cost: 100 }, { id: 'b', name: 'Lime', quantity: 2, cost: 50 }] };

describe('production tab cost price', () => {
  const { calculateDynamicCost } = build(data, stdFormula);
  it('unit cost and total formula cost show before any weight is entered', async () => {
    const c = await calculateDynamicCost('zubair', 2, 0);
    assert.equal(c.costPerUnit, 10 * 120 + 2 * 50 + 30);
    assert.equal(c.totalFormulaCost, 2 * (10 * 120 + 2 * 50 + 30));
    assert.equal(c.dynamicCostPerKg, 0);
    assert.equal(c.formulaStore, 'F1');
    assert.equal(c.formulaMaterials.length, 2);
  });
  it('cost per kg is the total formula cost over the net weight once a weight exists', async () => {
    const c = await calculateDynamicCost('zubair', 2, 40);
    assert.equal(c.dynamicCostPerKg, (2 * 1330) / 40);
    assert.equal(c.rawMaterialCost, 1300);
  });
  it('a material whose live cost is 0 keeps the cost saved in the formula', async () => {
    const c = await calculateDynamicCost('zubair', 1, 10);
    assert.equal(c.formulaMaterials.find(m => m.id === 'b').cost, 50);
  });
  it('zero formula units or no formula costs nothing and never divides by zero', async () => {
    assert.equal((await calculateDynamicCost('zubair', 0, 10)).dynamicCostPerKg, 0);
    const none = await build(data, null).calculateDynamicCost('asaan', 1, 10);
    assert.deepEqual([none.costPerUnit, none.totalFormulaCost, none.dynamicCostPerKg, none.formulaMaterials], [0, 0, 0, []]);
    for (const n of [-5, NaN]) assert.ok(Number.isFinite((await calculateDynamicCost('zubair', 1, n)).dynamicCostPerKg));
  });
  it('the display keeps per-kg profit at 0 until a weight is entered and recomputes after a save', () => {
    const shown = src.slice(src.indexOf('export async function calculateDynamicProductionCost('), src.indexOf('export async function updateProductionCostOnStoreChange('));
    assert.ok(shown.includes("net > 0 ? salePrice - costData.dynamicCostPerKg : 0"));
    const core = readFileSync(new URL('../modules/utilities-core.js', import.meta.url), 'utf8');
    assert.ok(core.includes("await window.calculateDynamicProductionCost();\ncalculateNetCash();"));
  });
});

describe('production cost when the formula lives only in the formula store', () => {
  const selected = { type: 'standard', name: 'STANDARD', additionalCost: 750, ingredients: [{ id: 'g', name: 'Guar', quantity: 0.22, cost: 680 }, { id: 't', name: 'Tobacco', quantity: 0.48, cost: 416.67 }] };
  const { calculateDynamicCost } = build({ inventory: [] }, selected);
  it('is not zero when the formula only exists in the formula store', async () => {
    const c = await calculateDynamicCost('zubair', 4, 50.5);
    const unit = 0.22 * 680 + 0.48 * 416.67 + 750;
    assert.ok(c.costPerUnit > 0);
    assert.equal(c.costPerUnit, unit);
    assert.equal(c.dynamicCostPerKg, (unit * 4) / 50.5);
    assert.equal(c.formulaName, 'STANDARD');
  });
});
