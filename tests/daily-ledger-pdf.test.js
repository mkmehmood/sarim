import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkPeriod, periodStatement } from '../modules/ledger-core.js';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mod = readFileSync(new URL('../modules/daily-ledger.js', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const constants = readFileSync(new URL('../modules/constants.js', import.meta.url), 'utf8');
const hero = html.slice(html.indexOf('id="daily-ledger-screen"'), html.indexOf('id="dl-hero-amt"'));
const row = (o) => ({ id: o.id, type: 'IN', amount: 0, mode: 'Cash', toMode: '', category: 'Sales', scope: '', party: '', note: '', ref: '', date: '2026-01-01', timestamp: 1, ...o });
describe('period check', () => {
  it('needs both dates picked and From not after To', () => {
    assert.match(checkPeriod('', '2026-10-18'), /From/);
    assert.match(checkPeriod('2026-10-01', ''), /To/);
    assert.match(checkPeriod('2026-10-19', '2026-10-18'), /cannot be after/);
    assert.equal(checkPeriod('2026-10-18', '2026-10-18'), '');
    assert.equal(checkPeriod('2026-10-01', '2026-10-18'), '');
  });
});
describe('period statement', () => {
  const rows = [
    row({ id: 'a', type: 'IN', amount: 1000, date: '2026-09-20' }),
    row({ id: 'b', type: 'OUT', amount: 250, date: '2026-09-28', category: 'Rent & Lease' }),
    row({ id: 'c', type: 'IN', amount: 500, date: '2026-10-02' }),
    row({ id: 'd', type: 'TRANSFER', amount: 300, date: '2026-10-05', toMode: 'Bank Transfer' }),
    row({ id: 'e', type: 'OUT', amount: 100, date: '2026-10-10', category: 'Raw Materials' }),
    row({ id: 'f', type: 'IN', amount: 900, date: '2026-10-25' })
  ];
  it('carries everything before From into the opening balance', () => {
    const st = periodStatement(rows, '2026-10-01', '2026-10-18');
    assert.equal(st.opening, 750);
  });
  it('totals only the entries inside the period, bounds included', () => {
    const st = periodStatement(rows, '2026-10-02', '2026-10-10');
    assert.deepEqual(st.lines.map((t) => t.id), ['c', 'd', 'e']);
    assert.equal(st.totalIn, 500);
    assert.equal(st.totalOut, 100);
    assert.equal(st.count, 3);
  });
  it('keeps a running balance and closes at opening plus in minus out', () => {
    const st = periodStatement(rows, '2026-10-01', '2026-10-18');
    assert.deepEqual(st.lines.map((t) => t.balance), [1250, 1250, 1150]);
    assert.equal(st.closing, st.opening + st.totalIn - st.totalOut);
  });
  it('an empty period closes at the opening balance', () => {
    const st = periodStatement(rows, '2026-11-01', '2026-11-30');
    assert.equal(st.count, 0);
    assert.equal(st.opening, 2050);
    assert.equal(st.closing, 2050);
  });
});
describe('daily ledger PDF wiring', () => {
  it('the cash in hand card has a PDF icon button that starts the export', () => {
    assert.ok(hero.includes('id="dl-pdf-btn"'));
    assert.ok(hero.includes('dailyLedgerExportPdf()'));
    assert.ok(hero.indexOf('Cash In Hand') < hero.indexOf('id="dl-pdf-btn"'));
    assert.ok(mod.includes('dailyLedgerExportPdf }'));
  });
  it('the period dialog takes From and To as date inputs that the app calendar enhances', () => {
    assert.ok(mod.includes("field('dl-pdf-from', 'From', from)"));
    assert.ok(mod.includes("field('dl-pdf-to', 'To', to)"));
    assert.ok(mod.includes('type="date" id="${id}"'));
    assert.match(mod, /checkPeriod\(fromValue, toValue\)/);
  });
  it('the exported statement uses the chosen period', () => {
    assert.match(mod, /periodStatement\(_rows, period\.from, period\.to\)/);
    assert.match(mod, /Daily_Ledger_\$\{period\.from\}_to_\$\{period\.to\}\.pdf/);
  });
});
describe('cache version', () => {
  it('sw.js and constants.js carry the same version', () => {
    assert.match(sw, /const BUILD_HASH = '18\/10\/2026';/);
    assert.match(constants, /CACHE_VERSION: '18\/10\/2026',/);
  });
});
