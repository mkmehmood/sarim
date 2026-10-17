const EPS = 1e-9;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? n : 0; };
export function formulaIngredients(formula) {
  return (Array.isArray(formula && formula.ingredients) ? formula.ingredients : [])
    .map((i) => ({ id: String(i.id), name: i.name || 'Untitled', quantity: num(i.quantity) }))
    .filter((i) => i.quantity > 0);
}
export function unitWeight(formula) {
  return formulaIngredients(formula).reduce((s, i) => s + i.quantity, 0);
}
export function planBatch(formula, mode, value, ingredientId) {
  const ings = formulaIngredients(formula);
  const uw = unitWeight(formula);
  const v = num(value);
  let units = 0;
  if (ings.length && v > 0) {
    if (mode === 'units') units = v;
    else if (mode === 'total') units = v / uw;
    else if (mode === 'ingredient') {
      const pick = ings.find((i) => i.id === String(ingredientId)) || ings[0];
      units = v / pick.quantity;
    }
  }
  const rows = ings.map((i) => ({ id: i.id, name: i.name, perUnit: i.quantity, total: i.quantity * units }));
  return { units, unitWeight: uw, totalWeight: units * uw, rows };
}
export function planCorrection(formula, opts) {
  const o = opts || {};
  const ings = formulaIngredients(formula);
  const uw = unitWeight(formula);
  const original = num(o.original);
  if (!ings.length || original <= 0) return { ok: false, error: 'empty', rows: [] };
  const used = Math.max(0, parseFloat(o.used) || 0);
  const remaining = original - used;
  if (remaining <= EPS) return { ok: false, error: 'nothing-left', rows: [] };
  const actual = o.actual || {};
  const actualTotal = ings.reduce((sum, i) => sum + num(actual[i.id]), 0);
  const present = ings.map((i) => (actualTotal > 0 ? (num(actual[i.id]) / actualTotal) * remaining : (i.quantity / uw) * remaining));
  let minScale = 0;
  ings.forEach((i, idx) => { minScale = Math.max(minScale, present[idx] / i.quantity); });
  let scale = minScale;
  let manualId = '';
  const m = o.manual;
  const k = m ? ings.findIndex((i) => i.id === String(m.id)) : -1;
  if (k >= 0 && Number.isFinite(parseFloat(m.add))) {
    scale = Math.max(minScale, (present[k] + Math.max(0, parseFloat(m.add))) / ings[k].quantity);
    manualId = ings[k].id;
  }
  const rows = ings.map((i, idx) => {
    const target = i.quantity * scale;
    const add = Math.max(0, target - present[idx]);
    return { id: i.id, name: i.name, present: present[idx], target, add: add < EPS ? 0 : add };
  });
  const requiredTotal = rows.reduce((sum, r) => sum + r.target, 0);
  const addTotal = rows.reduce((sum, r) => sum + r.add, 0);
  return {
    ok: true,
    remaining,
    scale,
    minScale,
    manualId,
    adjusted: scale > minScale + EPS,
    rows,
    requiredTotal,
    addTotal,
  };
}
