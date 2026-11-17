// Moves named top-level declarations out of a module into a new core module, so the rest
// of the original (its UI) can later be folded into a lazy screen.
//
//   node scripts/module-split.mjs <module.js> <new-core.js> <name> [name ...] [--dry]
//
// Declarations move verbatim. Imports are recomputed for both files, other modules that
// imported the moved names are re-pointed, and names the remaining code still needs are
// imported (and exported) from the new module. Refuses to run if the moved code depends
// on a non-moved top-level declaration of the original: that would create a cycle.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const [orig, core, ...names] = args.filter(a => !a.startsWith('--'));
if (!orig || !core || !names.length) { console.error('usage: module-split.mjs <module.js> <new-core.js> <name> ...'); process.exit(2); }
if (existsSync(join(ROOT, 'modules', core))) { console.error(`modules/${core} already exists`); process.exit(1); }

const src = readFileSync(join(ROOT, 'modules', orig), 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
const declNames = n => {
  const d = n.type === 'ExportNamedDeclaration' ? n.declaration : n;
  if (!d) return [];
  if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') return [d.id.name];
  if (d.type === 'VariableDeclaration') return d.declarations.flatMap(x => (x.id.type === 'Identifier' ? [x.id.name] : []));
  return [];
};
const imports = ast.body.filter(n => n.type === 'ImportDeclaration');
const bodyNodes = ast.body.filter(n => n.type !== 'ImportDeclaration');
const want = new Set(names);
const windowAssign = n => {
  if (n.type !== 'ExpressionStatement') return null;
  const m = /^window\.([\w$]+)\s*=\s*([\w$]+);?$/.exec(src.slice(n.start, n.end));
  return m ? m[2] : null;
};
const moved = bodyNodes.filter(n => declNames(n).some(x => want.has(x)) || (windowAssign(n) && want.has(windowAssign(n))));
const found = new Set(moved.flatMap(declNames));
const missing = names.filter(x => !found.has(x));
if (missing.length) { console.error('not found at top level: ' + missing.join(', ')); process.exit(1); }
for (const n of moved) for (const x of declNames(n)) if (!want.has(x)) { console.error(`${x} shares a declaration with a moved name; list it too`); process.exit(1); }

const rest = bodyNodes.filter(n => !moved.includes(n));
const movedText = moved.map(n => src.slice(n.start, n.end));
const restText = rest.map(n => src.slice(n.start, n.end));
const usedIn = (texts, id) => new RegExp(`(?<![\\w$.])${id.replace(/\$/g, '\\$')}(?![\\w$])`).test(texts.join('\n'));

const restTops = new Set(rest.flatMap(declNames));
for (const id of restTops) if (usedIn(movedText, id)) { console.error(`moved code uses ${id}, which stays in ${orig}`); process.exit(1); }

const specs = imports.flatMap(n => n.specifiers.map(s => ({ local: s.local.name, imported: s.imported ? s.imported.name : 'default', kind: s.type, from: n.source.value })));
const importLines = (list, texts) => {
  const by = new Map();
  for (const s of list) if (usedIn(texts, s.local)) { if (!by.has(s.from)) by.set(s.from, []); by.get(s.from).push(s); }
  return [...by.entries()].map(([from, ss]) => {
    const parts = ss.map(s => (s.imported === s.local ? s.local : `${s.imported} as ${s.local}`)).join(', ');
    return `import { ${parts} } from '${from}';`;
  });
};

const movedNames = [...found];
const neededByRest = movedNames.filter(x => usedIn(restText, x));
const coreImports = importLines(specs, movedText);
const origImports = importLines(specs, restText);
if (neededByRest.length) origImports.push(`import { ${neededByRest.join(', ')} } from './${core}';`);

const exportize = t => (t.startsWith('export ') ? t : 'export ' + t);
const coreBody = moved.map((n, i) => (neededByRest.some(x => declNames(n).includes(x)) ? exportize(movedText[i]) : movedText[i])).join('\n');
const coreSrc = `${coreImports.join('\n')}\n\n${coreBody}\n`;

let origSrc = origImports.join('\n') + '\n\n';
let cursor = 0;
const parts = [];
for (const n of rest) { parts.push(src.slice(n.start, n.end)); cursor = n.end; }
origSrc += parts.join('\n') + '\n';
const lead = src.slice(0, ast.body[0].start);
void cursor; void lead;

const movedExports = moved.filter(n => n.type === 'ExportNamedDeclaration').flatMap(declNames);
console.log(`${orig}: ${moved.length} declaration(s) -> ${core} (${coreSrc.split('\n').length} lines); ${movedExports.length} exported; rest needs ${neededByRest.length} back`);

const rewrites = [];
for (const f of readdirSync(join(ROOT, 'modules')).filter(f => f.endsWith('.js') && f !== orig)) {
  const t = readFileSync(join(ROOT, 'modules', f), 'utf8');
  const re = new RegExp(`import \\{([^}]*)\\} from '\\./${orig.replace('.', '\\.')}';\\n`);
  const m = re.exec(t);
  if (!m) continue;
  const list = m[1].split(',').map(x => x.trim()).filter(Boolean);
  const toCore = list.filter(x => movedExports.includes(x.split(' as ')[0]));
  const stay = list.filter(x => !toCore.includes(x));
  const lines = [];
  if (stay.length) lines.push(`import { ${stay.join(', ')} } from './${orig}';\n`);
  if (toCore.length) lines.push(`import { ${toCore.join(', ')} } from './${core}';\n`);
  rewrites.push({ f, text: t.replace(m[0], lines.join('')) });
  console.log(`  re-point ${f}: ${toCore.join(', ')}`);
}
const screenRewrites = [];
if (existsSync(join(ROOT, 'screens'))) {
  for (const f of readdirSync(join(ROOT, 'screens')).filter(n => n.endsWith('.screen.html'))) {
    const t = readFileSync(join(ROOT, 'screens', f), 'utf8');
    const re = new RegExp(`import \\{([^}]*)\\} from '\\./${orig.replace('.', '\\.')}';\\n`);
    const m = re.exec(t);
    if (!m) continue;
    const list = m[1].split(',').map(x => x.trim()).filter(Boolean);
    const toCore = list.filter(x => movedExports.includes(x.split(' as ')[0]));
    if (!toCore.length) continue;
    const stay = list.filter(x => !toCore.includes(x));
    const lines = [];
    if (stay.length) lines.push(`import { ${stay.join(', ')} } from './${orig}';\n`);
    lines.push(`import { ${toCore.join(', ')} } from './${core}';\n`);
    screenRewrites.push({ f, text: t.replace(m[0], lines.join('')) });
    console.log(`  re-point screens/${f}: ${toCore.join(', ')}`);
  }
}
if (DRY) process.exit(0);
for (const r of screenRewrites) writeFileSync(join(ROOT, 'screens', r.f), r.text);
writeFileSync(join(ROOT, 'modules', core), coreSrc);
writeFileSync(join(ROOT, 'modules', orig), origSrc);
for (const r of rewrites) writeFileSync(join(ROOT, 'modules', r.f), r.text);
