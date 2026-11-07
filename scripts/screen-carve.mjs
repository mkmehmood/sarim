// Finds the code in the shared modules that belongs only to one screen, and (without --dry)
// moves it into a new module modules/<name>.js, ready for scripts/screen-extract.mjs.
//
//   node scripts/screen-carve.mjs <screen-id> <name> [--dry] [--also fnA,fnB] [--keep fnC]
//
// A top-level statement is "owned" by the screen when it touches the screen's element ids (or
// is called from the screen's inline handlers) and EVERY place that uses it is itself owned.
// That is a greatest fixed point, so shared helpers stay where they are and are imported back.
// Anything doubtful (written from both sides, referenced by a string elsewhere, published to
// window in a form that cannot be split) stays in place: the tool errs towards moving less.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import * as eslintScope from 'eslint-scope';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = f => argv.includes(f);
const opt = f => { const i = argv.indexOf(f); return i >= 0 ? (argv[i + 1] || '').split(',').filter(Boolean) : []; };
const pos = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--also', '--keep', '--within', '--via-window', '--why'].includes(argv[i - 1])));
const [screenId, name] = pos;
if (!screenId || !name) { console.error('usage: screen-carve.mjs <screen-id> <name> [--dry] [--also a,b] [--keep c]'); process.exit(2); }
const DRY = flag('--dry');
const ALSO = new Set(opt('--also'));
const KEEP = new Set(opt('--keep'));
const WITHIN = new Set(opt('--within'));
const VIA = new Set(opt('--via-window'));
const inScope = u => WITHIN.size === 0 || WITHIN.has(u.mod);

const rd = p => readFileSync(join(ROOT, p), 'utf8');
const MODS = readdirSync(join(ROOT, 'modules')).filter(f => f.endsWith('.js')).sort();
if (existsSync(join(ROOT, 'modules', name + '.js'))) { console.error(`modules/${name}.js already exists`); process.exit(1); }

