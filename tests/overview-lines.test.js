import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PLOT, compact, lineChart, nearestIndex, niceTicks, tipHtml } from '../modules/overview-lines.js';
import { buildOverview, overviewHtml } from '../modules/overview-data.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const now = new Date(2026, 10, 16);

describe('axis maths', () => {
  it('compact numbers read like an axis label', () => {
    assert.deepEqual([0, 7, 950, 1234, 12500, 1234567, 2e9, -52000, 'x'].map(compact), ['0', '7', '950', '1.2k', '13k', '1.2M', '2B', '-52k', '0']);
  });

  it('ticks are round numbers that always include zero and cover the data', () => {
    const t = niceTicks(-9000, 64000);
    assert.deepEqual(t.ticks, [-20000, 0, 20000, 40000, 60000, 80000]);
    assert.ok(t.min <= -9000 && t.max >= 64000);
    assert.deepEqual(niceTicks(120, 480).ticks[0], 0);
    assert.deepEqual(niceTicks(0, 0).ticks, [0, 0.25, 0.5, 0.75, 1]);
  });

  it('finds the month nearest to a touch position', () => {
    assert.equal(nearestIndex([10, 100, 200], 20), 0);
    assert.equal(nearestIndex([10, 100, 200], 160), 2);
    assert.equal(nearestIndex([10, 100, 200], 99), 1);
  });
});

describe('line chart markup', () => {
  const chart = lineChart({ labels: ['Jun', 'Jul', 'Aug', 'Sep'], series: [{ name: 'Sales', c: 0, values: [100, 300, -50, 200] }, { name: 'Cost', c: 2, values: [50, 80, 120, 90] }], unit: 'currency', label: 'Sales and Cost' });

  it('draws one smooth line and end dot per series, gridlines, axis labels and a zero line when values go negative', () => {
    assert.equal((chart.match(/class="ov-line ov-s\d"/g) || []).length, 2);
    assert.equal((chart.match(/class="ov-last ov-s\d"/g) || []).length, 2);
    assert.match(chart, /class="ov-gl is-zero"/);
    assert.ok((chart.match(/class="ov-ytick"/g) || []).length >= 4);
    assert.equal((chart.match(/class="ov-xtick"/g) || []).length, 4);
    assert.match(chart, /role="img" aria-label="Sales and Cost"/);
  });

  it('plots real negative values below the zero line instead of folding them up', () => {
    const data = JSON.parse(/data-lines="([^"]+)"/.exec(chart)[1].replace(/&quot;/g, '"'));
    const [sales] = data.series;
    assert.ok(sales.y[2] > sales.y[0]);
    assert.ok(sales.y[1] < sales.y[0]);
  });

  it('has a legend chip for each line, a hit area for reading values and a hidden tooltip', () => {
    assert.equal((chart.match(/class="ov-chip-s ov-s\d" data-series=/g) || []).length, 2);
    assert.match(chart, /class="ov-hit"/);
    assert.match(chart, /<div class="ov-tip" hidden><\/div>/);
    assert.match(chart, /class="ov-unit">currency</);
  });

  it('shades under the line only when asked, and only when one or two series share the chart', () => {
    assert.doesNotMatch(chart, /ov-line-area/);
    const shaded = lineChart({ labels: ['a', 'b'], series: [{ name: 's', c: 0, values: [1, 2] }], area: true, label: 'x' });
    assert.match(shaded, /class="ov-line-area ov-s0"/);
    const many = lineChart({ labels: ['a', 'b'], series: [0, 1, 2].map((c) => ({ name: `s${c}`, c, values: [1, 2] })), area: true, label: 'x' });
    assert.doesNotMatch(many, /ov-line-area/);
  });

  it('thins out the month labels on long ranges and still labels the last month', () => {
    const labels = Array.from({ length: 12 }, (_, i) => `M${i}`);
    const long = lineChart({ labels, series: [{ name: 'x', c: 0, values: labels.map((_, i) => i) }], label: 'x' });
    assert.equal((long.match(/class="ov-xtick"/g) || []).length, 6 + 1);
    assert.match(long, />M11</);
  });

  it('copes with one month, no data and escapes names', () => {
    assert.doesNotThrow(() => lineChart({ labels: ['x'], series: [{ name: 'A', c: 0, values: [5] }], label: 'x' }));
    assert.doesNotThrow(() => lineChart({ labels: ['a', 'b'], series: [{ name: 'A', c: 0, values: [0, 0] }], label: 'x' }));
    assert.doesNotMatch(lineChart({ labels: ['a', 'b'], series: [{ name: '<img onerror=x>', c: 0, values: [1, 2] }], label: 'x' }), /<img/);
  });

  it('tooltip lists every visible line for the chosen month', () => {
    const data = JSON.parse(/data-lines="([^"]+)"/.exec(chart)[1].replace(/&quot;/g, '"'));
    const html = tipHtml(data, 1, new Set());
    assert.match(html, /Jul/);
    assert.match(html, /Sales<b>300<\/b>/);
    assert.match(html, /Cost<b>80<\/b>/);
    assert.doesNotMatch(tipHtml(data, 1, new Set([1])), /Cost/);
    assert.equal(PLOT.W, 340);
  });
});

const chartMarkup = () => lineChart({ labels: ['a', 'b'], series: [{ name: 'A', c: 0, values: [1, 2] }], label: 'x' });

