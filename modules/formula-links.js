const _num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const _arr = (v) => (Array.isArray(v) ? v : []);
const _r6 = (v) => Math.round(v * 1e6) / 1e6;

export const LINK_KIND = 'formula';

export function isLink(ing) {
  return !!ing && ing.kind === LINK_KIND && !!ing.formulaId;
}

export function linkIngredient(formula, quantity) {
  return { id: `formula:${formula.id}`, kind: LINK_KIND, formulaId: String(formula.id), name: formula.name || 'Untitled', cost: 0, quantity: _num(quantity, 0) };
}

const _byId = (list, id) => _arr(list).find((f) => f && String(f.id) === String(id)) || null;

export function flattenFormula(formula, list, path = []) {
  const out = [];
  const problems = [];
  let extra = 0;
  const here = [...path, String(formula && formula.id)];
  const add = (m) => {
    const hit = out.find((x) => String(x.id) === String(m.id));
    if (hit) {
      hit.quantity = _r6(hit.quantity + m.quantity);
      if (m.via) hit.via = [...new Set([...(hit.via || []), ...m.via])];
    } else out.push(m);
  };
  _arr(formula && formula.ingredients).forEach((i) => {
    if (!i) return;
    if (!isLink(i)) {
      add({ id: i.id, name: i.name, cost: _num(i.cost, 0), quantity: _num(i.quantity, 0), ...(i.custom ? { custom: true } : {}) });
      return;
    }
    const q = _num(i.quantity, 0);
    if (q <= 0) return;
    const sub = _byId(list, i.formulaId);
    if (!sub) { problems.push({ type: 'missing', name: i.name || 'Formula' }); return; }
    if (here.includes(String(sub.id))) { problems.push({ type: 'cycle', name: sub.name || 'Formula' }); return; }
    const flat = flattenFormula(sub, list, here);
    flat.problems.forEach((p) => problems.push(p));
    const weight = flat.ingredients.reduce((s, m) => s + m.quantity, 0);
    if (weight <= 0) return;
    const scale = q / weight;
    flat.ingredients.forEach((m) => add({ ...m, quantity: _r6(m.quantity * scale), via: [sub.name || 'Formula'] }));
    extra += flat.additionalCost * scale;
  });
  const own = _num(formula && formula.additionalCost, 0);
  return { ingredients: out, ownAdditionalCost: own, extraCost: extra, additionalCost: own + extra, problems };
}

export function resolveAll(list) {
  return _arr(list).map((f) => {
    if (!f || !_arr(f.ingredients).some(isLink)) return f;
    const flat = flattenFormula(f, list);
    return { ...f, ingredients: flat.ingredients, additionalCost: flat.additionalCost };
  });
}

export function linksIn(formula) {
  return _arr(formula && formula.ingredients).filter(isLink).map((i) => String(i.formulaId));
}

export function formulaUsers(list, id) {
  return _arr(list).filter((f) => f && String(f.id) !== String(id) && linksIn(f).includes(String(id)));
}

export function dependsOn(list, formulaId, targetId, seen = new Set()) {
  if (String(formulaId) === String(targetId)) return true;
  if (seen.has(String(formulaId))) return false;
  seen.add(String(formulaId));
  const f = _byId(list, formulaId);
  return linksIn(f).some((id) => dependsOn(list, id, targetId, seen));
}

export function canLink(list, parentId, childId) {
  return String(parentId) !== String(childId) && !dependsOn(list, childId, parentId);
}

export function costWithInventory(items, inventory) {
  const inv = _arr(inventory);
  return items.map((i) => {
    let live = inv.find((x) => String(x.id) === String(i.id));
    if (!live && i.name) live = inv.find((x) => x.name && x.name.trim().toLowerCase() === String(i.name).trim().toLowerCase());
    const c = live ? Number(live.cost) : NaN;
    return { ...i, name: (live && live.name) || i.name, cost: Number.isFinite(c) && c > 0 ? c : _num(i.cost, 0) };
  });
}

export function describeFormula(formula, list, inventory) {
  const flat = flattenFormula(formula, list);
  const items = costWithInventory(flat.ingredients, inventory);
  let raw = 0;
  let weight = 0;
  items.forEach((i) => { raw += i.cost * i.quantity; weight += i.quantity; });
  const factor = _num(formula && formula.costAdjustmentFactor, 1) || 1;
  const perUnit = raw + flat.additionalCost;
  return { items, raw, weight, ownAdditionalCost: flat.ownAdditionalCost, extraCost: flat.extraCost, additionalCost: flat.additionalCost, perUnit, perKg: factor > 0 ? perUnit / factor : perUnit, problems: flat.problems };
}

export function linkedPerKg(sub, list, inventory) {
  const d = describeFormula(sub, list, inventory);
  return d.weight > 0 ? d.perUnit / d.weight : 0;
}
