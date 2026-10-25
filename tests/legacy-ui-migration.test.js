import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const markup = ['index.html', ...readdirSync(new URL('modules/', root)).filter((n) => n.endsWith('.js')).map((n) => 'modules/' + n)];
const src = markup.map(read).join('\n');
const css = read('app.css');
const sheet = postcss.parse(css);

const classTokens = () => [...src.matchAll(/class=\\?"([^"\\]*)\\?"/g)].map((m) => m[1].split(/\s+/));
const ownDecls = (cls) => {
  const props = [];
  sheet.walkRules((r) => {
    const sels = r.selector.split(',').map((s) => s.trim());
    if (sels.length > 6) return;
    if (!sels.some((s) => new RegExp('^\\.' + cls + '$').test(s))) return;
    r.walkDecls((d) => props.push(d.prop + ':' + d.value));
  });
  return props;
};

describe('remaining legacy UI migrated to shared classes', () => {
  it('retired class names are gone from markup, scripts and css', () => {
    for (const name of ['status-toggle-btn', 'all-times-summary', 'entity-chip']) {
      assert.ok(!src.includes(name), `${name} still in markup/scripts`);
      assert.ok(!new RegExp('\\.' + name + '(?![\\w-])').test(css), `${name} still in css`);
    }
  });

  it('icon and action buttons carry the shared .btn base', () => {
    const buttons = ['cam-btn', 'cm-menu-btn', 'cm-share', 'fe-del', 'formula-fab', 'pp-bar-clear', 'pp-bar-share'];
    const bad = [];
    for (const t of classTokens()) for (const b of buttons) if (t.includes(b) && !t.includes('btn')) bad.push(t.join(' '));
    assert.deepEqual(bad, []);
  });

  it('variant button rules keep colours and size only, not what .btn provides', () => {
    for (const b of ['cam-btn', 'cm-menu-btn', 'cm-share', 'fe-del', 'formula-fab', 'pp-bar-clear', 'pp-bar-share']) {
      const props = ownDecls(b);
      assert.ok(!props.some((p) => p.startsWith('cursor:')), `${b} repeats cursor`);
      assert.ok(!props.some((p) => /^border:\s*(none|0)$/.test(p)), `${b} repeats the border reset`);
    }
  });

  it('status labels use the shared badge class', () => {
    const bad = classTokens().filter((t) => t.includes('status-badge') && !t.includes('badge')).length;
    assert.equal(bad, 0);
    const props = ownDecls('status-badge');
    assert.ok(!props.includes('background:transparent') && !props.includes('border:none'));
  });

  it('card variants do not redeclare the card surface', () => {
    for (const c of ['sales-rep-chart-box', 'dl-queue-card']) {
      const props = ownDecls(c);
      assert.ok(!props.some((p) => /^(background|border|backdrop-filter|-webkit-backdrop-filter):/.test(p)), `${c} repeats the card surface`);
    }
    assert.ok(!ownDecls('debt-panel').some((p) => p.startsWith('backdrop-filter')));
    assert.ok(/\.card\.is-highlight\s*\{/.test(css));
  });

  it('search field is styled by its class, not by ids', () => {
    assert.ok(!/#unified-search|#customers-card \.search-bar|#rep-customers-card \.search-bar/.test(css));
  });
});