describe('the overview uses line charts and opens nothing from its cards', () => {
  const data = {
    sales: ['2026-09-05', '2026-10-05', '2026-11-05'].flatMap((d, i) => [{ date: d, totalValue: 100 * (i + 1), profit: 10 * (i + 1), customerName: 'Ali', supplyStore: 'A', quantity: 2 }, { date: d, time: 'x', totalValue: 50 * (i + 2), profit: 5, customerName: 'Sara', supplyStore: 'B', quantity: 1 }]),
    production: ['2026-09-02', '2026-10-02', '2026-11-02'].flatMap((d, i) => [{ date: d, net: 100 + i * 10, formulaName: 'Base', store: 'A', totalSale: 1, totalCost: 1, profit: 1 }, { date: d, net: 40, formulaName: 'Mix', store: 'B', totalSale: 1, totalCost: 1, profit: 1 }]),
    transactions: [{ date: '2026-11-03', type: 'IN', amount: 500 }, { date: '2026-10-03', type: 'OUT', amount: 200 }],
  };
  const html = overviewHtml(buildOverview(data, now, 3), 3);

  it('has multi-line charts for money, customers, stores and formulas', () => {
    assert.match(html, /Money trends/);
    assert.match(html, /Sales by customer over time/);
    assert.match(html, /Sales by store over time/);
    assert.match(html, /Production by formula over time/);
    assert.match(html, /Production by store over time/);
    const money = /Money trends[\s\S]*?<\/svg>/.exec(html)[0];
    assert.equal((money.match(/class="ov-line ov-s\d"/g) || []).length, 6);
    assert.ok((html.match(/class="ov-linechart"/g) || []).length >= 6);
  });

  it('collects each customer, store and formula as its own line over the months', () => {
    const m = buildOverview(data, now, 3);
    assert.deepEqual(m.trends.customers.map((c) => [c.name, c.values]), [['Sara', [100, 150, 200]], ['Ali', [100, 200, 300]]].sort((a, b) => b[1].reduce((x, y) => x + y) - a[1].reduce((x, y) => x + y)));
    assert.deepEqual(m.trends.formulas.map((c) => [c.name, c.values]), [['Base', [100, 110, 120]], ['Mix', [40, 40, 40]]]);
    assert.deepEqual(m.trends.stores.map((c) => c.name).sort(), ['A', 'B']);
    assert.deepEqual(m.trends.salesStores.map((c) => c.name).sort(), ['A', 'B']);
  });

  it('no wave charts or column buttons remain, and no card is a link or button to another tab', () => {
    assert.doesNotMatch(html, /data-go=|data-screen=|class="ov-col"|ov-wave"/);
    assert.doesNotMatch(html, /<button type="button" class="ov-kpi|<button type="button" class="ov-pill|<button type="button" class="ov-rank-row|<button type="button" class="ov-donut-wrap|Open<\/button>/);
  });

  it('the cards are not styled as tappable', () => {
    const css = read('../app.css');
    assert.match(css, /\.ov-kpi \{[^}]*cursor: default;/);
    assert.match(css, /\.ov-pill \{[^}]*cursor: default;/);
    assert.doesNotMatch(css, /\.ov-stat:active|\.ov-kpi:active|\.ov-pill:active/);
  });

  it('keeps only the interactions that help examine a chart, plus the fix dialog entries', () => {
    const src = read('../modules/overview.js');
    assert.doesNotMatch(src, /goTo|data-go|data-screen|sidebarNav/);
    assert.match(src, /box\.addEventListener\('pointerdown'/);
    assert.match(src, /box\.addEventListener\('pointermove'/);
    assert.match(src, /toggleSeries\(chip\.closest\('\.ov-linechart'\), chip\)/);
    assert.match(src, /\[data-fix\]/);
  });

  it('keeps the chart gridline class apart from the panel layout class so dashes never leak into the lines', () => {
    const css = read('../app.css');
    assert.match(css, /\.ov-gl \{[^}]*stroke-dasharray: 2 5/);
    assert.doesNotMatch(css, /\.ov-grid \{[^}]*stroke/);
    assert.match(css, /\.ov-grid \{ display: grid;/);
    assert.doesNotMatch(chartMarkup(), /class="ov-grid/);
  });

  it('puts the tooltip beside the guide line, away from the touch point and the lines', () => {
    assert.match(read('../modules/overview.js'), /tip\.classList\.toggle\('is-right', pct >= 50\)/);
    assert.match(read('../app.css'), /\.ov-tip \{[^}]*transform: translateX\(10px\)/);
    assert.match(read('../app.css'), /\.ov-tip\.is-right \{ transform: translateX\(calc\(-100% - 10px\)\); \}/);
  });

  it('uses theme colours and a transparent tooltip, with one colour per series', () => {
    const css = read('../app.css');
    for (let i = 0; i < 8; i += 1) assert.match(css, new RegExp(`\\.ov-s${i} \\{ --lc: hsl\\(`));
    assert.match(css, /\.ov-line \{[^}]*stroke: var\(--lc\)/);
    assert.match(css, /\.ov-tip \{[^}]*backdrop-filter: blur\(10px\)/);
    assert.match(css, /\.ov-lines \{[^}]*touch-action: pan-y/);
  });
});