const html = rd('index.html');
const m0 = new RegExp(`<div id="${screenId}"[^>]*>`).exec(html);
if (!m0) { console.error(`${screenId} not found in index.html (already extracted?)`); process.exit(1); }
let depth = 0, end = -1;
for (const x of html.slice(m0.index).matchAll(/<div\b|<\/div>/g)) {
  if (x[0] === '</div>') { if (--depth === 0) { end = m0.index + x.index + 6; break; } } else depth++;
}
const block = html.slice(m0.index, end);
const outsideHtml = html.slice(0, m0.index) + html.slice(end);
const innerIds = [...new Set([...block.matchAll(/\bid="([^"$]+)"/g)].map(m => m[1]))].filter(i => i !== screenId);
const handlerNames = new Set([...block.matchAll(/\bon[a-z]+="([^"]*)"/g)].flatMap(m => [...m[1].matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)].map(c => c[1])));

const idents = text => {
  const out = new Set();
  for (const m of text.matchAll(/(?<![\w$.])[A-Za-z_$][\w$]*/g)) out.add(m[0]);
  return out;
};
const astIdents = node => {
  const out = new Set();
  const visit = (n, parent, key) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(x => visit(x, parent, key)); return; }
    if (typeof n.type !== 'string') return;
    if (n.type === 'Identifier') {
      const skip = (parent && parent.type === 'MemberExpression' && key === 'property' && !parent.computed)
        || (parent && parent.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand)
        || (parent && (parent.type === 'MethodDefinition' || parent.type === 'PropertyDefinition') && key === 'key' && !parent.computed);
      if (!skip) out.add(n.name);
      return;
    }
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') visit(n[k], n, k);
  };
  visit(node, null, null);
  return out;
};
const rangeNames = n => {
  const d = n.type === 'ExportNamedDeclaration' ? n.declaration : n;
  if (!d) return [];
  if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') return [d.id.name];
  if (d.type === 'VariableDeclaration') {
    const out = [];
    const take = p => { if (!p) return; if (p.type === 'Identifier') out.push(p.name); else if (p.type === 'ObjectPattern') p.properties.forEach(q => take(q.value || q.argument)); else if (p.type === 'ArrayPattern') p.elements.forEach(take); else if (p.type === 'AssignmentPattern') take(p.left); else if (p.type === 'RestElement') take(p.argument); };
    d.declarations.forEach(x => take(x.id));
    return out;
  }
  return [];
};

const units = [];
const modInfo = {};
for (const mod of MODS) {
  const src = rd('modules/' + mod);
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', ranges: true });
  const info = { src, imports: [], units: [] };
  const sm = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module', range: true });
  const refsByPos = [];
  const walkScopes = sc => {
    for (const r of sc.references) {
      const v = r.resolved;
      if (!v || v.scope.type === 'module') refsByPos.push({ pos: r.identifier.start, name: r.identifier.name });
    }
    sc.childScopes.forEach(walkScopes);
  };
  walkScopes(sm.globalScope);
  for (const n of ast.body) {
    if (n.type === 'ImportDeclaration') {
      info.imports.push({ node: n, specs: n.specifiers.map(s => ({ local: s.local.name, imported: s.imported ? s.imported.name : 'default', type: s.type })), from: n.source.value });
      continue;
    }
    const text = src.slice(n.start, n.end);
    const u = { id: `${mod}:${n.start}`, mod, node: n, start: n.start, end: n.end, text, names: rangeNames(n), exported: n.type === 'ExportNamedDeclaration', idents: new Set(refsByPos.filter(r => r.pos >= n.start && r.pos < n.end).map(r => r.name)) };
    const m = /^window\.([\w$]+)\s*=\s*([\w$]+);?$/.exec(text);
    if (m) u.publish = { keys: [m[1]], values: [m[2]], kind: 'assign' };
    const oa = /^Object\.assign\(\s*window\s*,\s*\{([\s\S]*?)\}\s*\);?$/.exec(text);
    if (oa) {
      const keys = oa[1].split(',').map(s => s.trim()).filter(Boolean);
      if (keys.every(k => /^[A-Za-z_$][\w$]*$/.test(k))) u.publish = { keys, values: keys, kind: 'object' };
    }
    info.units.push(u); units.push(u);
  }
  modInfo[mod] = info;
}

const nameUnits = new Map();
for (const u of units) for (const n of u.names) { if (!nameUnits.has(n)) nameUnits.set(n, []); nameUnits.get(n).push(u); }
const ambiguous = new Set([...nameUnits].filter(([, v]) => v.length > 1).map(([k]) => k));
for (const n of ambiguous) nameUnits.delete(n);

const otherScreens = existsSync(join(ROOT, 'screens')) ? readdirSync(join(ROOT, 'screens')).map(f => rd('screens/' + f)).join('\n') : '';
const otherScript = otherScreens.split('<script type="module">').slice(1).join('\n');
const otherTemplate = otherScreens.replace(/<script type="module">[\s\S]*?<\/script>/g, '');
const extBlock = idents(otherScript + '\n' + rd('sw.js'));
const extSoft = idents(outsideHtml + '\n' + otherTemplate);
const extIdents = new Set([...extBlock, ...extSoft]);
const handlerOnly = new Set([...handlerNames].filter(h => !extIdents.has(h)));

const usersOf = new Map();
for (const u of units) usersOf.set(u, new Set());
const extUsed = new Set();
for (const u of units) {
  if (u.publish) continue;
  for (const id of u.idents) {
    const us = nameUnits.get(id);
    if (!us) continue;
    for (const t of us) if (t !== u && !t.names.every(n => VIA.has(n))) usersOf.get(t).add(u);
  }
}
const publishedVals = new Set(units.filter(u => u.publish).flatMap(u => u.publish.values));
for (const n of nameUnits.keys()) if (extBlock.has(n) || (extSoft.has(n) && !publishedVals.has(n))) extUsed.add(n);
const idHit = u => innerIds.some(id => u.text.includes(`'${id}'`) || u.text.includes(`"${id}"`) || u.text.includes('`' + id + '`') || u.text.includes('#' + id));
const stringRef = new Set();
for (const u of units) for (const m of u.text.matchAll(/['"`]([A-Za-z_$][\w$]*)['"`]/g)) if (nameUnits.has(m[1]) && !u.names.includes(m[1])) stringRef.add(m[1]);

const seeds = new Set(units.filter(u => inScope(u) && !u.publish && u.names.length && !u.names.some(n => KEEP.has(n)) && (idHit(u) || u.names.some(n => handlerOnly.has(n) || ALSO.has(n)))));
const S = new Set(seeds);
const queue = [...seeds];
while (queue.length) {
  const u = queue.pop();
  for (const id of u.idents) for (const t of nameUnits.get(id) || []) if (t !== u && !S.has(t) && inScope(t) && t.names.length && !t.publish && !t.names.some(n => KEEP.has(n))) { S.add(t); queue.push(t); }
}
let changed = true;
while (changed) {
  changed = false;
  for (const u of [...S]) {
    const bad = u.names.some(n => extUsed.has(n) && !handlerOnly.has(n)) ||
      [...usersOf.get(u)].some(x => !S.has(x)) ||
      u.names.some(n => stringRef.has(n) && !publishedVals.has(n) && !ALSO.has(n));
    if (bad) { S.delete(u); changed = true; }
  }
}
const owned = [...S].sort((a, b) => (a.mod === b.mod ? a.start - b.start : a.mod.localeCompare(b.mod)));
const ownedNames = new Set(owned.flatMap(u => u.names));

const lets = new Map();
for (const u of units) if (/^(export\s+)?(let|var)\b/.test(u.text)) for (const n of u.names) lets.set(n, u);
const writes = (text, n) => new RegExp(`(?<![\\w$.])${n.replace(/\$/g, '\\$')}\\s*(\\+\\+|--|[-+*/%&|^]?=(?!=))|(\\+\\+|--)\\s*${n.replace(/\$/g, '\\$')}(?![\\w$])`).test(text);
const hazards = [];
for (const u of units) for (const [n, lu] of lets) {
  if (!u.idents.has(n) || u === lu) continue;
  const inS = S.has(u), owner = S.has(lu);
  if (inS !== owner && writes(u.text, n)) hazards.push(`${n} (declared in ${lu.mod}) is assigned from ${u.mod}: ${u.names[0] || '(statement)'}`);
}

const pubStays = [];
for (const u of units) if (u.publish) {
  const mv = u.publish.keys.filter((k, i) => ownedNames.has(u.publish.values[i]));
  if (mv.length) pubStays.push({ u, moved: mv, keep: u.publish.keys.filter(k => !mv.includes(k)) });
}

const byMod = {};
for (const u of owned) (byMod[u.mod] ||= []).push(u);
const lines = owned.reduce((a, u) => a + u.text.split('\n').length, 0);
console.log(`${screenId}: ${innerIds.length} ids, ${handlerOnly.size} handler-only names`);
console.log(`  seeds ${seeds.size}, owned ${owned.length} statements / ${lines} lines`);
for (const [m, us] of Object.entries(byMod)) console.log(`    ${m.padEnd(26)} ${String(us.length).padStart(3)} statements  ${us.reduce((a, u) => a + u.text.split('\n').length, 0)} lines`);
for (const w of opt('--why')) {
  for (const u of units.filter(x => x.names.includes(w))) {
    const out = [...usersOf.get(u)].filter(x => !S.has(x)).map(x => `${x.mod}::${x.names[0] || '(stmt) ' + x.text.slice(0, 60).replace(/\n/g, ' ')}`);
    const ext = (extBlock.has(w) ? ' [other screen script/sw]' : '') + (extSoft.has(w) && !publishedVals.has(w) ? ' [html handler, unpublished]' : '') + (stringRef.has(w) && !publishedVals.has(w) ? ' [string ref, unpublished]' : '');
    console.log(`  why ${w}: ${out.join(' | ') || '(no outside code users)'}${ext}`);
  }
}
if (flag('--names')) console.log('  owned names: ' + owned.flatMap(u => u.names).join(', '));
const droppedSeeds = [...seeds].filter(u => !S.has(u));
const touchers = droppedSeeds.filter(u => idHit(u) || u.text.includes(`'${screenId}'`));
const inlineScripts = [...outsideHtml.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const inlineTouch = innerIds.filter(id => inlineScripts.includes(`'${id}'`) || inlineScripts.includes(`"${id}"`) || inlineScripts.includes('`' + id + '`') || inlineScripts.includes('#' + id));
const safe = touchers.length === 0 && inlineTouch.length === 0 && hazardsEarly();
function hazardsEarly() { return hazards.length === 0; }
console.log(`  LAZY-SAFE: ${safe ? 'yes (no core code touches this screen\'s DOM)' : `NO (${touchers.length} shared module function(s) and ${inlineTouch.length} id(s) in index.html inline scripts touch its DOM: ${[...touchers.flatMap(u => u.names), ...inlineTouch].slice(0, 6).join(', ')})`}`);
if (droppedSeeds.length) console.log(`  seeds kept in place (shared): ${droppedSeeds.flatMap(u => u.names).slice(0, 14).join(', ')}${droppedSeeds.length > 14 ? ' …' : ''}`);
if (hazards.length) console.log('  HAZARDS (assigned across the boundary):\n    ' + [...new Set(hazards)].join('\n    '));
const globalsMoved = pubStays.flatMap(p => p.moved);
console.log(`  window globals that move with it: ${globalsMoved.length}${globalsMoved.length ? ' (' + globalsMoved.slice(0, 10).join(', ') + (globalsMoved.length > 10 ? ' …' : '') + ')' : ''}`);
const soft = [...ownedNames].filter(n => (extSoft.has(n) || stringRef.has(n)) && publishedVals.has(n));
const winCalls = [];
for (const n of ownedNames) for (const u of units) if (!S.has(u) && new RegExp(`window\\.${n}\\b|window\\[['"]${n}['"]\\]`).test(u.text))
  for (const l of u.text.split('\n')) if (new RegExp(`window\\.${n}\\b`).test(l)) winCalls.push(`${n} <- ${u.mod}: ${l.trim().slice(0, 110)}`);
if (soft.length) console.log(`  reached through window by other screens/strings: ${soft.length} (${soft.slice(0, 8).join(', ')}${soft.length > 8 ? ' …' : ''})`);
if (winCalls.length) console.log('  window.* callers in other modules (check none needs a sync result):\n    ' + winCalls.slice(0, 12).join('\n    '));
if (DRY || !owned.length) { if (!owned.length) console.log('  nothing to carve'); process.exit(0); }
if (hazards.length) { console.error('refusing: resolve hazards first (use --keep / --also)'); process.exit(1); }

const needFromStay = new Map();
const importSpecs = new Map();
const localNames = new Set();
for (const u of owned) for (const id of u.idents) {
  if (ownedNames.has(id)) continue;
  const localDecl = modInfo[u.mod].units.find(x => x !== u && x.names.includes(id));
  if (localDecl) {
    if (!S.has(localDecl) && !needFromStay.has(id)) needFromStay.set(id, localDecl);
    continue;
  }
  const imp = modInfo[u.mod].imports.flatMap(i => i.specs.map(sp => ({ ...sp, from: i.from }))).find(sp => sp.local === id);
  if (imp) {
    if (importSpecs.has(id) && importSpecs.get(id).from !== imp.from) { console.error(`conflicting import for ${id}`); process.exit(1); }
    importSpecs.set(id, imp);
    continue;
  }
  const us = nameUnits.get(id);
  if (us && us.length === 1 && !S.has(us[0])) {
    if (!needFromStay.has(id)) needFromStay.set(id, us[0]);
    continue;
  }
  localNames.add(id);
}
for (const [id, su] of needFromStay) if (importSpecs.has(id)) importSpecs.delete(id);

const groups = new Map();
const add = (from, spec) => { if (!groups.has(from)) groups.set(from, []); if (!groups.get(from).includes(spec)) groups.get(from).push(spec); };
for (const [id, su] of needFromStay) add('./' + su.mod, id);
for (const s of importSpecs.values()) add(s.from, s.imported === s.local ? s.local : `${s.imported} as ${s.local}`);
const coreImports = [...groups.entries()].map(([from, ss]) => `import { ${ss.join(', ')} } from '${from}';`);

const publishKeys = [...new Set([...pubStays.flatMap(p => p.moved), ...[...VIA].filter(n => ownedNames.has(n))])];
const coreBody = owned.map(u => u.text).join('\n\n');
const publishStmt = publishKeys.length ? `\nObject.assign(window, { ${publishKeys.join(', ')} });` : '';
const exportsForNeeded = [...ownedNames].filter(n => !VIA.has(n) && units.some(x => !S.has(x) && !x.publish && x.idents.has(n)));
if (exportsForNeeded.length) { console.error('internal error: owned name used outside: ' + exportsForNeeded.join(', ')); process.exit(1); }
writeFileSync(join(ROOT, 'modules', name + '.js'), `${coreImports.join('\n')}\n\n${coreBody}\n${publishStmt}\n`.replace(/\n{3,}/g, '\n\n'));

const edits = {};
const push = (mod, e) => (edits[mod] ||= []).push(e);
for (const u of owned) push(u.mod, { start: u.start, end: u.end, text: '' });
for (const p of pubStays) {
  if (!p.keep.length) push(p.u.mod, { start: p.u.start, end: p.u.end, text: '' });
  else if (p.u.publish.kind === 'object') push(p.u.mod, { start: p.u.start, end: p.u.end, text: `Object.assign(window, { ${p.keep.join(', ')} });` });
}
const exportNeeded = new Map();
for (const [id, su] of needFromStay) if (!su.exported) { if (!exportNeeded.has(su)) exportNeeded.set(su, []); exportNeeded.get(su).push(id); }
for (const su of exportNeeded.keys()) push(su.mod, { start: su.start, end: su.start, text: 'export ' });
for (const u of units) {
  if (S.has(u) || u.publish) continue;
  const hit = [...VIA].filter(n => ownedNames.has(n) && u.idents.has(n));
  if (!hit.length) continue;
  const visit = (n, parent, key) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(x => visit(x, parent, key)); return; }
    if (typeof n.type !== 'string') return;
    if (n.type === 'Identifier' && hit.includes(n.name)) {
      const prop = parent && parent.type === 'MemberExpression' && key === 'property' && !parent.computed;
      const objKey = parent && parent.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand;
      if (parent && parent.type === 'Property' && parent.shorthand) { console.error(`cannot rewrite shorthand use of ${n.name} in ${u.mod}`); process.exit(1); }
      if (!prop && !objKey) {
        const callee = (parent && parent.type === 'CallExpression' && key === 'callee') || (parent && parent.type === 'UnaryExpression' && parent.operator === 'typeof');
        if (callee) push(u.mod, { start: n.start, end: n.start, text: 'window.' });
        else push(u.mod, { start: n.start, end: n.end, text: `((...args) => window.${n.name}(...args))` });
      }
      return;
    }
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') visit(n[k], n, k);
  };
  visit(u.node, null, null);
}
for (const [mod, es] of Object.entries(edits)) {
  let s = modInfo[mod].src;
  for (const e of es.sort((a, b) => b.start - a.start)) {
    let eEnd = e.end;
    if (e.text === '' && s[eEnd] === '\n') eEnd++;
    s = s.slice(0, e.start) + e.text + s.slice(eEnd);
  }
  modInfo[mod].out = s.replace(/\n{3,}/g, '\n\n');
}

const finalText = {};
for (const mod of MODS) finalText[mod] = modInfo[mod].out ?? modInfo[mod].src;
const referenced = ast => {
  const out = new Set();
  const visit = (n, parent, key) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(x => visit(x, parent, key)); return; }
    if (typeof n.type !== 'string') return;
    if (n.type === 'ImportDeclaration') return;
    if (n.type === 'Identifier') {
      const skip = (parent && parent.type === 'MemberExpression' && key === 'property' && !parent.computed)
        || (parent && parent.type === 'Property' && key === 'key' && !parent.computed && !parent.shorthand)
        || (parent && parent.type === 'MethodDefinition' && key === 'key' && !parent.computed)
        || (parent && parent.type === 'PropertyDefinition' && key === 'key' && !parent.computed);
      if (!skip) out.add(n.name);
      return;
    }
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') visit(n[k], n, k);
  };
  visit(ast.body, null, null);
  return out;
};
for (const mod of MODS) {
  if (finalText[mod] === modInfo[mod].src) continue;
  const before = referenced(acorn.parse(modInfo[mod].src, { ecmaVersion: 'latest', sourceType: 'module' }));
  const ast = acorn.parse(finalText[mod], { ecmaVersion: 'latest', sourceType: 'module' });
  const after = referenced(ast);
  const used = id => after.has(id) || !before.has(id);
  const fixes = [];
  for (const n of ast.body.filter(x => x.type === 'ImportDeclaration')) {
    const keep = n.specifiers.filter(s => used(s.local.name));
    if (keep.length === n.specifiers.length) continue;
    const text = finalText[mod].slice(n.start, n.end);
    if (!keep.length) fixes.push({ start: n.start, end: n.end + (finalText[mod][n.end] === '\n' ? 1 : 0), text: '' });
    else {
      const def = keep.find(s => s.type === 'ImportDefaultSpecifier');
      const named = keep.filter(s => s.type === 'ImportSpecifier').map(s => (s.imported.name === s.local.name ? s.local.name : `${s.imported.name} as ${s.local.name}`));
      const head = def ? def.local.name + (named.length ? ', ' : '') : '';
      fixes.push({ start: n.start, end: n.end, text: `import ${head}${named.length ? `{ ${named.join(', ')} }` : ''} from ${text.slice(text.lastIndexOf('from') + 5)}` });
    }
  }
  let s = finalText[mod];
  for (const f of fixes.sort((a, b) => b.start - a.start)) s = s.slice(0, f.start) + f.text + s.slice(f.end);
  finalText[mod] = s;
}
for (const mod of MODS) if (finalText[mod] !== modInfo[mod].src) writeFileSync(join(ROOT, 'modules', mod), finalText[mod]);

const carvedPath = join(ROOT, 'docs/screen-split/carved.json');
const carved = existsSync(carvedPath) ? JSON.parse(readFileSync(carvedPath, 'utf8')) : {};
carved[name + '.js'] = Object.keys(byMod);
writeFileSync(carvedPath, JSON.stringify(carved, null, 2) + '\n');
console.log(`wrote modules/${name}.js (${owned.length} statements) and updated ${Object.keys(byMod).join(', ')}`);
