import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../modules/cm-ledger.js', import.meta.url), 'utf8');
const cfgBlock = src.slice(src.indexOf('const CFG = {'), src.indexOf('const lbl ='));

test('every ledger kind keeps `filters` as a DOM id string', () => {
  assert.equal((cfgBlock.match(/\bfilters:/g) || []).length, 3, 'one `filters` id per kind, no duplicates');
  for (const id of ['customerHistoryFilters', 'repCustomerHistoryFilters', 'entityHistoryFilters']) {
    assert.ok(cfgBlock.includes(`filters: '${id}'`), `missing filters id ${id}`);
  }
});

test('chip rendering only maps over an array', () => {
  assert.match(src, /Array\.isArray\(c\.filterChips\)/);
  assert.doesNotMatch(src, /c\.filters\s*\|\|\s*\[\[/);
});
