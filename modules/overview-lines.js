import { smoothPath } from './overview-waves.js';

export const PLOT = { W: 340, H: 200, L: 42, R: 12, T: 12, B: 26 };
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function compact(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (a >= 1e9) return `${sign}${f1(a / 1e9)}B`;
  if (a >= 1e6) return `${sign}${f1(a / 1e6)}M`;
  if (a >= 1e4) return `${sign}${Math.round(a / 1e3)}k`;
  if (a >= 1e3) return `${sign}${f1(a / 1e3)}k`;
  return `${sign}${Math.round(a * 10) / 10}`;
}

function niceStep(raw) {
  const exp = Math.floor(Math.log10(raw));
  const base = raw / 10 ** exp;
  const nice = base <= 1 ? 1 : base <= 2 ? 2 : base <= 2.5 ? 2.5 : base <= 5 ? 5 : 10;
  return nice * 10 ** exp;
}

export function niceTicks(min, max, count = 4) {
  let lo = Math.min(min, 0);
  let hi = Math.max(max, 0);
  if (hi === lo) hi = lo + 1;
  const step = niceStep((hi - lo) / count);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 1e6; v += step) ticks.push(Math.round(v / step) * step);
  return { min: lo, max: hi, ticks };
}

export function lineChart({ labels, series, unit = '', area = false, label = 'Chart' }) {
  const { W, H, L, R, T, B } = PLOT;
  const n = labels.length;
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  const t = niceTicks(Math.min(...all, 0), Math.max(...all, 0));
  const pw = W - L - R;
  const ph = H - T - B;
  const xs = labels.map((_, i) => (n > 1 ? L + (i / (n - 1)) * pw : L + pw / 2));
  const yOf = (v) => T + (1 - (v - t.min) / (t.max - t.min)) * ph;
  const grid = t.ticks.map((v) => `<line class="ov-gl${v === 0 ? ' is-zero' : ''}" x1="${L}" x2="${W - R}" y1="${f1(yOf(v))}" y2="${f1(yOf(v))}"/>`).join('');
  const yl = t.ticks.map((v) => `<text class="ov-ytick" x="${L - 6}" y="${f1(yOf(v) + 3)}">${compact(v)}</text>`).join('');
  const every = n > 8 ? 2 : 1;
  const xl = labels.map((lb, i) => (i % every === 0 || i === n - 1 ? `<text class="ov-xtick" x="${f1(xs[i])}" y="${H - 8}">${esc(lb)}</text>` : '')).join('');
  const paths = series.map((s, i) => {
    const pts = s.values.map((v, j) => [xs[j], yOf(v)]);
    const d = n > 1 ? smoothPath(pts) : `M${f1(pts[0][0] - 4)},${f1(pts[0][1])} L${f1(pts[0][0] + 4)},${f1(pts[0][1])}`;
    const base = f1(yOf(0));
    const fill = area && series.length <= 2 ? `<path class="ov-line-area ov-s${s.c}" data-s="${i}" d="${d} L${f1(xs[n - 1])},${base} L${f1(xs[0])},${base} Z"/>` : '';
    const last = pts[pts.length - 1];
    return `${fill}<path class="ov-line ov-s${s.c}" data-s="${i}" d="${d}"/><circle class="ov-last ov-s${s.c}" data-s="${i}" cx="${f1(last[0])}" cy="${f1(last[1])}" r="3.5"/>`;
  }).join('');
  const hover = series.map((s, i) => `<circle class="ov-hdot ov-s${s.c}" data-s="${i}" r="4.5" cx="0" cy="0"/>`).join('');
  const data = {
    W, labels, x: xs.map((x) => Math.round(x * 10) / 10), unit,
    series: series.map((s) => ({ name: s.name, c: s.c, v: s.values.map((v) => Math.round(v * 100) / 100), y: s.values.map((v) => Math.round(yOf(v) * 10) / 10) })),
    T, B: H - B,
  };
  const chips = series.length > 1 || series[0].name ? `<div class="ov-chips-s">${series.map((s, i) => `<button type="button" class="ov-chip-s ov-s${s.c}" data-series="${i}" aria-pressed="true"><i></i>${esc(s.name)}</button>`).join('')}</div>` : '';
  const unitTag = unit ? `<span class="ov-unit">${esc(unit)}</span>` : '';
  return `<div class="ov-linechart" data-lines="${esc(JSON.stringify(data))}">${unitTag}${chips}<div class="ov-plot"><svg class="ov-lines" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}${yl}${xl}${paths}<line class="ov-cross is-off" x1="0" x2="0" y1="${T}" y2="${H - B}"/><g class="ov-hover is-off">${hover}</g><rect class="ov-hit" x="${L}" y="${T}" width="${pw}" height="${ph}"/></svg><div class="ov-tip" hidden></div></div></div>`;
}

