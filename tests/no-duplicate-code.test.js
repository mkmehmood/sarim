import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { readSource } from './_extract.js';

const WINDOW_LINES = 8;
const DUPLICATE_WINDOW_BUDGET = 50;

const modules = readdirSync(new URL('../modules/', import.meta.url)).filter(f => f.endsWith('.js')).sort();
const TRIVIAL = /^(\}|\}\)|\}\);|\]|\);|\)|\},|\],|else \{|\} else \{|try \{|return;|\} catch.*)$/;
const IGNORED = /^(import |export \{|window\.\w+ = )/;
const SEPARATELY_STYLED_TABLES = ['utilities-core.js', 'daily-ledger.js'];

function duplicatedWindows() {
  const seen = new Map();
  for (const file of modules) {
    const lines = readSource(`modules/${file}`).split('\n').map(l => l.trim()).filter(l => l && !TRIVIAL.test(l) && !IGNORED.test(l));
    for (let i = 0; i + WINDOW_LINES <= lines.length; i++) {
      const key = lines.slice(i, i + WINDOW_LINES).join('\n');
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key).push(`${file}:${i + 1}`);
    }
  }
  return [...seen.values()].filter(v => v.length > 1);
}

describe('duplicate code budget', () => {
  it(`has at most ${DUPLICATE_WINDOW_BUDGET} repeated ${WINDOW_LINES}-line windows across modules`, () => {
    const dups = duplicatedWindows();
    const sample = dups.slice(0, 5).map(v => v.join(' = ')).join('\n  ');
    assert.ok(
      dups.length <= DUPLICATE_WINDOW_BUDGET,
      `${dups.length} repeated ${WINDOW_LINES}-line windows (budget ${DUPLICATE_WINDOW_BUDGET}). Extract the repeated code into a shared helper instead of copying it. Examples:\n  ${sample}`
    );
  });
});

describe('merged duplicates stay merged', () => {
  const sources = Object.fromEntries(modules.map(f => [f, readSource(`modules/${f}`)]));
  const outside = (allowed, pattern) => Object.entries(sources).filter(([f, s]) => !allowed.includes(f) && pattern.test(s)).map(([f]) => f);

  it('12-hour time strings come from formatTime12', () => {
    assert.deepEqual(outside(['business.js'], /getHours\(\)\s*%\s*12/), []);
    assert.deepEqual(outside(['business.js'], /String\(\w*(h12|hours)\w*\)\.padStart\(2,\s*'0'\)\}:/), []);
  });

  it('numeric form fields are read with readNum', () => {
    assert.deepEqual(outside([], /parseFloat\(document\.getElementById\('[\w-]+'\)\.value\)\s*\|\|\s*0/), []);
  });

  it('several collections are loaded with one loadCollections call, not repeated reads', () => {
    const repeated = /const (\w+) = ensureArray\(await sqliteStore\.get\('\1'\)\);\n[ \t]*const (\w+) = ensureArray\(await sqliteStore\.get\('\2'\)\);/;
    assert.deepEqual(outside([], repeated), []);
  });

  it('stored-record repair goes through repairStoredRecords', () => {
    assert.deepEqual(outside(['business.js'], /!record\.createdAt \|\| !validateTimestamp\(record\.createdAt\)/), []);
  });

  it('show/hide toggles are single expressions, not if/else pairs', () => {
    assert.deepEqual(outside([], /\.style\.display = '';\s*\}\s*else\s*\{\s*[\w.]+\.style\.display = 'none';/), []);
  });

  it('device dates come from localDateStr', () => {
    assert.deepEqual(outside(['finance.js'], /\$\{now\.getFullYear\(\)\}-\$\{(String\(now\.getMonth\(\) \+ 1\)\.padStart|p2\(now\.getMonth)/), []);
  });

  it('date-range cutoffs come from rangeCutoffDate', () => {
    assert.deepEqual(outside([], /switch\s*\(range\)\s*\{\s*case 'today'/), []);
    assert.deepEqual(outside(['utilities-core.js'], /setFullYear\(\w+\.getFullYear\(\)\s*-\s*1\)/), []);
  });

  it('statement row colouring lives only in styleStatementRow', () => {
    assert.deepEqual(outside(SEPARATELY_STYLED_TABLES, /fillColor\s*=\s*\[220,\s*235,\s*255\]/), []);
  });

  it('year-close merge buckets use the shared helpers', () => {
    const s = sources['admin-data.js'];
    assert.equal((s.match(/function _classifyMergeItem\(/g) || []).length, 1);
    assert.equal((s.match(/\n\s+_classifyMergeItem\(b, item, name\);/g) || []).length, 2);
    assert.equal((s.match(/\} = _sumMergeBucket\(sales\)/g) || []).length, 2);
    assert.equal((s.match(/_mergedSettlementFields\(\{/g) || []).length, 2);
    assert.ok(!/b\.partialPaymentTotal \+= \(item\.totalValue/.test(s.replace(/function _classifyMergeItem[\s\S]*?\n\}\n/, '')));
  });

  it('restore writes, delta bookkeeping and cloud upload share one replaceData map', () => {
    const s = sources['utilities-sales.js'];
    assert.ok(!/_restoreDeltaMap|cloudCollections/.test(s));
    assert.ok(/setBatch\(Object\.entries\(replaceData\)\)/.test(s));
    assert.equal((s.match(/Object\.entries\(replaceData\)/g) || []).length, 3);
  });

  it('database recovery sources are built once', () => {
    const s = sources['business.js'];
    assert.equal((s.match(/function _buildDBSources\(/g) || []).length, 1);
    assert.equal((s.match(/= _buildDBSources\(\)/g) || []).length, 2);
    assert.equal((s.match(/name: 'OPFS primary'/g) || []).length, 1);
  });

  it('team settings upload is a single helper', () => {
    const s = sources['utilities-payments.js'];
    assert.equal((s.match(/async function pushTeamSettings\(/g) || []).length, 1);
    assert.equal((s.match(/collection\('settings'\)\.doc\('team'\)\.set\(\{\s*reps: salesRepsList/g) || []).length, 1);
  });
});
