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

describe('remaining icon and chip buttons use the shared .btn base', () => {
  const NAMES = ['pf-chip', 'pf-photo-add', 'txn-kebab-btn', 'pp-icon-btn', 'pp-clear', 'lb-close', 'screen-back-btn', 'sidebar-hamburger', 'dlg-eye', 'cy-continue-btn'];
  it('every such <button> carries btn', () => {
    const bad = [];
    for (const m of src.matchAll(/<button\b[^>]*?class=\\?"([^"\\]*)\\?"/g)) {
      const t = m[1].split(/\s+/);
      if (NAMES.some((n) => t.includes(n)) && !t.includes('btn')) bad.push(m[1]);
    }
    assert.deepEqual(bad, []);
    assert.ok(src.includes("className = 'btn factory-row-del-btn'"));
  });
  it('their rules do not repeat the cursor or border resets', () => {
    for (const n of [...NAMES, 'factory-row-del-btn']) {
      const props = ownDecls(n);
      assert.ok(!props.includes('cursor:pointer'), `${n} repeats cursor`);
      assert.ok(!props.some((p) => /^border:(none|0)$/.test(p)), `${n} repeats border reset`);
    }
  });
});

describe('shared overlay surface', () => {
  it('one .overlay rule defines the frosted surface', () => {
    const rules = [];
    sheet.walkRules((r) => { if (r.selector.trim() === '.overlay') rules.push(r); });
    assert.equal(rules.length, 1);
    const props = rules[0].nodes.map((d) => d.prop);
    for (const p of ['background', 'border', 'box-shadow', 'backdrop-filter']) assert.ok(props.includes(p), p);
  });
  it('sheet, menu and popover carry .overlay and do not redeclare the surface', () => {
    assert.ok(/id="cm-sheet" class="overlay cm-sheet"/.test(src));
    assert.ok(src.includes("className = 'overlay cm-menu'") && src.includes("className = 'overlay cdp-popover'"));
    for (const c of ['cm-menu', 'cdp-popover', 'cm-sheet']) {
      assert.ok(!ownDecls(c).some((p) => /^(background|border|backdrop-filter|-webkit-backdrop-filter):/.test(p)), `${c} repeats the overlay surface`);
    }
    assert.ok(!/\.factory-overlay-card\s*\{/.test(readFileSync(new URL('app.css', root), 'utf8')));
  });
});

describe('shared list row', () => {
  it('one .row rule and one sibling divider', () => {
    let rows = 0, divider = 0;
    sheet.walkRules((r) => { if (r.selector.trim() === '.row') rows++; if (r.selector.trim() === '.row + .row') divider++; });
    assert.equal(rows, 1);
    assert.equal(divider, 1);
  });
  it('cm-row and rl-row carry .row and keep layout only', () => {
    assert.ok(/class="row cm-row/.test(src) && /class="row rl-row/.test(src));
    for (const c of ['cm-row', 'rl-row']) {
      const props = ownDecls(c);
      assert.ok(!props.some((p) => /^(background|border|border-bottom|color|text-align):/.test(p)), `${c} repeats row styling`);
    }
    assert.ok(!/\.cm-row \+ \.cm-row|\.rl-row:last-child/.test(readFileSync(new URL('app.css', root), 'utf8')));
  });
});

describe('shared title', () => {
  it('one .title rule with size modifiers', () => {
    let n = 0;
    sheet.walkRules((r) => { if (r.selector.trim() === '.title') n++; });
    assert.equal(n, 1);
    assert.ok(/\.title-sm \{/.test(readFileSync(new URL('app.css', root), 'utf8')) && /\.title-md \{/.test(readFileSync(new URL('app.css', root), 'utf8')));
  });
  it('card, sheet, queue and dialog titles carry .title and do not repeat its weight', () => {
    for (const c of ['hc-title', 'cm-sheet-title', 'dl-queue-title', 'dlg-title']) {
      const re = new RegExp('class=\\\\?"(?:[^"\\\\]* )?title(?: [^"\\\\]*)? ' + c + '|class=\\\\?"title ' + c);
      assert.ok(re.test(src), c + ' markup carries title');
      assert.ok(!ownDecls(c).some((p) => /^(font-weight|letter-spacing):/.test(p)), c + ' repeats title weight');
    }
    assert.ok(!/overview-title/.test(readFileSync(new URL('app.css', root), 'utf8')));
  });
});

describe('shared stat tile', () => {
  const cssText = readFileSync(new URL('app.css', root), 'utf8');
  it('one .stat rule with label, value and sub, declared after .card', () => {
    assert.equal((cssText.match(/^\.stat \{/gm) || []).length, 1);
    for (const c of ['.stat-label', '.stat-value', '.stat-sub']) assert.ok(cssText.includes(c + ' {') || cssText.includes(c + ':not'), c);
    assert.ok(cssText.lastIndexOf('\n.card {') < cssText.indexOf('\n.stat {'), '.stat must come after every .card rule');
  });
  it('legacy tile names are gone and tiles carry .stat', () => {
    for (const n of ['sx-tile', 'cust-stat-chip', 'cust-stat-label', 'cust-stat-value']) {
      assert.ok(!src.includes(n) && !new RegExp('\\.' + n + '(?![\\w-])').test(cssText), n + ' remains');
    }
    assert.ok(/class="card stat hc-metric/.test(src));
  });
});

describe('settings pickers reuse the settings list item', () => {
  const htmlText = readFileSync(new URL('index.html', root), 'utf8');
  it('fb-select buttons carry card and settings-list-item', () => {
    const tags = [...htmlText.matchAll(/<button[^>]*class="([^"]*\bfb-select\b[^"]*)"/g)].map((m) => m[1].split(/\s+/));
    assert.ok(tags.length >= 2);
    for (const t of tags) assert.ok(t.includes('card') && t.includes('settings-list-item'), t.join(' '));
  });
  it('fb-select no longer redeclares the surface or the text styles', () => {
    assert.ok(!ownDecls('fb-select').some((p) => /^(background|border|border-radius|padding|display|gap|cursor):/.test(p)));
    assert.ok(!/fb-select-(text|title|desc)/.test(htmlText));
  });
  it('every select and picker button still uses form-ctl', () => {
    const selects = [...src.matchAll(/<select\b[^>]*>/g)].map((m) => m[0]);
    assert.ok(selects.length > 0 && selects.every((t) => /form-ctl/.test(t)));
    assert.ok(/class="form-ctl bm-picker"/.test(src));
  });
});

describe('daily ledger summary tiles use .stat', () => {
  const htmlText = readFileSync(new URL('index.html', root), 'utf8');
  it('dl-stat is gone and the tiles carry stat-label / stat-value', () => {
    assert.ok(!/dl-stat(?![\w-]*s\b)(?!s)/.test(htmlText.replace(/dl-stats/g, '')));
    assert.ok(!/\.dl-stat(?![\w-])/.test(readFileSync(new URL('app.css', root), 'utf8')));
    const tiles = htmlText.match(/<div class="stat"><span class="stat-label">/g) || [];
    assert.equal(tiles.length, 6);
  });
});

describe('shared panel and callout', () => {
  const cssText = readFileSync(new URL('app.css', root), 'utf8');
  const PANELS = ['cm-summary', 'hc-more', 'dl-queue-row', 'formula-unit-display', 'production-unit-info'];
  const CALLOUTS = ['txn-preclose-panel', 'warning-message', 'cost-display', 'cy-result-card', 'formula-display', 'edit-mode-banner', 'discrepancy-alert', 'discrepancy-ok'];
  it('one .panel and one .callout rule', () => {
    assert.equal((cssText.match(/^\.panel \{/gm) || []).length, 1);
    assert.equal((cssText.match(/^\.callout \{/gm) || []).length, 1);
  });
  it('members carry the shared class and do not redeclare the surface', () => {
    const bad = [];
    for (const m of src.matchAll(/class=\\?"([^"\\]*)\\?"/g)) {
      const t = m[1].split(/\s+/);
      for (const [list, cls] of [[PANELS, 'panel'], [CALLOUTS, 'callout']]) if (list.some((n) => t.includes(n)) && !t.includes(cls)) bad.push(m[1]);
    }
    assert.deepEqual(bad, []);
    for (const n of [...PANELS, ...CALLOUTS]) {
      assert.ok(!ownDecls(n).some((p) => /^(background|background-color|border|border-color|border-radius):/.test(p)), n + ' repeats the surface');
    }
    for (const n of CALLOUTS) assert.ok(ownDecls(n).some((p) => p.startsWith('--tone:')), n + ' sets --tone');
  });
});

describe('dead css removed', () => {
  it('unreferenced chart, checkbox and toggle-track classes are gone', () => {
    const cssText = readFileSync(new URL('app.css', root), 'utf8');
    for (const n of ['sc-bar-chart', 'sc-pie-svg', 'sc-legend', 'sc-donut-total', 'credit-checkbox', 'theme-toggle-track', 'theme-toggle-switch', 'sm-combined', 'sx-overview', 'scroll-x']) {
      assert.ok(!new RegExp('\\.' + n + '(?![\\w-])').test(cssText), n + ' is back');
    }
    for (const live of ['sc-host', 'sc-tooltip', 'sc-dot-end']) assert.ok(new RegExp('\\.' + live + '(?![\\w-])').test(cssText), live + ' is still used');
  });
});

describe('generated utility classes stay referenced', () => {
  it('every u-*, st-* and dc-* class in app.css is used by markup, scripts or tests', () => {
    const everything = [src, ...readdirSync(new URL('tests/', root)).filter((n) => n.endsWith('.js')).map((n) => read('tests/' + n))].join('\n');
    const names = new Set();
    sheet.walkRules((r) => { for (const m of r.selector.matchAll(/\.((?:u|st|dc)-[\w-]+)/g)) names.add(m[1]); });
    const unused = [...names].filter((n) => !everything.includes(n));
    assert.deepEqual(unused, []);
  });
});
