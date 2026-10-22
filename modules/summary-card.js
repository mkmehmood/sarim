const esc = (v) => (v == null ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

const TONES = new Set(['good', 'bad', 'warn', 'info', 'muted']);
const VALUE_CLASSES = new Set(['qty-val', 'cost-val', 'rev-val', 'profit-val', 'balance-pos', 'balance-neg']);
const tone = (t) => (TONES.has(t) ? t : 'muted');

export function smStatsHtml(stats) {
  const list = (stats || []).filter((s) => s && s.value != null && s.value !== '');
  if (!list.length) return '';
  return `<div class="sm-stats">${list.map((s) => `<div class="sm-stat${s.wide ? ' is-wide' : ''}${s.tone ? ' is-' + tone(s.tone) : ''}"><span class="sm-stat-label">${esc(s.label)}</span><span class="sm-stat-value${VALUE_CLASSES.has(s.cls) ? ' ' + s.cls : ''}">${s.value}</span></div>`).join('')}</div>`;
}

export function smBarHtml(segments) {
  const segs = (segments || []).filter((s) => s && Number(s.value) > 0);
  const total = segs.reduce((a, s) => a + Number(s.value), 0);
  if (!segs.length || total <= 0) return '';
  const bar = segs.map((s) => `<span class="sm-bar-seg is-${tone(s.tone)}" style="--sm-flex:${(Number(s.value) / total).toFixed(4)}"></span>`).join('');
  const legend = segs.map((s) => `<span class="sm-legend-item"><i class="sm-dot is-${tone(s.tone)}"></i>${esc(s.label)} <b>${s.text != null ? s.text : esc(s.value)}</b></span>`).join('');
  return `<div class="sm-share"><div class="sm-bar" role="img" aria-label="${esc(segs.map((s) => s.label).join(', '))}">${bar}</div><div class="sm-legend">${legend}</div></div>`;
}

export function smInnerHtml(o) {
  const hero = o.hero
    ? `<div class="sm-hero is-${tone(o.hero.tone)}"><span class="sm-hero-label">${esc(o.hero.label)}</span><span class="sm-hero-value">${o.hero.value}</span></div>`
    : '';
  const sections = (o.sections || []).map((s) => {
    const st = smStatsHtml(s.stats);
    return st ? `<details class="sm-more"${s.open ? ' open' : ''}><summary>${esc(s.title)}</summary>${st}</details>` : '';
  }).join('');
  return (o.title || o.sub
    ? `<div class="sm-head"><div class="sm-title">${esc(o.title || '')}</div>${o.sub ? `<div class="sm-sub">${o.sub}</div>` : ''}</div>`
    : '')
    + hero
    + (o.bar ? smBarHtml(o.bar) : '')
    + smStatsHtml(o.stats)
    + sections
    + (o.note ? `<p class="sm-note">${o.note}</p>` : '')
    + (o.body || '');
}

export function smCardHtml(o, className = '') {
  return `<div class="sm-card${className ? ' ' + className : ''}">${smInnerHtml(o)}</div>`;
}

export function smCardEl(o, className = '') {
  const el = document.createElement('div');
  el.className = `sm-card${className ? ' ' + className : ''}`;
  el.innerHTML = smInnerHtml(o);
  return el;
}

function soldBreakdownHtml(entries, fmt) {
  if (!entries || !entries.length) return '';
  const rows = entries.map(([cust, qty]) => `<div class="sm-row"><span class="sm-row-name">${esc(cust)}</span><span class="sm-row-val">${fmt.num(fmt.safe(qty))} kg</span></div>`).join('');
  return `<details class="sm-more"><summary>Sold breakdown</summary><div class="sm-rows">${rows}</div></details>`;
}

export function smExpensesHtml(entries, fmt) {
  const list = (entries || []).filter((e) => e && Number(e[1]) > 0);
  if (!list.length) return '';
  const rows = list.map(([name, value]) => `<div class="sm-row"><span class="sm-row-name">${esc(name)}</span><span class="sm-row-val"><span class="cost-val">${fmt.amt(fmt.safe(value))}</span></span></div>`).join('');
  return `<details class="sm-more"><summary>Expenses breakdown</summary><div class="sm-rows">${rows}</div></details>`;
}

export function smProductionHtml(d, fmt) {
  const profit = fmt.safe(d.profit);
  const stats = [
    { label: d.combined ? 'Fresh production' : 'Produced', value: `${fmt.num(fmt.safe(d.production))} kg`, cls: 'qty-val' },
    { label: 'Returns', value: d.returns > 0 ? `${fmt.num(fmt.safe(d.returns))} kg` : '', cls: 'qty-val' },
    { label: 'Sold', value: `${fmt.num(fmt.safe(d.sold))} kg`, cls: 'cost-val' },
    { label: 'Remaining', value: `${fmt.num(fmt.safe(d.remaining))} kg`, cls: 'profit-val' },
    { label: 'Total value', value: fmt.amt(fmt.safe(d.value)), cls: 'rev-val' },
    { label: 'Total cost', value: d.combined ? fmt.amt(fmt.safe(d.cost)) : '', cls: 'cost-val' }
  ];
  return smInnerHtml({
    title: d.name, sub: d.sub,
    hero: { label: 'Net profit', value: fmt.amt(profit), tone: profit >= 0 ? 'good' : 'bad' },
    stats,
    sections: [{ title: 'Formula usage', stats: [
      { label: 'Formula units', value: fmt.num(fmt.safe(d.formulaUnits)), cls: 'qty-val' },
      { label: 'Formula cost', value: fmt.amt(fmt.safe(d.formulaCost)), cls: 'cost-val' }
    ] }],
    body: soldBreakdownHtml(d.soldBy, fmt)
  });
}

export function smCalcHtml(title, d, fmt, extra = {}) {
  const creditVal = fmt.safe(d.creditVal);
  const collected = fmt.safe(d.collected);
  const balance = creditVal - collected;
  const received = fmt.safe(d.received);
  const expected = fmt.safe(d.expected);
  const disc = received - expected;
  let discText, discTone;
  if (Math.abs(disc) < 0.01) { discText = 'Perfect match'; discTone = 'good'; }
  else if (disc < 0) { discText = `Short ${fmt.amt(Math.abs(disc))}`; discTone = 'bad'; }
  else { discText = `Over ${fmt.amt(disc)}`; discTone = 'good'; }
  const profit = fmt.safe(d.profit);
  return smInnerHtml({
    title, sub: extra.sub || '',
    hero: { label: 'Revenue', value: fmt.amt(fmt.safe(d.revenue)), tone: 'info' },
    bar: [
      { label: 'Cash qty', value: fmt.safe(d.cash), text: fmt.num(fmt.safe(d.cash)), tone: 'good' },
      { label: 'Credit qty', value: fmt.safe(d.cred), text: fmt.num(fmt.safe(d.cred)), tone: 'warn' }
    ],
    stats: [
      { label: 'Total sold', value: fmt.num(fmt.safe(d.sold)), cls: 'qty-val' },
      { label: 'Profit', value: fmt.amt(profit), cls: 'profit-val' },
      { label: 'Returned', value: fmt.num(fmt.safe(d.ret)), cls: 'qty-val' },
      { label: 'Net debt', value: fmt.amt(balance), cls: balance > 0 ? 'balance-pos' : 'balance-neg' },
      { label: 'Cash check', value: discText, tone: discTone, wide: true }
    ],
    sections: [
      { title: 'Quantities', stats: [
        { label: 'Transferred to', value: (d.returnRep && fmt.safe(d.ret) > 0) ? esc(d.returnRep) : '', cls: 'qty-val' },
        { label: 'Expired (to CHORA)', value: fmt.safe(d.expired) > 0 ? fmt.num(fmt.safe(d.expired)) : '', cls: 'cost-val' },
        { label: 'Shared (deduction)', value: fmt.safe(d.shared) > 0 ? fmt.num(fmt.safe(d.shared)) : '', cls: 'cost-val' }
      ] },
      { title: 'Credit and cash', stats: [
        { label: 'Credit out', value: fmt.amt(creditVal), cls: 'cost-val' },
        { label: 'Credit in', value: fmt.amt(collected), cls: 'profit-val' },
        { label: 'Expected cash', value: fmt.amt(expected), cls: 'qty-val' },
        { label: 'Received cash', value: fmt.num(fmt.safe(received)), cls: 'qty-val' },
        { label: 'Field expenses', value: fmt.safe(d.fieldExp) > 0 ? fmt.amt(fmt.safe(d.fieldExp)) : '', cls: 'cost-val' },
        { label: 'Commission paid', value: fmt.safe(d.commissionPaid) > 0 ? fmt.amt(fmt.safe(d.commissionPaid)) : '', cls: 'profit-val' }
      ] }
    ],
    body: smExpensesHtml(d.fieldExpEntries, fmt)
  });
}
