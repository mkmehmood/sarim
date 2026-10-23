
const _esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function sxTile(label, value, tone = 'plain', opts = {}) {
  const id = opts.id ? ` id="${_esc(opts.id)}"` : '';
  const wide = opts.wide ? ' sx-tile--wide' : '';
  const sub = opts.sub ? `<span class="sx-tile-sub">${_esc(opts.sub)}</span>` : '';
  return `<div class="sx-tile sx-tone-${tone}${wide}"><span class="sx-tile-label">${_esc(label)}</span><span class="sx-tile-value"${id}>${value}</span>${sub}</div>`;
}

export function sxGrid(tilesHtml, cols = 2) {
  return `<div class="sx-grid sx-cols-${cols}">${tilesHtml}</div>`;
}

export function sxHero(label, value, opts = {}) {
  const chip = opts.chip ? `<span class="sx-chip sx-tone-${opts.chipTone || 'good'}">${_esc(opts.chip)}</span>` : '';
  const sub = opts.sub ? `<span class="sx-hero-sub">${_esc(opts.sub)}</span>` : '';
  const id = opts.id ? ` id="${_esc(opts.id)}"` : '';
  return `<div class="sx-hero"><div class="sx-hero-top"><span class="sx-hero-label">${_esc(label)}</span>${chip}</div><div class="sx-hero-value"${id}>${value}</div>${sub}</div>`;
}

export function sxSplit(segments, fmt = (v) => String(Math.round(v)), opts = {}) {
  const total = segments.reduce((a, s) => a + Math.max(0, +s.value || 0), 0);
  const bar = total > 0
    ? segments.filter((s) => (+s.value || 0) > 0).map((s) => `<i class="sx-seg dc-flex sx-bg-${s.tone || 'info'}" style="--d-flex: ${Math.max(0, +s.value || 0)}"></i>`).join('')
    : '<i class="sx-seg dc-flex sx-bg-empty" style="--d-flex: 1"></i>';
  const legend = segments.map((s) => {
    const pct = total > 0 ? Math.round(((+s.value || 0) / total) * 100) : 0;
    return `<span class="sx-leg"><i class="sx-dot sx-bg-${s.tone || 'info'}"></i><span class="sx-leg-label">${_esc(s.label)}</span><b>${fmt(+s.value || 0)}</b><em>${pct}%</em></span>`;
  }).join('');
  const id = opts.id ? ` id="${_esc(opts.id)}"` : '';
  return `<div class="sx-split"${id}><div class="sx-bar">${bar}</div><div class="sx-legend">${legend}</div></div>`;
}

export function sxSection(title, bodyHtml, opts = {}) {
  const right = opts.right || '';
  return `<section class="sx-section"><header class="sx-section-head"><h4>${_esc(title)}</h4>${right}</header>${bodyHtml}</section>`;
}

export function sxBreakdown(title, rows, headRight = '') {
  if (!rows || !rows.length) return '';
  const body = rows.map((r) => `<div class="sx-row"><span class="sx-row-name">${_esc(r.name)}</span><span class="sx-row-val">${r.value}</span></div>`).join('');
  return `<details class="sx-details"><summary><span>${_esc(title)}</span><em>${headRight}</em></summary><div class="sx-rows">${body}</div></details>`;
}

export function sxMargin(profit, value) {
  const v = +value || 0;
  if (v <= 0) return null;
  return Math.round(((+profit || 0) / v) * 1000) / 10;
}
