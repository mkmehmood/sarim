const isLive = (r) => r && !r.deletedAt;

export function planCalcRelink(calculator, sales) {
  const saleById = new Map();
  (sales || []).forEach(s => { if (isLive(s) && s.id != null) saleById.set(String(s.id), s); });
  const bySeller = new Map();
  (calculator || []).forEach(e => {
    if (!isLive(e) || !e.seller || !e.date) return;
    if (!bySeller.has(e.seller)) bySeller.set(e.seller, []);
    bySeller.get(e.seller).push(e);
  });
  const moves = [];
  for (const [seller, list] of bySeller) {
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0)));
    for (const entry of list) {
      let prevDate = null;
      for (const x of list) if (x.date < entry.date && (prevDate === null || x.date > prevDate)) prevDate = x.date;
      for (const id of Array.isArray(entry.linkedSalesIds) ? entry.linkedSalesIds : []) {
        const sale = saleById.get(String(id));
        if (!sale || sale.customerName !== seller || !sale.date) continue;
        if (sale.date <= entry.date && (prevDate === null || sale.date > prevDate)) continue;
        const target = list.find(x => x.date >= sale.date);
        if (!target || target.date === entry.date) continue;
        moves.push({ saleId: String(id), from: entry.id, to: target.id });
      }
    }
  }
  return moves;
}

export function applyCalcRelink(calculator, moves, stamp) {
  const byId = new Map((calculator || []).map(e => [String(e.id), e]));
  const changed = new Set();
  for (const m of moves) {
    const from = byId.get(String(m.from)), to = byId.get(String(m.to));
    if (!from || !to || !Array.isArray(from.linkedSalesIds)) continue;
    const at = from.linkedSalesIds.findIndex(i => String(i) === m.saleId);
    if (at < 0) continue;
    from.linkedSalesIds.splice(at, 1);
    if (!Array.isArray(to.linkedSalesIds)) to.linkedSalesIds = [];
    if (!to.linkedSalesIds.some(i => String(i) === m.saleId)) to.linkedSalesIds.push(m.saleId);
    changed.add(String(from.id)); changed.add(String(to.id));
  }
  changed.forEach(id => { const e = byId.get(id); if (e && typeof stamp === 'function') e.updatedAt = stamp(); });
  return [...changed];
}