export function nearestIndex(xs, x) {
  let best = 0;
  xs.forEach((v, i) => { if (Math.abs(v - x) < Math.abs(xs[best] - x)) best = i; });
  return best;
}

export function tipHtml(data, idx, off) {
  const rows = data.series.map((s, i) => (off.has(i) ? '' : `<span class="ov-tip-row ov-s${s.c}"><i></i>${esc(s.name)}<b>${Number(s.v[idx]).toLocaleString('en-US')}</b></span>`)).join('');
  return `<div class="ov-tip-title">${esc(data.labels[idx])}${data.unit ? ` <small>${esc(data.unit)}</small>` : ''}</div>${rows}`;
}

export function barChart({ rows, unit = '', c = 0, label = 'Chart' }) {
  const list = rows.filter((r) => Number.isFinite(r.value));
  if (!list.length) return '';
  const rowH = 26;
  const { W, L, R, T, B } = { W: 340, L: 96, R: 14, T: 8, B: 22 };
  const H = T + B + list.length * rowH;
  const t = niceTicks(Math.min(...list.map((r) => r.value), 0), Math.max(...list.map((r) => r.value), 0), 4);
  const pw = W - L - R;
  const xOf = (v) => L + ((v - t.min) / (t.max - t.min)) * pw;
  const grid = t.ticks.map((v) => `<line class="ov-gl${v === 0 ? ' is-zero' : ''}" x1="${f1(xOf(v))}" x2="${f1(xOf(v))}" y1="${T}" y2="${H - B}"/><text class="ov-xtick" x="${f1(xOf(v))}" y="${H - 7}">${compact(v)}</text>`).join('');
  const bars = list.map((r, i) => {
    const y = T + i * rowH + 4;
    const x0 = xOf(0);
    const x1 = xOf(r.value);
    const name = String(r.name).length > 15 ? `${String(r.name).slice(0, 14)}\u2026` : String(r.name);
    const col = r.c === undefined ? c : r.c;
    return `<text class="ov-ytick ov-bname" x="${L - 6}" y="${y + 11}">${esc(name)}</text><rect class="ov-bar ov-s${col}" x="${f1(Math.min(x0, x1))}" y="${y}" width="${f1(Math.max(2, Math.abs(x1 - x0)))}" height="14" rx="3"/><text class="ov-bval" x="${f1(Math.max(x0, x1) + 4)}" y="${y + 11}">${compact(r.value)}${esc(unit)}</text>`;
  }).join('');
  return `<div class="ov-linechart ov-barchart"><div class="ov-plot"><svg class="ov-lines" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}${bars}</svg></div></div>`;
}

export function columnChart({ rows, unit = '', label = 'Chart' }) {
  const list = rows.filter((r) => Number.isFinite(r.value));
  if (!list.length) return '';
  const { W, H, L, R, T, B } = PLOT;
  const t = niceTicks(0, Math.max(...list.map((r) => r.value)), 4);
  const pw = W - L - R;
  const ph = H - T - B;
  const yOf = (v) => T + (1 - (v - t.min) / (t.max - t.min)) * ph;
  const slot = pw / list.length;
  const bw = Math.min(46, slot * 0.55);
  const grid = t.ticks.map((v) => `<line class="ov-gl${v === 0 ? ' is-zero' : ''}" x1="${L}" x2="${W - R}" y1="${f1(yOf(v))}" y2="${f1(yOf(v))}"/><text class="ov-ytick" x="${L - 6}" y="${f1(yOf(v) + 3)}">${compact(v)}</text>`).join('');
  const bars = list.map((r, i) => {
    const cx = L + slot * (i + 0.5);
    return `<rect class="ov-bar ov-s${i}" x="${f1(cx - bw / 2)}" y="${f1(yOf(r.value))}" width="${f1(bw)}" height="${f1(Math.max(1, yOf(0) - yOf(r.value)))}" rx="3"/><text class="ov-bval is-mid" x="${f1(cx)}" y="${f1(yOf(r.value) - 5)}">${compact(r.value)}${esc(unit)}</text><text class="ov-xtick" x="${f1(cx)}" y="${H - 8}">${esc(r.name)}</text>`;
  }).join('');
  return `<div class="ov-linechart ov-barchart"><div class="ov-plot"><svg class="ov-lines" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${grid}${bars}</svg></div></div>`;
}
