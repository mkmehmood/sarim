import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { AUX_STATE } from '../modules/link-graph.js';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const files = ['index.html', ...readdirSync(new URL('modules/', root)).filter((n) => n.endsWith('.js')).map((n) => `modules/${n}`)];

const KNOWN = {
  customers: 'sales customers',
  clients: 'rep clients',
  entities: 'payment entities',
  suppliers: 'payee suppliers',
  'ledger-category': 'daily ledger categories',
  'ledger-mode': 'daily ledger modes',
  'ledger-party': 'daily ledger parties',
  'field-expense-category': 'field expense categories',
  'commission-category': 'commission categories'
};

function callSites() {
  const out = [];
  for (const f of files) {
    const text = read(f);
    for (const m of text.matchAll(/handleUniversalSearch\(\s*(['"`])([^'"`]+)\1\s*,\s*(['"`])([^'"`]+)\3\s*,\s*(['"`])([^'"`]+)\5\s*\)/g)) {
      out.push({ file: f, input: m[2], results: m[4], source: m[6] });
    }
  }
  return out;
}

describe('universal search call sites', () => {
  const sites = callSites();

  it('finds the call sites', () => {
    assert.ok(sites.length >= 12, `found ${sites.length}`);
  });

  it('every call uses a known data source', () => {
    const bad = sites.filter((s) => !(s.source in KNOWN) && !s.source.includes('${'));
    assert.deepEqual(bad, []);
  });

  it('every data source has its own case in the search switch', () => {
    const src = read('modules/utilities-payments.js');
    for (const source of Object.keys(KNOWN)) assert.ok(src.includes(`case '${source}'`), source);
  });

  it('no results box is shared by two different inputs or sources', () => {
    const seen = new Map();
    for (const s of sites) {
      if (s.input.includes('${') || s.results.includes('${')) continue;
      const prev = seen.get(s.results);
      if (prev) assert.deepEqual([prev.input, prev.source], [s.input, s.source], `results box ${s.results} is shared`);
      else seen.set(s.results, s);
    }
  });

  it('a given input never searches two different sources', () => {
    const seen = new Map();
    for (const s of sites) {
      if (s.input.includes('${')) continue;
      const prev = seen.get(s.input);
      if (prev) assert.equal(prev, s.source, `${s.input} searches two sources`);
      else seen.set(s.input, s.source);
    }
  });

  it('the two calculator pop-ups use different inputs, result boxes, sources and storage keys', () => {
    const src = read('modules/field-expenses.js');
    const fe = /expense: \{[\s\S]*?nameId: '([^']+)',\s*resultsId: '([^']+)',\s*source: '([^']+)',\s*storeKey: '([^']+)'/.exec(src);
    const cp = /commission: \{[\s\S]*?nameId: '([^']+)',\s*resultsId: '([^']+)',\s*source: '([^']+)',\s*storeKey: '([^']+)'/.exec(src);
    assert.ok(fe && cp);
    for (let i = 1; i <= 4; i++) assert.notEqual(fe[i], cp[i], `slot ${i} is shared`);
    assert.ok(fe[3] in KNOWN && cp[3] in KNOWN);
  });

  it('the calculator category sources read only their own list and never other collections', () => {
    const search = read('modules/utilities-payments.js');
    const start = search.indexOf("case 'field-expense-category':");
    const end = search.indexOf("case 'suppliers':");
    const block = search.slice(start, end);
    assert.ok(block.includes('expenseCategorySearchItems(dataSource, query)'));
    assert.ok(!/\b(sales|rep|clients|customers|entities)\b\s*[.)]/.test(block.replace(/entities/g, '')), 'no other collection is read in this case');
    const mod = read('modules/field-expenses.js');
    assert.ok(!/loadCollections|dailyLedgerSearchItems|window\.(sales|rep)/.test(mod));
  });

  it('customer and rep sources stay inside their own profile', () => {
    const src = read('modules/utilities-payments.js');
    assert.match(src, /s\.currentRepProfile === 'admin'/);
    assert.match(src, /s\.salesRep === currentRepProfile/);
    assert.match(src, /c\.salesRep === currentRepProfile/);
    assert.match(src, /entity\.type === 'payee'/);
  });

  it('the daily ledger sources read only the ledger lists', () => {
    const src = read('modules/daily-ledger.js');
    const fn = src.slice(src.indexOf('export async function dailyLedgerSearchItems'), src.indexOf('export function dailyLedgerOnPick'));
    assert.ok(!/field_expense|commission_categories|sales|rep\b/.test(fn));
  });
});

describe('category lists sync to the cloud on their own keys', () => {
  it('each list has its own backup entry, timestamp key and cloud document', () => {
    const fe = AUX_STATE.find((s) => s.sqlite === 'field_expense_categories');
    const cp = AUX_STATE.find((s) => s.sqlite === 'commission_categories');
    assert.ok(fe && cp);
    assert.equal(fe.kind, 'list');
    assert.equal(cp.kind, 'list');
    assert.notEqual(fe.tsKey, cp.tsKey);
    assert.notEqual(fe.firestore.doc, cp.firestore.doc);
    assert.equal(fe.firestore.doc, 'field_expense_categories/list');
    assert.equal(cp.firestore.doc, 'commission_categories/list');
  });

  it('sync.js listens, downloads, merges and uploads both lists', () => {
    const src = read('modules/sync.js');
    assert.match(src, /const CATEGORY_LIST_KEYS = \['field_expense_categories', 'commission_categories'\]/);
    assert.match(src, /userRef\.collection\(catKey\)\.doc\('list'\)\.onSnapshot/);
    assert.match(src, /categoryLists: categoryListSnaps/);
    assert.match(src, /_applyCategoryListFromCloud\(catKey, catSnap\.data\(\)\)/);
    assert.match(src, /collectionsUploaded\.add\(catKey\)/);
  });

  it('saving a category stamps the list and triggers a sync', () => {
    const src = read('modules/field-expenses.js');
    assert.match(src, /setBatch\(\[\[key, next\], \[`\$\{key\}_timestamp`, Date\.now\(\)\]\]\)/);
    assert.match(src, /triggerAutoSync\(\)/);
  });
});
