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
export function planCorrection(formula, mixed, remaining, capacity) {
  const ings = formulaIngredients(formula);
  const uw = unitWeight(formula);
  const amounts = new Map((mixed || []).map((m) => [String(m.id), num(m.amount)]));
  const mixedTotal = ings.reduce((s, i) => s + (amounts.get(i.id) || 0), 0);
  if (!ings.length || mixedTotal <= 0) return { ok: false, error: 'empty', rows: [] };
  const left = num(remaining);
  if (left > mixedTotal + EPS) return { ok: false, error: 'remaining-too-large', rows: [] };
  const keep = left > 0 ? left / mixedTotal : 1;
  const present = ings.map((i) => (amounts.get(i.id) || 0) * keep);
  let scale = 0;
  let driver = null;
  ings.forEach((i, idx) => {
    const s = present[idx] / i.quantity;
    if (s > scale + EPS) { scale = s; driver = i; }
  });
  const rows = ings.map((i, idx) => {
    const target = i.quantity * scale;
    const add = Math.max(0, target - present[idx]);
    return { id: i.id, name: i.name, formulaQty: i.quantity, present: present[idx], target, add: add < EPS ? 0 : add };
  });
  const currentWeight = present.reduce((s, p) => s + p, 0);
  const addTotal = rows.reduce((s, r) => s + r.add, 0);
  const finalWeight = currentWeight + addTotal;
  const cap = num(capacity);
  return {
    ok: true,
    scale,
    driver: driver ? driver.name : '',
    rows,
    currentWeight,
    addTotal,
    finalWeight,
    finalUnits: uw > 0 ? finalWeight / uw : 0,
    exceedsCapacity: cap > 0 && finalWeight > cap + EPS,
  };
}
