import { fmtNum } from './finance.js';

const ICONS = {
  ok: '<path d="M5 12.5l4.2 4.2L19 7" />',
  low: '<path d="M12 8v5M12 16.6v.1" /><path d="M10.3 4.3L2.6 17.6A2 2 0 0 0 4.3 20.6h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />',
  short: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />',
};

const n = (v) => (Number.isFinite(v) ? v : 0);
const kg = (v) => `${fmtNum(n(v))} kg`;

export function inventoryNoteState({ available, quantity }) {
  const have = n(available);
  const want = n(quantity);
  if (want - have > 1e-6) return 'short';
  if (have < want * 1.5) return 'low';
  return 'ok';
}

export function inventoryNoteModel({ available, quantity, production, returns, sold }) {
  const have = n(available);
  const want = n(quantity);
  const tone = inventoryNoteState({ available: have, quantity: want });
  let title;
  let detail;
  if (tone === 'short') {
    title = 'Not enough stock';
    detail = `You need ${kg(want)} but only ${kg(Math.max(have, 0))} is in stock. Short by ${kg(want - have)}.`;
  } else if (tone === 'low') {
    title = `${kg(have)} in stock`;
    detail = `Running low: ${kg(have - want)} will be left after this sale.`;
  } else {
    title = `${kg(have)} in stock`;
    detail = want > 0 ? `${kg(have - want)} will be left after this sale.` : 'Available for this date and supply.';
  }
  return {
    tone,
    title,
    detail,
    stats: [
      ['Produced', kg(production)],
      ['Returned', kg(returns)],
      ['Sold', kg(sold)],
    ],
  };
}

export function inventoryNoteHtml(model) {
  const stats = model.stats
    .map(([label, value]) => `<span class="inv-stat"><span class="inv-stat-label">${label}</span><span class="inv-stat-value">${value}</span></span>`)
    .join('');
  return `<span class="inv-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[model.tone]}</svg></span>`
    + `<span class="inv-body"><span class="inv-title">${model.title}</span><span class="inv-detail">${model.detail}</span><span class="inv-stats">${stats}</span></span>`;
}
