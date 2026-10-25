import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const markup = ['index.html', ...readdirSync(new URL('modules/', root)).filter((n) => n.endsWith('.js')).map((n) => 'modules/' + n)];
const src = markup.map(read).join('\n');
const sheet = postcss.parse(read('app.css'));

const VARIANTS = ['store-badge', 'payment-badge', 'seller-badge', 'transaction-badge', 'factory-badge', 'entity-type-badge', 'supply-tag',
  'settled-badge', 'creator-badge', 'old-debt-badge', 'merged-badge', 'managed-by-badge', 'txn-stat-badge', 'txn-label-badge',
  'sales-rep-badge', 'supplier-name-badge', 'sync-status-badge', 'type-tag-badge', 'edited-badge', 'dl-badge', 'dl-tag',
  'units-available-indicator', 'received-indicator'];
const SHAPE = ['display', 'align-items', 'gap', 'padding', 'border-radius', 'font-size', 'font-weight', 'letter-spacing', 'white-space', 'line-height'];

describe('shared badge class', () => {
  it('one .badge rule defines the shape', () => {
    const rules = [];
    sheet.walkRules((r) => { if (r.selector.trim() === '.badge') rules.push(r); });
    assert.equal(rules.length, 1);
    const props = rules[0].nodes.map((d) => d.prop);
    for (const p of ['padding', 'border-radius', 'font-size', 'font-weight']) assert.ok(props.includes(p), `.badge sets ${p}`);
  });

  it('every badge variant in markup also carries .badge', () => {
    const bad = [];
    for (const m of src.matchAll(/class=\\?"([^"\\]*)\\?"/g)) {
      const t = m[1].split(/\s+/);
      if (VARIANTS.some((v) => t.includes(v)) && !t.includes('badge')) bad.push(m[1].slice(0, 60));
    }
    assert.deepEqual(bad, []);
    assert.ok(/className = `badge units-available-indicator/.test(src));
  });

  it('variant rules carry colour and position only, not the shape', () => {
    const stray = [];
    sheet.walkRules((r) => {
      const sels = r.selector.split(',').map((s) => s.trim());
      if (sels.length !== 1) return;
      const cls = VARIANTS.find((v) => new RegExp('^\\.' + v + '(--[\\w-]+|\\.[\\w-]+)*$').test(sels[0]));
      if (!cls) return;
      r.walkDecls((d) => { if (SHAPE.includes(d.prop)) stray.push(`${sels[0]} { ${d.prop} }`); });
    });
    assert.deepEqual(stray, []);
  });
});
