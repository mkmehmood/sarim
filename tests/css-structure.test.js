import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import { readSource } from './_extract.js';

const IMPORTANT_BUDGET = 97;
const SPECIFICITY_PADDING_BUDGET = 39;
const ROOT_AT_RULES = new Set(['import', 'font-face', 'keyframes', 'media', 'supports']);
const CONDITIONAL = new Set(['media', 'supports']);
const root = postcss.parse(readSource('app.css'));

const where = n => `line ${n.source.start.line}`;
const isFallbackPair = (a, b) => a.parent === b.parent;

function conditionOf(rule) {
  let p = rule.parent;
  const parts = [];
  while (p && p.type !== 'root') {
    if (p.type === 'atrule') parts.push(`@${p.name} ${p.params}`);
    p = p.parent;
  }
  return parts.join(' ');
}

describe('app.css is a flat, root-level stylesheet', () => {
  it('has no @layer blocks or statements; the only layer is the vendor import', () => {
    const layers = [];
    root.walkAtRules('layer', n => layers.push(where(n)));
    assert.deepEqual(layers, [], `@layer found at ${layers.join(', ')}. Put the rule at root level and give it the specificity it needs instead of a higher layer.`);
    const imports = [];
    root.walkAtRules('import', n => imports.push(n.params.replace(/\s+/g, ' ')));
    assert.deepEqual(imports, ["url('vendor/leaflet/leaflet.css') layer(vendor)"]);
  });

  it('has no nested rules', () => {
    const nested = [];
    root.walkRules(r => { if (r.parent.type === 'rule') nested.push(`${where(r)} ${r.selector}`); });
    assert.deepEqual(nested, [], `Nested rules: ${nested.join('; ')}`);
  });

  it('only uses root-level @import, @font-face, @keyframes, @media and @supports, never inside each other', () => {
    const bad = [];
    root.walkAtRules(n => {
      const top = n.parent.type === 'root';
      if (!ROOT_AT_RULES.has(n.name)) bad.push(`${where(n)} @${n.name}`);
      else if (!top) bad.push(`${where(n)} @${n.name} nested in @${n.parent.name}`);
    });
    assert.deepEqual(bad, []);
  });

  it('keeps every style rule either at root or directly inside one @media/@supports', () => {
    const bad = [];
    root.walkRules(r => {
      const p = r.parent;
      const ok = p.type === 'root' || (p.type === 'atrule' && (CONDITIONAL.has(p.name) || p.name === 'keyframes') && p.parent.type === 'root');
      if (!ok) bad.push(`${where(r)} ${r.selector}`);
    });
    assert.deepEqual(bad, []);
  });
});

describe('app.css carries no overrides', () => {
  it('never declares the same property twice for one selector in separate rules of the same context', () => {
    const seen = new Map();
    const clashes = [];
    root.walkRules(r => {
      if (r.parent.type === 'atrule' && r.parent.name === 'keyframes') return;
      const ctx = conditionOf(r);
      for (const sel of r.selectors.map(s => s.replace(/\s+/g, ' ').trim())) {
        r.each(d => {
          if (d.type !== 'decl') return;
          const key = `${ctx}||${sel}||${d.prop}`;
          const prev = seen.get(key);
          if (prev && prev.parent !== r && prev.value !== d.value) clashes.push(`${sel} { ${d.prop} } at ${where(prev)} is overridden at ${where(d)}`);
          seen.set(key, d);
        });
      }
    });
    assert.deepEqual(clashes, [], `Merge the later value into the earlier rule instead of overriding it:\n${clashes.join('\n')}`);
  });

  it('only repeats a property inside one rule as a deliberate fallback, with the supported value last', () => {
    const odd = [];
    root.walkRules(r => {
      const last = new Map();
      r.each(d => { if (d.type === 'decl') { const k = d.prop.toLowerCase(); if (last.has(k) && last.get(k).value === d.value) odd.push(`${where(d)} ${r.selector} repeats ${d.prop}: ${d.value}`); last.set(k, d); } });
    });
    assert.deepEqual(odd, []);
  });

  it(`uses !important at most ${IMPORTANT_BUDGET} times`, () => {
    let n = 0;
    root.walkDecls(d => { if (d.important) n++; });
    assert.ok(n <= IMPORTANT_BUDGET, `${n} !important declarations (budget ${IMPORTANT_BUDGET}). Fix the selector instead of forcing the value.`);
  });

  it(`pads selector specificity with :not(._) / :not(#_) at most ${SPECIFICITY_PADDING_BUDGET} times`, () => {
    const n = (readSource('app.css').match(/:not\((?:\._|#_)\)/g) || []).length;
    assert.ok(n <= SPECIFICITY_PADDING_BUDGET, `${n} padded selectors (budget ${SPECIFICITY_PADDING_BUDGET}). Restructure the rule instead of padding its specificity.`);
  });
});

describe('code that copies the stylesheet relies on it being flat', () => {
  it('invoice image capture copies every non-import rule instead of filtering by selector text', () => {
    const src = readSource('modules/dialog-image.js');
    assert.ok(!/NEEDED_RULE/.test(src), 'collectCss must not filter top-level rules: the stylesheet has no @layer blocks that used to carry them in whole');
  });
});
