const clean = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();

export function formulaFormIssue({ rows }) {
  const seen = new Set();
  for (const r of Array.isArray(rows) ? rows : []) {
    const label = clean(r.label);
    const qty = Number(r.qty);
    const hasQty = String(r.qty == null ? '' : r.qty).trim() !== '';
    if (!label && !hasQty) continue;
    const linked = !!(r.matId || r.formulaId);
    if (label && !linked) return `Pick "${label}" from the list, or clear that row.`;
    if (!label && hasQty) return 'A row has a quantity but no ingredient. Pick an ingredient or clear the row.';
    if (!(qty > 0)) return `Enter a quantity greater than 0 for ${label}, or clear that row.`;
    const id = r.formulaId ? `f:${r.formulaId}` : `m:${r.matId}`;
    if (seen.has(id)) return `${label} is listed twice. Combine it into one row.`;
    seen.add(id);
  }
  return '';
}
