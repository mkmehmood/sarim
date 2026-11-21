const upper = (n) => String(n == null ? '' : n).replace(/\s+/g, ' ').trim().toUpperCase();

export function fillEmptyRepList(current, data) {
  const cur = Array.isArray(current) ? current.filter((n) => upper(n)) : [];
  if (cur.length) return cur;
  const out = [];
  const seen = new Set();
  const add = (n) => {
    const name = upper(n);
    if (!name || name === 'NONE' || seen.has(name)) return;
    seen.add(name);
    out.push(name);
  };
  const d = data || {};
  (Array.isArray(d.reps) ? d.reps : []).forEach(add);
  if (out.length) return out;
  (Array.isArray(d.rep) ? d.rep : []).forEach((r) => r && add(r.salesRep));
  (Array.isArray(d.sales) ? d.sales : []).forEach((r) => r && add(r.salesRep));
  return out;
}
