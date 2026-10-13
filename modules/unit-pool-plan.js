import { buildUnitPools } from './store-keys.js';
export { buildUnitPools };

// Pure: every factory entry gets `formulaType` and every production entry gets
// `formulaStore` set to the shared unit-pool key of the store/slot it belongs to.
export function planUnitPoolMigration(production, factory, poolOf, now) {
  const fix = (rec, field) => {
    if (!rec) return null;
    const source = rec[field] || rec.store;
    if (!source) return null;
    const next = poolOf(source);
    return rec[field] === next ? null : { ...rec, [field]: next, updatedAt: now };
  };
  const pick = (list, field) => (Array.isArray(list) ? list : []).map(r => fix(r, field)).filter(Boolean);
  return { production: pick(production, 'formulaStore'), factory: pick(factory, 'formulaType') };
}

