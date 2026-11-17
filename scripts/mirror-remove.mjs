// Removes local "mirror" variables of the UI-state registry in utilities-core.js.
//
//   node scripts/mirror-remove.mjs <home-module.js> name1,name2,... [--dry]
//
// A mirror is   export let X = d;  window.X = X;  export function _set_X(v) {...}
// plus a line in a __uiSyncers block. The registry already owns X (window.X is a get/set
// accessor with a default), so the mirror is deleted and every reference becomes window.X:
//   X            -> window.X
//   _set_X(v)    -> window.X = v
// References are found with scope analysis, in the home module and in every importer.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as eslintScope from 'eslint-scope';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const home = argv[0];
const names = (argv[1] || '').split(',').filter(Boolean);
const DRY = argv.includes('--dry');
if (!home || !names.length) { console.error('usage: mirror-remove.mjs <home-module.js> a,b,c [--dry]'); process.exit(2); }

const registry = readFileSync(join(ROOT, 'modules/utilities-core.js'), 'utf8');
for (const n of names) {
  if (!new RegExp(`^  ${n}: *\\{ get`, 'm').test(registry)) { console.error(`${n} is not an accessor in the UI-state registry`); process.exit(1); }
}

const files = readdirSync(join(ROOT, 'modules')).filter(f => f.endsWith('.js'));
const src = Object.fromEntries(files.map(f => [f, readFileSync(join(ROOT, 'modules', f), 'utf8')]));

let h = src[home];
for (const n of names) {
  const decl = new RegExp(`^export let ${n} = [^\\n]*;\\n`, 'm');
  const pub = new RegExp(`^window\\.${n} = ${n};\\n`, 'm');
  const setter = new RegExp(`^export function _set_${n}\\(v\\) \\{[^\\n]*\\}\\n`, 'm');
  const sync = new RegExp(`^ *try \\{ const v = window\\.${n}; if \\(v !== undefined\\) ${n} = v; \\} catch \\(_\\) \\{\\}\\n`, 'm');
  for (const [label, re] of [['declaration', decl], ['publish', pub], ['setter', setter]]) {
    if (!re.test(h)) { console.error(`${home}: ${label} of ${n} not found in the expected one-line form`); process.exit(1); }
    h = h.replace(re, '');
  }
  h = h.replace(sync, '');
}
src[home] = h;

const targets = new Set(names);
const setters = new Map(names.map(n => [`_set_${n}`, n]));
const out = {};
const counts = {};
for (const f of files) {
  let text = src[f];
  if (!names.some(n => text.includes(n))) continue;
  const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module', range: true });
  const refPos = new Map();
  const walkScopes = sc => {
    for (const r of sc.references) {
      const nm = r.identifier.name;
      if (!targets.has(nm) && !setters.has(nm)) continue;
      const v = r.resolved;
      const imported = v && v.defs.length && v.defs[0].type === 'ImportBinding' && v.defs[0].parent.source.value === './' + home;
      if (imported || (!v && f === home) || (!v && f !== home && false)) refPos.set(r.identifier.start, nm);
    }
    sc.childScopes.forEach(walkScopes);
  };
  walkScopes(sm.globalScope);
  if (!refPos.size) continue;
  const edits = [];
  const visit = (n, parent, key) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(x => visit(x, parent, key)); return; }
    if (typeof n.type !== 'string') return;
    if (n.type === 'ImportDeclaration') return;
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && refPos.has(n.callee.start) && setters.has(n.callee.name)) {
      const name = setters.get(n.callee.name);
      if (n.arguments.length !== 1) { console.error(`${f}: unexpected arguments in ${n.callee.name}()`); process.exit(1); }
      const arg = text.slice(n.arguments[0].start, n.arguments[0].end);
      const stmt = parent && parent.type === 'ExpressionStatement';
      edits.push({ start: n.start, end: n.end, text: stmt ? `window.${name} = ${arg}` : `(window.${name} = ${arg})` });
      refPos.delete(n.callee.start);
      return;
    }
    if (n.type === 'Identifier' && refPos.has(n.start)) {
      const nm = refPos.get(n.start);
      if (setters.has(nm)) { console.error(`${f}: ${nm} used as a value`); process.exit(1); }
      if (parent && parent.type === 'Property' && parent.shorthand) { console.error(`${f}: shorthand use of ${nm}`); process.exit(1); }
      edits.push({ start: n.start, end: n.end, text: `window.${nm}` });
      counts[nm] = (counts[nm] || 0) + 1;
      return;
    }
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') visit(n[k], n, k);
  };
  visit(ast.body, null, null);
  for (const e of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.text + text.slice(e.end);
  out[f] = (out[f] || 0) + edits.length;
  src[f] = text;
}

for (const f of files) {
  let text = src[f];
  const before = text;
  text = text.replace(/^window\.([\w$]+) = window\.\1;\n/gm, '');
  text = text.replace(/ window\.([\w$]+) = window\.\1;(?=\n)/g, '');
  const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
  const used = new Set();
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module', range: true });
  const gather = sc => { for (const r of sc.references) if (r.resolved && r.resolved.defs.length && r.resolved.defs[0].type === 'ImportBinding') used.add(r.resolved); sc.childScopes.forEach(gather); };
  gather(sm.globalScope);
  const edits = [];
  for (const n of ast.body.filter(x => x.type === 'ImportDeclaration' && x.source.value === './' + home)) {
    const keep = n.specifiers.filter(s => {
      const nm = s.local.name;
      if (!targets.has(nm) && !setters.has(nm)) return true;
      return false;
    });
    if (keep.length === n.specifiers.length) continue;
    if (!keep.length) edits.push({ start: n.start, end: n.end + (text[n.end] === '\n' ? 1 : 0), text: '' });
    else {
      const named = keep.map(s => (s.imported.name === s.local.name ? s.local.name : `${s.imported.name} as ${s.local.name}`));
      edits.push({ start: n.start, end: n.end, text: `import { ${named.join(', ')} } from '${n.source.value}';` });
    }
  }
  for (const e of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, e.start) + e.text + text.slice(e.end);
  if (text !== before) { acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' }); src[f] = text; out[f] = out[f] || 0; }
}

for (const f of Object.keys(out)) console.log(`${f}: ${out[f]} reference(s) rewritten`);
console.log('by name: ' + Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', '));
if (DRY) process.exit(0);
for (const f of files) if (src[f] !== readFileSync(join(ROOT, 'modules', f), 'utf8')) writeFileSync(join(ROOT, 'modules', f), src[f]);
