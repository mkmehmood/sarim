import { fmtNum } from './finance.js';

const n = (v) => (Number.isFinite(v) ? v : 0);
const kg = (v) => `${fmtNum(n(v))} kg`;

export function inventoryTone(available, quantity) {
  const have = n(available);
  const want = n(quantity);
  if (want - have > 1e-6) return 'short';
  if (have < want * 1.5) return 'low';
  return 'ok';
}

export function inventoryTileModel({ available, quantity, production, returns, sold }) {
  const have = n(available);
  const want = n(quantity);
  const tone = inventoryTone(have, want);
  const left = Math.max(have - want, 0);
  let note;
  if (tone === 'short') note = `Over by ${kg(want - have)}`;
  else if (tone === 'low') note = `Only ${kg(left)} left`;
  else note = want > 0 ? `${kg(left)} left` : 'Ready to sell';
  let used = 0;
  if (want > 0) used = have > 0 ? Math.min(100, (want / have) * 100) : 100;
  return {
    tone,
    figure: fmtNum(Math.max(have, 0)),
    note,
    used: Math.round(used * 10) / 10,
    stats: [['Produced', kg(production)], ['Returned', kg(returns)], ['Sold', kg(sold)]],
    summary: `${kg(Math.max(have, 0))} in stock. ${note}.`,
  };
}

const CHEVRON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>';

export function inventoryTileHtml(m) {
  const stats = m.stats
    .map(([label, value]) => `<span class="stock-stat"><span class="stock-stat-label">${label}</span><span class="stock-stat-value">${value}</span></span>`)
    .join('');
  return `<span class="stock-row"><span class="stock-dot"></span><span class="stock-text">In Stock: <span class="stock-figure">${m.figure} kg</span></span><span class="stock-note">${m.note}</span><span class="stock-chev" aria-hidden="true">${CHEVRON}</span></span>`
    + `<span class="stock-detail">${stats}</span>`
    + `<span class="stock-rail" role="img" aria-label="${m.summary}"><i style="--used: ${m.used}%"></i></span>`;
}
