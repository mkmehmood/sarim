const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (v) => Math.round(num(v) * 100) / 100;
const r6 = (v) => Math.round(num(v) * 1e6) / 1e6;

export const normMaterialName = (s) => String(s == null ? '' : s).trim().toLowerCase();

export const isPurchaseLot = (rec) => !!(rec && rec.isPurchaseLot === true);

export function materialRecords(inventory) {
  return (Array.isArray(inventory) ? inventory : []).filter((m) => m && !m.deletedAt && !isPurchaseLot(m));
}

export function findMaterialByName(inventory, name) {
  const key = normMaterialName(name);
  if (!key) return null;
  return materialRecords(inventory).find((m) => normMaterialName(m.name) === key) || null;
}

export function searchMaterials(inventory, query) {
  const key = normMaterialName(query);
  const all = materialRecords(inventory);
  const list = key ? all.filter((m) => normMaterialName(m.name).includes(key)) : all;
  return list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
}

export function purchasesOf(inventory, materialId) {
  const id = String(materialId);
  return (Array.isArray(inventory) ? inventory : [])
    .filter((r) => r && !r.deletedAt && isPurchaseLot(r) && String(r.materialRefId) === id)
    .sort((a, b) => String(b.purchaseDate || '').localeCompare(String(a.purchaseDate || '')) || num(b.timestamp) - num(a.timestamp));
}

export function collectedKg(material) {
  if (!material) return 0;
  const c = Number(material.collectedKg);
  return Number.isFinite(c) && c >= 0 ? r6(c) : r6(num(material.quantity));
}

export function pendingOf(rec) {
  if (!rec || !rec.supplierId) return 0;
  if (rec.paymentStatus === 'paid') return 0;
  return Math.max(0, r2(rec.totalPayable));
}

export function materialPending(material, lots) {
  return r2(pendingOf(material) + (lots || []).reduce((s, l) => s + pendingOf(l), 0));
}

export function purchaseKgOf(lot) {
  return r6(num(lot && lot.purchaseKg));
}

export function applyPurchaseDelta(material, delta) {
  const dKg = num(delta.deltaKg);
  const dAmt = num(delta.deltaAmount);
  const nextQty = r6(num(material.quantity) + dKg);
  if (nextQty < -1e-6) return { ok: false, short: r6(-nextQty) };
  const baseCollected = collectedKg(material);
  const stockValue = num(material.quantity) * num(material.cost) + dAmt;
  const qty = Math.max(0, nextQty);
  material.quantity = qty;
  material.collectedKg = Math.max(0, r6(baseCollected + dKg));
  if (qty > 1e-9) material.cost = stockValue / qty;
  else if (num(delta.costPerKg) > 0) material.cost = num(delta.costPerKg);
  material.unit = 'kg';
  material.totalValue = qty * num(material.cost);
  if (delta.conversionFactor > 0) {
    material.conversionFactor = delta.conversionFactor;
    material.purchaseUnitName = delta.unitName || material.purchaseUnitName || '';
    material.purchaseCost = num(delta.costPerUnit);
    material.purchaseQuantity = delta.conversionFactor !== 1 ? qty / delta.conversionFactor : qty;
  }
  return { ok: true };
}

export function buildPurchaseLot(material, p) {
  const kg = r6(num(p.units) * num(p.conversionFactor));
  const amount = r2(num(p.units) * num(p.costPerUnit));
  return {
    id: p.id,
    name: `${material.name} \u00b7 ${p.date}`,
    isPurchaseLot: true,
    materialRefId: material.id,
    materialName: material.name,
    quantity: 0,
    unit: 'kg',
    cost: num(p.conversionFactor) > 0 ? num(p.costPerUnit) / num(p.conversionFactor) : num(p.costPerUnit),
    totalValue: amount,
    purchaseKg: kg,
    purchaseQuantity: num(p.units),
    purchaseUnitName: p.unitName || '',
    conversionFactor: num(p.conversionFactor),
    purchaseCost: num(p.costPerUnit),
    purchaseDate: p.date,
    paymentStatus: 'pending'
  };
}
