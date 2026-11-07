import fs from 'node:fs'; import * as acorn from 'acorn'; import * as es from 'eslint-scope';
const src = fs.readFileSync('modules/factory.js', 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', ranges: true, locations: true });
const sm = es.analyze(ast, { ecmaVersion: 2022, sourceType: 'module', range: true });
const top = new Map(); const order = [];
for (const n of ast.body) { const d = n.type === 'ExportNamedDeclaration' ? n.declaration : n; if (!d) continue;
  const ns = d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration' ? [d.id.name] : d.type === 'VariableDeclaration' ? d.declarations.map(x => x.id.name).filter(Boolean) : [];
  const kind = d.type === 'FunctionDeclaration' ? 'fn' : d.type === 'VariableDeclaration' ? d.kind : 'cls';
  ns.forEach(x => { top.set(x, { n, kind, exported: n.type === 'ExportNamedDeclaration' }); order.push(x); }); }
const imports = new Map(); ast.body.filter(n => n.type === 'ImportDeclaration').forEach(n => n.specifiers.forEach(s => imports.set(s.local.name, n.source.value)));
const refs = []; const walk = sc => { for (const r of sc.references) { const v = r.resolved; if (!v || v.scope.type === 'module') refs.push({ pos: r.identifier.start, name: r.identifier.name }); } sc.childScopes.forEach(walk); }; walk(sm.globalScope);
const depsOf = nm => { const t = top.get(nm); return [...new Set(refs.filter(r => r.pos >= t.n.start && r.pos < t.n.end && r.name !== nm && top.has(r.name)).map(r => r.name))]; };
const importsOf = nm => { const t = top.get(nm); return [...new Set(refs.filter(r => r.pos >= t.n.start && r.pos < t.n.end && imports.has(r.name)).map(r => r.name))]; };
const want = process.argv.slice(2);
for (const nm of want) { const t = top.get(nm); if (!t) { console.log(nm.padEnd(34), 'NOT top-level'); continue; }
  console.log(`${nm.padEnd(34)} ${t.kind.padEnd(5)} ${String(t.n.loc.end.line - t.n.loc.start.line + 1).padStart(4)}L  local deps: ${depsOf(nm).join(', ') || '-'}`); }

if (process.env.CLOSURE) {
  const seeds = process.env.CLOSURE.split(',');
  const seen = new Set(); const q = [...seeds];
  while (q.length) { const x = q.pop(); if (seen.has(x) || !top.has(x)) continue; seen.add(x); depsOf(x).forEach(d => q.push(d)); }
  const lines = nm => top.get(nm).n.loc.end.line - top.get(nm).n.loc.start.line + 1;
  const core = [...seen]; const all = [...top.keys()];
  const sum = a => a.reduce((s, x) => s + lines(x), 0);
  console.log(`factory.js top-level: ${all.length} names, ${sum(all)} lines`);
  console.log(`core closure: ${core.length} names, ${sum(core)} lines`);
  const rest = all.filter(x => !seen.has(x));
  console.log(`left for a lazy chunk: ${rest.length} names, ${sum(rest)} lines`);
  const pat = x => rest.filter(n => lines(n) >= 25).map(n => `${n}(${lines(n)})`).join(' ');
  console.log('biggest lazy: ' + pat());
  console.log('CORE_NAMES=' + core.join(' '));
}
