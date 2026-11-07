// Makes a module lazy by removing the static imports of it, rewriting every reference in the
// importers into a late-bound window lookup.
//
//   node scripts/lazy-module.mjs <module.js> --hooks a,b --data x [--dry]
//
//   hooks : refresh/render functions. Until the module is loaded they do nothing:
//           f(x)        -> window.f?.(x)
//           typeof f    -> typeof window.f
//           f (a value) -> ((...args) => window.f?.(...args))
//   data  : values the module owns that are read elsewhere: x -> window.x (the module must
//           publish a live getter for it)
//   other : every other imported function is an entry point. It is stubbed at start-up (see
//           modules/screen-registry.js) so calling it loads the module first:
//           f(x) -> window.f(x),  typeof f -> typeof window.f
//
// References are found with scope analysis, so only real uses of the imported binding change.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as eslintScope from 'eslint-scope';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const target = argv.find(a => !a.startsWith('--') && a.endsWith('.js'));
const opt = f => { const i = argv.indexOf(f); return i >= 0 ? (argv[i + 1] || '').split(',').filter(Boolean) : []; };
const HOOKS = new Set(opt('--hooks'));
const DATA = new Set(opt('--data'));
const DRY = argv.includes('--dry');
if (!target) { console.error('usage: lazy-module.mjs <module.js> --hooks a,b --data x [--dry]'); process.exit(2); }

const rd = f => readFileSync(join(ROOT, 'modules', f), 'utf8');
const changed = [];
const summary = {};
for (const f of readdirSync(join(ROOT, 'modules')).filter(n => n.endsWith('.js') && n !== target)) {
  const src = rd(f);
  if (!new RegExp(`from '\\./${target.replace('.', '\\.')}'`).test(src)) continue;
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
  const imp = ast.body.find(n => n.type === 'ImportDeclaration' && n.source.value === './' + target);
  const local = new Map(imp.specifiers.map(s => [s.local.name, s.imported.name]));
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module', range: true });
  const positions = new Set();
  const walkScopes = sc => {
    for (const r of sc.references) {
      const v = r.resolved;
      if (v && v.defs.length && v.defs[0].type === 'ImportBinding' && local.has(r.identifier.name) && v.defs[0].parent === imp) positions.add(r.identifier.start);
    }
    sc.childScopes.forEach(walkScopes);
  };
  walkScopes(sm.globalScope);
  const edits = [];
  const visit = (n, parent, key) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(x => visit(x, parent, key)); return; }
    if (typeof n.type !== 'string') return;
    if (n.type === 'ImportDeclaration') return;
    if (n.type === 'Identifier' && positions.has(n.start)) {
      const name = local.get(n.name);
      if (parent && parent.type === 'Property' && parent.shorthand) { console.error(`${f}: shorthand use of ${n.name}`); process.exit(1); }
      const isCallee = parent && parent.type === 'CallExpression' && key === 'callee';
      const isTypeof = parent && parent.type === 'UnaryExpression' && parent.operator === 'typeof';
      let text;
      if (DATA.has(name)) text = `window.${name}`;
      else if (isTypeof) text = `window.${name}`;
      else if (isCallee) text = HOOKS.has(name) ? `window.${name}?.` : `window.${name}`;
      else text = HOOKS.has(name) ? `((...args) => window.${name}?.(...args))` : `((...args) => window.${name}(...args))`;
      edits.push({ start: n.start, end: n.end, text });
      (summary[name] ||= []).push(f);
      return;
    }
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') visit(n[k], n, k);
  };
  visit(ast.body, null, null);
  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  const importText = src.slice(imp.start, imp.end);
  out = out.replace(importText + '\n', '');
  changed.push({ f, out, count: edits.length });
}
for (const c of changed) console.log(`${c.f}: ${c.count} reference(s) rewritten, import of ${target} removed`);
const names = Object.keys(summary).sort();
console.log('names: ' + names.map(n => `${n}${HOOKS.has(n) ? '[hook]' : DATA.has(n) ? '[data]' : '[entry]'}`).join(', '));
if (DRY) process.exit(0);
for (const c of changed) writeFileSync(join(ROOT, 'modules', c.f), c.out);
