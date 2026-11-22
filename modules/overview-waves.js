const f1 = (n) => (Math.round(n * 10) / 10).toString();

export function smoothPath(pts) {
  if (!pts.length) return '';
  if (pts.length === 1) return `M${f1(pts[0][0])},${f1(pts[0][1])}`;
  let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const lo = Math.min(p1[1], p2[1]);
    const hi = Math.max(p1[1], p2[1]);
    const c1y = Math.min(hi, Math.max(lo, p1[1] + (p2[1] - p0[1]) / 6));
    const c2y = Math.min(hi, Math.max(lo, p2[1] - (p3[1] - p1[1]) / 6));
    d += ` C${f1(c1x)},${f1(c1y)} ${f1(c2x)},${f1(c2y)} ${f1(p2[0])},${f1(p2[1])}`;
  }
  return d;
}

export function wavePoints(values, max, { w = 300, h = 120, pad = 6 } = {}) {
  const n = values.length;
  const base = h - pad;
  const span = base - pad;
  const ys = values.map((v) => base - Math.max(0.02, Math.min(1, Math.abs(v) / (max || 1))) * span);
  const xs = values.map((_, i) => ((i + 0.5) / n) * w);
  return [[0, ys[0]], ...xs.map((x, i) => [x, ys[i]]), [w, ys[n - 1]]];
}

export function waveShape(values, max, size) {
  const { w = 300, h = 120, pad = 6 } = size || {};
  const pts = wavePoints(values, max, { w, h, pad });
  const line = smoothPath(pts);
  const base = h - pad;
  return { line, area: `${line} L${f1(w)},${f1(base)} L0,${f1(base)} Z`, points: pts };
}

export function waveChartSvg(seriesValues, max, label) {
  const w = 300;
  const h = 120;
  const grid = [0.25, 0.5, 0.75].map((r) => `M0,${f1(6 + (h - 12) * r)}H${w}`).join(' ');
  const layers = seriesValues.map((s) => {
    const sh = waveShape(s.values, max, { w, h });
    return `<path class="ov-wave-area sx-tone-${s.tone}" d="${sh.area}"/><path class="ov-wave-line sx-tone-${s.tone}" d="${sh.line}"/>`;
  }).join('');
  return `<svg class="ov-wave" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${label}"><path class="ov-wave-grid" d="${grid}"/>${layers}</svg>`;
}

export function waveBarSvg(pct) {
  const w = Math.max(4, Math.min(100, pct));
  const steps = Math.max(2, Math.ceil(w / 4));
  const layer = (base, amp, phase) => {
    const pts = [];
    for (let i = 0; i <= steps; i += 1) {
      const x = (i / steps) * w;
      pts.push([x, base + amp * Math.sin((x / 22) * 2 * Math.PI + phase)]);
    }
    return `${smoothPath(pts)} L${f1(w)},14 L0,14 Z`;
  };
  return `<svg class="ov-wavebar" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true"><path class="ov-wavebar-back" d="${layer(5, 2.6, 0)}"/><path class="ov-wavebar-front" d="${layer(7, 2, Math.PI * 0.8)}"/></svg>`;
}

export function sparkWaveSvg(values) {
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const norm = values.map((v) => (v - min) / span);
  const n = norm.length;
  const pts = norm.map((v, i) => [n > 1 ? (i / (n - 1)) * 100 : 50, 22 - v * 18]);
  const line = smoothPath(n > 1 ? pts : [[0, pts[0][1]], [100, pts[0][1]]]);
  return `<svg class="ov-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path class="ov-spark-fill" d="${line} L100,24 L0,24 Z"/><path class="ov-spark-line" d="${line}"/></svg>`;
}
