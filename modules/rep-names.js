export function mergeRepNames(existing, data) {
  const out = [];
  const seen = new Set();
  const add = (n) => {
    const name = String(n == null ? '' : n).replace(/\s+/g, ' ').trim();
    const k = name.toLowerCase();
    if (!name || k === 'none' || seen.has(k)) return;
    seen.add(k);
    out.push(name);
  };
  (Array.isArray(existing) ? existing : []).forEach(add);
  const d = data || {};
  (Array.isArray(d.reps) ? d.reps : []).forEach(add);
  (Array.isArray(d.rep) ? d.rep : []).forEach((r) => r && add(r.salesRep));
  (Array.isArray(d.sales) ? d.sales : []).forEach((r) => r && add(r.salesRep));
  return out;
}
