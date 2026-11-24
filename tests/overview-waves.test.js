import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { smoothPath, sparkWaveSvg } from '../modules/overview-waves.js';
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

});

describe('KPI trend lines', () => {
  it('the KPI trend is a filled wave and copes with a single value', () => {
    assert.match(sparkWaveSvg([1, 3, 2, 5]), /class="ov-spark-fill" d="M0,/);
    assert.match(sparkWaveSvg([4]), /class="ov-spark-line"/);
    assert.match(sparkWaveSvg([0, 0, 0]), /<svg class="ov-spark"/);
  });
});

describe('chart styles in the overview', () => {
  const data = { sales: [{ date: '2026-11-03', totalValue: 500, profit: 50, customerName: 'Ali', quantity: 5 }, { date: '2026-10-03', totalValue: 300, profit: 30, customerName: 'Sara', quantity: 3 }], production: [{ date: '2026-11-02', net: 100, formulaName: 'Base', store: 'A', totalSale: 100, totalCost: 50, profit: 50 }] };
  const html = overviewHtml(buildOverview(data, now, 3), 3);

  it('draws the ranked lists as flat sorted bars with their share, never wave bars or the old progress bar', () => {
    assert.match(html, /class="ov-rank-fill" style="--w:\d+%"/);
    assert.match(html, /<em>\d+%<\/em>/);
    assert.doesNotMatch(html, /ov-wavebar/);
    assert.doesNotMatch(html, /class="bar ov-bar-track"|ov-bar-track/);
  });

  it('draws the KPI trends as small soft lines', () => {
    assert.match(html, /class="ov-spark-fill"/);
    assert.doesNotMatch(html, /<polyline/);
  });

  it('is styled with theme colours only', () => {
    const css = read('../app.css');
    assert.match(css, /\.ov-rank-fill \{[^}]*background: var\(--sx-c, var\(--accent\)\);/);
    assert.doesNotMatch(css, /\.ov-fill \{|\.ov-pair \{|\.ov-bar-track|\.ov-wave-area/);
  });
});
