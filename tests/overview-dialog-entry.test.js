import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildOverview, overviewHtml, analyseProfit } from '../modules/overview-data.js';
import { planFields, applyValues } from '../modules/overview-fix.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const now = new Date(2026, 10, 16);
const good = { id: 's0', date: '2026-11-01', time: '10:00', customerName: 'Ali', quantity: 10, unitPrice: 100, totalValue: 1000, totalCost: 800, profit: 200, paymentType: 'CASH', creditReceived: true };
const model = (data) => buildOverview(data, now, 3);

describe('every row in the checks panel can open the dialog', () => {
  const sales = [
    { ...good, id: 'a', time: '1', totalCost: 0, profit: 1000 },
    { ...good, id: 'b', time: '2', quantity: 10, totalValue: 700, totalCost: 900, profit: -200 },
  ];
  const html = overviewHtml(model({ sales, transactions: [{ id: 't', date: '2026-11-02', type: 'X', amount: 5 }] }), 3);

  it('the tally rows are buttons that open the first record with that problem', () => {
    assert.match(html, /<button type="button" class="ov-check sx-tone-bad" data-fix-code="txn_bad_type">/);
    assert.match(html, /<button type="button" class="ov-check sx-tone-warn" data-fix-code="sale_no_cost">/);
    assert.doesNotMatch(html, /<div class="ov-check sx-tone/);
  });

  it('there is a Fix one by one button only when something needs fixing', () => {
    assert.match(html, /data-fix-all="1">Fix one by one</);
    assert.doesNotMatch(overviewHtml(model({ sales: [good] }), 3), /data-fix-all/);
  });

  it('the biggest-loss rows open the dialog on the exact sale, not just the Sales tab', () => {
    const worst = analyseProfit(sales, new Set(['2026-11']));
    assert.deepEqual(worst.worst.map((w) => [w.idx, w.profit]), [[1, -200]]);
    assert.match(html, /class="ov-recent-row sx-tone-bad" data-fix="sales:1"/);
    assert.doesNotMatch(html, /data-go=/);
  });

  it('a losing sale that has no data problem still gets a form with its value and cost', () => {
    const plan = planFields('sales', sales[1], ['sale_loss'], '2026-11-16');
    assert.deepEqual(plan.fields.map((f) => f.key), ['totalValue', 'totalCost']);
    const next = applyValues('sales', sales[1], { totalCost: 600 });
    assert.deepEqual([next.totalCost, next.profit], [600, 100]);
  });
});

describe('the dialog flow in overview.js', () => {
  const src = read('../modules/overview.js');

  it('opens an inspect dialog for a losing sale that passes every data check', () => {
    assert.match(src, /col === 'sales' && rec && !rec\.isDeleted && Number\(rec\.profit\) < 0/);
    assert.match(src, /codes: \['sale_loss'\]/);
    assert.match(src, /No data problem found\./);
  });

  it('handles tally rows and the one-by-one button', () => {
    assert.match(src, /e\.target\.closest\('\[data-fix-all\]'\)\) \{ fixAll\(\); return; \}/);
    assert.match(src, /closest\('\[data-fix-code\]'\)/);
    assert.match(src, /async function fixByCode\(code\)/);
    assert.match(src, /async function fixAll\(\)/);
    assert.match(src, /const status = await openFix\(f\.collection, f\.idx, \{ sequence: true \}\);\n    if \(status === 'closed'\) break;/);
  });

  it('offers Stop and Skip in the sequence, and reports how each record ended', () => {
    assert.match(src, /opts\.sequence \? \{ label: 'Stop', variant: 'ghost', value: null \} : \{ label: 'Cancel', variant: 'ghost', value: null \}/);
    assert.match(src, /actions\.push\(\{ label: 'Skip', variant: 'ghost', value: 'skip' \}\)/);
    assert.match(src, /status = 'skipped'/);
    assert.match(src, /status = 'closed'/);
    assert.match(src, /return status;\n\}/);
  });

  it('labels the dialog by how serious the problem is instead of the generic permanent label', () => {
    assert.match(src, /eyebrow: finding\.severity === 'error' \? 'Needs fixing' : 'Please check'/);
  });

  it('re-audits before every record so deletes and fixes never leave stale positions', () => {
    assert.match(src, /for \(let n = 0; n < 1000; n \+= 1\) \{\n    const audit = await loadAudit\(\);/);
    assert.match(src, /done\.add\(`\$\{f\.collection\}:\$\{f\.id \|\| f\.idx\}`\)/);
  });
});
