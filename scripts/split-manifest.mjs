// Proves that splitting the app into per-screen files loses nothing.
//
//   node scripts/split-manifest.mjs snapshot [out.json]   record what exists now
//   node scripts/split-manifest.mjs check [baseline.json] compare the tree to a baseline
//
// It reads the app wherever the code lives: index.html, app.css, modules/*.js and
// (for the future split) screens/*.screen.html, which hold a <template>, a <style>
// and a <script type="module"> per screen. Moving code between those files is fine;
// losing or changing any of the items below is a failure.
//
//   html : every element id, every inline on*= handler call, and the
//          whitespace-normalised markup of each screen root
//   css  : every rule / at-rule (selector + declarations), counted as a multiset
//   js   : every top-level declaration, every export, every window.* assignment
import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import * as acorn from 'acorn';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BASELINE = join(ROOT, 'docs/screen-split/baseline.json');
const sha = s => createHash('sha256').update(s).digest('hex').slice(0, 12);
const norm = s => s.replace(/\s+/g, ' ').trim();
const read = p => readFileSync(join(ROOT, p), 'utf8');

function gather() {
  const html = [], css = [], js = [];
  html.push({ src: 'index.html', text: read('index.html') });
  css.push({ src: 'app.css', text: read('app.css') });
  for (const f of readdirSync(join(ROOT, 'modules')).filter(f => f.endsWith('.js')))
    js.push({ src: 'modules/' + f, text: read('modules/' + f) });
  const sdir = join(ROOT, 'screens');
  if (existsSync(sdir)) {
    for (const f of readdirSync(sdir).filter(f => f.endsWith('.screen.html'))) {
      const t = read('screens/' + f);
      for (const m of t.matchAll(/<template\b[^>]*>([\s\S]*?)<\/template>/g)) html.push({ src: 'screens/' + f, text: m[1] });
      for (const m of t.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) css.push({ src: 'screens/' + f, text: m[1] });
      for (const m of t.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) js.push({ src: 'screens/' + f, text: m[1] });
    }
  }
  return { html, css, js };
}

function screenRoots(text) {
  const out = {};
  const re = /<div id="([\w-]+)"[^>]*class="(?:standalone-screen|hidden)[^"]*"[^>]*>|<div id="(tab-[\w-]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(text))) {
    const id = m[1] || m[2];
    if (id === 'splash-screen') continue;
    let depth = 0, end = text.length;
    const d = /<div\b|<\/div>/g; d.lastIndex = m.index;
    let x;
    while ((x = d.exec(text))) {
      if (x[0] === '</div>') { if (--depth === 0) { end = x.index + 6; break; } } else depth++;
    }
    out[id] = sha(norm(text.slice(m.index, end)));
  }
  return out;
}

function cssItems(text) {
  const items = [];
  let root;
  try { root = postcss.parse(text); } catch (e) { throw new Error('CSS parse failed: ' + e.message); }
  const chain = n => { const c = []; for (let p = n.parent; p && p.type !== 'root'; p = p.parent) if (p.type === 'atrule') c.unshift('@' + p.name + ' ' + norm(p.params)); return c.join(' > '); };
  root.walk(n => {
    if (n.type === 'rule') {
      const decls = (n.nodes || []).filter(c => c.type === 'decl').map(d => `${d.prop}:${norm(d.value)}${d.important ? '!' : ''}`).join(';');
      items.push(sha(`${chain(n)}|${norm(n.selector)}|${decls}`));
    } else if (n.type === 'atrule') {
      const decls = (n.nodes || []).filter(c => c.type === 'decl').map(d => `${d.prop}:${norm(d.value)}`).join(';');
      if (!n.nodes || decls) items.push(sha(`${chain(n)}|@${n.name} ${norm(n.params)}|${decls}`));
    }
  });
  return items;
}

function jsItems(text, src) {
  const decl = new Set(), win = new Set(), exp = new Set();
  let ast;
  try { ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' }); }
  catch (e) { throw new Error(`JS parse failed in ${src}: ${e.message}`); }
  const names = pat => { // binding names from a declaration target
    if (!pat) return [];
    if (pat.type === 'Identifier') return [pat.name];
    if (pat.type === 'ObjectPattern') return pat.properties.flatMap(p => names(p.value || p.argument));
    if (pat.type === 'ArrayPattern') return pat.elements.flatMap(names);
    if (pat.type === 'AssignmentPattern') return names(pat.left);
    if (pat.type === 'RestElement') return names(pat.argument);
    return [];
  };
  const fromDecl = d => {
    if (!d) return [];
    if (d.type === 'FunctionDeclaration' || d.type === 'ClassDeclaration') return [d.id.name];
    if (d.type === 'VariableDeclaration') return d.declarations.flatMap(x => names(x.id));
    return [];
  };
  for (const n of ast.body) {
    if (n.type === 'ExportNamedDeclaration') {
      fromDecl(n.declaration).forEach(x => { decl.add(x); exp.add(x); });
      (n.specifiers || []).forEach(s => exp.add(s.exported.name));
    } else if (n.type === 'ExportDefaultDeclaration') exp.add('default');
    else fromDecl(n).forEach(x => decl.add(x));
  }
  for (const m of text.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g)) win.add(m[1]);
  // Object.assign(window, { a, b: fn, ... }) also publishes globals
  for (const m of text.matchAll(/Object\.assign\(\s*window\s*,\s*\{([\s\S]*?)\}\s*\)/g))
    for (const k of m[1].matchAll(/(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*(?=[,:}]|$)/g)) win.add(k[1]);
  return { decl: [...decl], win: [...win], exp: [...exp] };
}

