import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import * as acorn from 'acorn';
import { parseScreen } from '../scripts/screen-compile.mjs';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const parse = code => acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });

const exportsCache = new Map();
function exportsOf(file) {
  if (exportsCache.has(file)) return exportsCache.get(file);
  const names = new Set();
  exportsCache.set(file, names);
  const ast = parse(read(`modules/${file}`));
  for (const n of ast.body) {
    if (n.type === 'ExportNamedDeclaration') {
      const d = n.declaration;
      if (d) {
        if (d.id) names.add(d.id.name);
        for (const x of d.declarations || []) collect(x.id, names);
      }
      for (const s of n.specifiers) names.add(s.exported.name);
    } else if (n.type === 'ExportDefaultDeclaration') names.add('default');
    else if (n.type === 'ExportAllDeclaration' && n.source) for (const x of exportsOf(n.source.value.replace('./', ''))) names.add(x);
  }
  return names;
}
function collect(p, out) {
  if (!p) return;
  if (p.type === 'Identifier') out.add(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach(q => collect(q.value || q.argument, out));
  else if (p.type === 'ArrayPattern') p.elements.forEach(e => collect(e, out));
  else if (p.type === 'AssignmentPattern') collect(p.left, out);
  else if (p.type === 'RestElement') collect(p.argument, out);
}

function importProblems(label, code) {
  const problems = [];
  for (const n of parse(code).body) {
    if (n.type !== 'ImportDeclaration' || !n.source.value.startsWith('./')) continue;
    const target = n.source.value.slice(2);
    if (target.endsWith('.screen.js')) {
      if (!existsSync(new URL(`screens/${target.replace('.screen.js', '.screen.html')}`, root))) problems.push(`${label}: ${target} has no screen file`);
      continue;
    }
    if (!existsSync(new URL(`modules/${target}`, root))) { problems.push(`${label}: modules/${target} does not exist`); continue; }
    const have = exportsOf(target);
    for (const s of n.specifiers) {
      if (s.type === 'ImportSpecifier' && !have.has(s.imported.name)) problems.push(`${label}: ${target} does not export ${s.imported.name}`);
      if (s.type === 'ImportDefaultSpecifier' && !have.has('default')) problems.push(`${label}: ${target} has no default export`);
    }
  }
  return problems;
}

test('every named import in every module resolves to a real export', () => {
  const problems = [];
  for (const f of readdirSync(new URL('modules/', root)).filter(n => n.endsWith('.js'))) problems.push(...importProblems(`modules/${f}`, read(`modules/${f}`)));
  assert.deepEqual(problems, []);
});

test('every named import in every screen script resolves to a real export', () => {
  const problems = [];
  for (const f of readdirSync(new URL('screens/', root)).filter(n => n.endsWith('.screen.html'))) {
    const { js } = parseScreen(read(`screens/${f}`), f);
    problems.push(...importProblems(`screens/${f}`, js));
  }
  assert.deepEqual(problems, []);
});
