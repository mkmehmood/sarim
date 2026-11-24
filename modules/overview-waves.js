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
  const endY = pts[n - 1][1];
  return `<span class="ov-spark-wrap" style="--y:${f1((endY / 24) * 100)}%"><svg class="ov-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path class="ov-spark-fill" d="${line} L100,24 L0,24 Z"/><path class="ov-spark-line" d="${line}"/></svg><i class="ov-spark-dot"></i></span>`;
}