export function snapshot() {
  const { html, css, js } = gather();
  const ids = new Set(), handlers = new Set(), roots = {};
  for (const h of html) {
    for (const m of h.text.matchAll(/\bid="([^"$]+)"/g)) ids.add(m[1]);
    for (const m of h.text.matchAll(/\bon[a-z]+="([^"]*)"/g))
      for (const c of m[1].matchAll(/([A-Za-z_$][\w$.]*)\s*\(/g)) handlers.add(c[1]);
    Object.assign(roots, screenRoots(h.text));
  }
  for (const j of js) {
    for (const m of j.text.matchAll(/\bon[a-z]+=\\?"([^"\\]*)\\?"/g))
      for (const c of m[1].matchAll(/([A-Za-z_$][\w$.]*)\s*\(/g)) handlers.add(c[1]);
  }
  const cssAll = css.flatMap(c => cssItems(c.text));
  const cssCount = {};
  cssAll.forEach(k => { cssCount[k] = (cssCount[k] || 0) + 1; });
  const decl = new Set(), win = new Set(), exp = new Set();
  for (const j of js) { const r = jsItems(j.text, j.src); r.decl.forEach(x => decl.add(x)); r.win.forEach(x => win.add(x)); r.exp.forEach(x => exp.add(x)); }
  return {
    html: { ids: [...ids].sort(), handlers: [...handlers].sort(), screenRoots: roots },
    css: { total: cssAll.length, rules: cssCount },
    js: { declarations: [...decl].sort(), windowAssignments: [...win].sort(), exports: [...exp].sort() },
  };
}

function diffSet(label, base, now, problems) {
  const b = new Set(base), n = new Set(now);
  const lost = [...b].filter(x => !n.has(x));
  if (lost.length) problems.push(`${label}: ${lost.length} lost: ${lost.slice(0, 8).join(', ')}${lost.length > 8 ? ' …' : ''}`);
  return [...n].filter(x => !b.has(x)).length;
}

export function compare(base, now) {
  const problems = [];
  const added = {};
  added.ids = diffSet('html ids', base.html.ids, now.html.ids, problems);
  added.handlers = diffSet('html inline handlers', base.html.handlers, now.html.handlers, problems);
  for (const [id, h] of Object.entries(base.html.screenRoots)) {
    if (!(id in now.html.screenRoots)) problems.push(`screen root lost: ${id}`);
    else if (now.html.screenRoots[id] !== h) problems.push(`screen markup changed: ${id}`);
  }
  let cssLost = 0;
  for (const [k, c] of Object.entries(base.css.rules)) cssLost += Math.max(0, c - (now.css.rules[k] || 0));
  if (cssLost) problems.push(`css: ${cssLost} rule(s) lost or changed`);
  added.decl = diffSet('js declarations', base.js.declarations, now.js.declarations, problems);
  added.win = diffSet('js window.* assignments', base.js.windowAssignments, now.js.windowAssignments, problems);
  added.exp = diffSet('js exports', base.js.exports, now.js.exports, problems);
  return { problems, added };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, file] = process.argv.slice(2);
  if (cmd === 'snapshot') {
    const out = file ? resolve(file) : DEFAULT_BASELINE;
    const s = snapshot();
    writeFileSync(out, JSON.stringify(s));
    console.log(`baseline written: ${out}\n  ids ${s.html.ids.length}, handlers ${s.html.handlers.length}, screens ${Object.keys(s.html.screenRoots).length}, css rules ${s.css.total}, js declarations ${s.js.declarations.length}, window.* ${s.js.windowAssignments.length}, exports ${s.js.exports.length}`);
  } else if (cmd === 'check') {
    const base = JSON.parse(readFileSync(file ? resolve(file) : DEFAULT_BASELINE, 'utf8'));
    const { problems, added } = compare(base, snapshot());
    if (problems.length) { console.error('✗ NOTHING-LOST CHECK FAILED\n  - ' + problems.join('\n  - ')); process.exit(1); }
    console.log(`✓ nothing lost (new items vs baseline: ${JSON.stringify(added)})`);
  } else {
    console.error('usage: split-manifest.mjs snapshot|check [file]'); process.exit(2);
  }
}
