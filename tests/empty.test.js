import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const files = ['index.html', ...readdirSync(new URL('modules/', root)).filter((n) => n.endsWith('.js')).map((n) => 'modules/' + n)];
const css = read('app.css');
const LEGACY = ['rl-empty', 'rl-empty-title', 'rl-empty-hint', 'cm-empty', 'cm-empty-title', 'cx-empty', 'fe-empty', 'u-empty-state-sm', 'u-empty-state-md', 'u-empty-state-danger', 'u-search-empty'];

describe('shared empty state', () => {
  it('legacy empty-state classes are gone everywhere', () => {
    for (const name of LEGACY) {
      const re = new RegExp('(?<![\\w-])' + name + '(?![\\w-])');
      for (const file of files) assert.ok(!re.test(read(file)), `${file} still uses ${name}`);
      assert.ok(!re.test(css), `css still defines ${name}`);
    }
  });

  it('one .empty rule defines the base look', () => {
    assert.equal([...css.matchAll(/^\.empty \{/gm)].length, 1);
    for (const m of ['is-compact', 'is-danger', 'is-boxed']) assert.ok(css.includes(`.empty.${m}`), `missing .empty.${m}`);
  });

  it('layout-only hooks do not repeat the empty look', () => {
    for (const name of ['hc-empty', 'invp-loading']) {
      const m = css.match(new RegExp('^\\.' + name + ' \\{([^}]*)\\}', 'm'));
      assert.ok(m && !/(color|font-size|text-align|padding)\s*:/.test(m[1]), `${name} repeats the empty look`);
    }
  });
});
