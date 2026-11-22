import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { smoothPath, sparkWaveSvg, wavePoints, waveBarSvg, waveChartSvg, waveShape } from '../modules/overview-waves.js';
import { buildOverview, overviewHtml } from '../modules/overview-data.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const now = new Date(2026, 10, 16);

describe('wave geometry', () => {
  it('turns points into one smooth curve with a segment between each pair', () => {
    const d = smoothPath([[0, 10], [50, 40], [100, 20]]);
    assert.match(d, /^M0,10 C/);
    assert.equal((d.match(/C/g) || []).length, 2);
    assert.equal(smoothPath([]), '');
    assert.equal(smoothPath([[5, 7]]), 'M5,7');
  });

  it('keeps curve handles between neighbouring heights so a wave never overshoots', () => {
    const d = smoothPath([[0, 100], [50, 20], [100, 100]]);
    const ys = [...d.matchAll(/C[\d.]+,([\d.]+) [\d.]+,([\d.]+) /g)].flatMap((m) => [Number(m[1]), Number(m[2])]);
    assert.ok(ys.every((y) => y >= 20 && y <= 100));
  });

  it('places each month at the centre of its label column and extends to both edges', () => {
    const pts = wavePoints([10, 20, 30], 30, { w: 300, h: 120, pad: 6 });
    assert.deepEqual(pts.map((p) => p[0]), [0, 50, 150, 250, 300]);
    assert.equal(pts[0][1], pts[1][1]);
    assert.equal(pts[4][1], pts[3][1]);
    assert.ok(pts[3][1] < pts[2][1] && pts[2][1] < pts[1][1]);
  });

  it('scales by absolute value so a negative month still draws, and never leaves a zero month off the baseline', () => {
    const pts = wavePoints([-30, 0, 30], 30);
    assert.equal(pts[1][1], pts[3][1]);
    assert.ok(pts[2][1] < 114 && pts[2][1] > 100);
  });

  it('closes the area down to the baseline', () => {
    const s = waveShape([1, 2, 3], 3, { w: 300, h: 120, pad: 6 });
    assert.match(s.area, / L300,114 L0,114 Z$/);
    assert.ok(s.area.startsWith(s.line));
  });
});

describe('wave charts and bars', () => {
  it('draws overlapping waves, one filled area and line per series, in the series tone', () => {
    const svg = waveChartSvg([{ values: [1, 2, 3], tone: 'good' }, { values: [3, 2, 1], tone: 'info' }], 3, 'Sales and Profit');
    assert.equal((svg.match(/class="ov-wave-area/g) || []).length, 2);
    assert.equal((svg.match(/class="ov-wave-line/g) || []).length, 2);
    assert.match(svg, /sx-tone-good/);
    assert.match(svg, /sx-tone-info/);
    assert.match(svg, /role="img" aria-label="Sales and Profit"/);
  });

  it('a progress bar becomes two overlapping rolling waves that fill up to the share', () => {
    const svg = waveBarSvg(40);
    assert.match(svg, /class="ov-wavebar-back" d="M0,[\d.]+ C/);
    assert.match(svg, /class="ov-wavebar-front" d="M0,[\d.]+ C/);
    assert.equal((svg.match(/ L40,14 L0,14 Z"/g) || []).length, 2);
    assert.match(waveBarSvg(0), / L4,14 L0,14 Z"/);
    assert.match(waveBarSvg(500), / L100,14 L0,14 Z"/);
  });

  it('the two layers are out of step so the waves overlap rather than coincide', () => {
    const svg = waveBarSvg(60);
    const back = /ov-wavebar-back" d="([^"]+)"/.exec(svg)[1];
    const front = /ov-wavebar-front" d="([^"]+)"/.exec(svg)[1];
    assert.notEqual(back, front);
    assert.ok((back.match(/C/g) || []).length >= 14);
  });

  it('the KPI trend is a filled wave and copes with a single value', () => {
    assert.match(sparkWaveSvg([1, 3, 2, 5]), /class="ov-spark-fill" d="M0,/);
    assert.match(sparkWaveSvg([4]), /class="ov-spark-line"/);
    assert.match(sparkWaveSvg([0, 0, 0]), /<svg class="ov-spark"/);
  });
});

describe('the overview uses waves instead of bars', () => {
  const data = { sales: [{ date: '2026-11-03', totalValue: 500, profit: 50, customerName: 'Ali', quantity: 5 }, { date: '2026-10-03', totalValue: 300, profit: 30, customerName: 'Sara', quantity: 3 }], production: [{ date: '2026-11-02', net: 100, formulaName: 'Base', store: 'A', totalSale: 100, totalCost: 50, profit: 50 }] };
  const html = overviewHtml(buildOverview(data, now, 3), 3);

  it('has wave charts for the time series and keeps every month tappable under them', () => {
    assert.match(html, /<svg class="ov-wave" /);
    assert.match(html, /class="ov-axis"/);
    assert.match(html, /class="ov-col" data-go="sales"/);
    assert.doesNotMatch(html, /ov-cols|ov-pair|ov-fill/);
  });

  it('draws the ranked lists with wave bars and never the old progress bar', () => {
    assert.match(html, /class="ov-wavebar"/);
    assert.doesNotMatch(html, /class="bar ov-bar-track"|ov-bar-track/);
  });

  it('draws the KPI trends as waves', () => {
    assert.match(html, /class="ov-spark-fill"/);
    assert.doesNotMatch(html, /<polyline/);
  });

  it('shows two series as overlapping waves with a legend', () => {
    const m = buildOverview(data, now, 3);
    const h = overviewHtml(m, 3);
    assert.match(h, /class="ov-key"/);
    assert.ok((h.match(/class="ov-wave-area/g) || []).length >= 6);
  });

  it('is styled with theme colours only', () => {
    const css = read('../app.css');
    assert.match(css, /\.ov-wave-area \{ fill: var\(--sx-c, var\(--accent\)\); fill-opacity: 0\.32; \}/);
    assert.match(css, /\.ov-wavebar-front \{ fill: var\(--sx-c, var\(--accent\)\); \}/);
    assert.doesNotMatch(css, /\.ov-fill \{|\.ov-pair \{|\.ov-bar-track/);
  });
});
