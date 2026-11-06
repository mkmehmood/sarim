// Moves one standalone screen into screens/<name>.screen.html.
//
//   node scripts/screen-extract.mjs <screen-id> <name> [module.js ...] [--dry]
//
//   markup : the screen's block leaves index.html; a placeholder with data-lazy-screen stays
//   css    : rules used only by this screen move, but ONLY if moving cannot change the
//            cascade (see cssPlan). Everything else stays in app.css.
//   js     : the listed modules are folded into the screen's <script type="module">
//   wiring : registry entry (with the window.* stubs), main.js import, sw.js asset list
//
// Run `npm run split:check` afterwards: nothing may be lost.
import { readFileSync, writeFileSync, rmSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import * as acorn from 'acorn';
import { publishedGlobals } from './screen-globals.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rd = p => readFileSync(join(ROOT, p), 'utf8');
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const [screenId, name, ...mods] = args.filter(a => !a.startsWith('--'));
if (!screenId || !name) { console.error('usage: screen-extract.mjs <screen-id> <name> [module.js ...] [--dry]'); process.exit(2); }

// ---------- markup ----------
function blockRange(html, id) {
  const m = new RegExp(`<div id="${id}"[^>]*>`).exec(html);
  if (!m) throw new Error(`screen ${id} not found in index.html`);
  let depth = 0, end = -1;
  const d = /<div\b|<\/div>/g; d.lastIndex = m.index;
  for (let x; (x = d.exec(html));) {
    if (x[0] === '</div>') { if (--depth === 0) { end = x.index + 6; break; } } else depth++;
  }
  return { start: m.index, end, open: m[0] };
}

// ---------- css ----------
function specificity(sel) {
  const max = (a, b) => (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) >= 0 ? a : b;
  let s = sel, extra = [0, 0, 0];
  for (;;) { // :is/:not/:has(...) take their most specific argument; :where() counts zero
    const m = /:(where|is|not|has|matches)\(/.exec(s);
    if (!m) break;
    let i = m.index + m[0].length, depth = 1;
    while (i < s.length && depth) { if (s[i] === '(') depth++; else if (s[i] === ')') depth--; i++; }
    const inner = s.slice(m.index + m[0].length, i - 1);
    if (m[1] !== 'where') for (const part of inner.split(',')) extra = max(extra, specificity(part));
    s = s.slice(0, m.index) + ' ' + s.slice(i);
  }
  const ids = (s.match(/#[\w-]+/g) || []).length;
  s = s.replace(/#[\w-]+/g, ' ');
  const attrs = (s.match(/\[[^\]]*\]/g) || []).length;
  s = s.replace(/\[[^\]]*\]/g, ' ');
  const pseudoEl = (s.match(/::[\w-]+/g) || []).length;
  s = s.replace(/::[\w-]+/g, ' ');
  const pseudoCl = (s.match(/:[\w-]+/g) || []).length;
  s = s.replace(/:[\w-]+/g, ' ');
  const classes = (s.match(/\.[\w-]+/g) || []).length;
  s = s.replace(/\.[\w-]+/g, ' ');
  const types = (s.match(/[a-zA-Z][\w-]*/g) || []).length;
  return [ids + extra[0], classes + attrs + pseudoCl + extra[1], types + pseudoEl + extra[2]];
}
const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const family = p => (p.startsWith('--') ? p : p.replace(/^-(webkit|moz|ms)-/, '').split('-')[0]);

function cssPlan(css, html, ownBlock, ownModuleTexts, otherModuleTexts) {
  const tok = h => ({
    ids: new Set([...h.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])),
    cls: new Set([...h.matchAll(/\bclass="([^"]+)"/g)].flatMap(m => m[1].split(/\s+/)).filter(Boolean)),
  });
  const mine = tok(ownBlock);
  const rest = html.replace(ownBlock, '');
  const restTok = tok(rest);
  const others = otherModuleTexts.join('\n');
  const exclusiveClass = c => !restTok.cls.has(c) && !rest.includes(c) && !others.includes(c);
  const ownToken = sel => {
    for (const id of [...sel.matchAll(/#([\w-]+)/g)].map(m => m[1])) if (mine.ids.has(id)) return true;
    for (const c of [...sel.matchAll(/\.([\w-]+)/g)].map(m => m[1])) if (mine.cls.has(c) && exclusiveClass(c)) return true;
    return false;
  };
  const root = postcss.parse(css);
  const all = [];
  root.walk(n => { if (n.type === 'rule' && !(n.parent.type === 'atrule' && /keyframes/.test(n.parent.name))) all.push(n); });
  const candidates = all.filter(r => r.parent.type === 'root' && r.selectors.every(ownToken)
    && !r.nodes.some(d => d.type === 'decl' && d.important));
  const cand = new Set(candidates);
  const declsOf = r => r.nodes.filter(d => d.type === 'decl');
  const moved = [], kept = [];
  for (const r of candidates) {
    const idx = all.indexOf(r);
    const rSpecs = r.selectors.map(specificity);
    const rFam = new Set(declsOf(r).map(d => family(d.prop)));
    let conflict = null;
    for (let j = idx + 1; j < all.length && !conflict; j++) {
      const s = all[j];
      if (cand.has(s)) continue; // moves with it, order preserved
      const overlap = declsOf(s).some(d => rFam.has(family(d.prop)));
      if (!overlap) continue;
      if (s.selectors.some(ss => rSpecs.some(rs => eq(rs, specificity(ss))))) conflict = s;
    }
    (conflict ? kept : moved).push({ rule: r, conflict });
  }
  // a rule that is kept can make an earlier-moved rule unsafe only through a *later* equal-
  // specificity rule, which the loop above already inspects, so a single pass is enough.
  return { total: all.length, moved: moved.map(m => m.rule), keptCount: candidates.length - moved.length, root };
}

// ---------- run ----------
let html = rd('index.html');
const blk = blockRange(html, screenId);
const block = html.slice(blk.start, blk.end);
if (/<script\b/i.test(block)) throw new Error('screen markup contains <script>; not supported');
const ownMods = mods.map(m => ({ file: m, text: rd('modules/' + m) }));
for (const m of ownMods) {
  for (const bad of ['</script>', '</style>', '</template>', '<template', '<style']) {
    if (m.text.includes(bad)) throw new Error(`modules/${m.file} contains "${bad}", which cannot live inside a .screen.html`);
  }
}
const otherTexts = readdirSync(join(ROOT, 'modules')).filter(f => f.endsWith('.js') && !mods.includes(f)).map(f => rd('modules/' + f));
const css = rd('app.css');
const plan = cssPlan(css, html, block, ownMods.map(m => m.text), otherTexts);
const movedText = plan.moved.map(r => css.slice(r.source.start.offset, r.source.end.offset + 1));

// window.* globals published by the module(s): only functions get lazy stubs
const globals = new Set();
for (const m of ownMods) {
  acorn.parse(m.text, { ecmaVersion: 'latest', sourceType: 'module' });
  for (const g of publishedGlobals(m.text).functions) globals.add(g);
}

console.log(`${screenId}: markup ${block.length} B, css ${plan.moved.length} rule(s) move (${plan.keptCount} candidate(s) kept for cascade safety), ` +
  `js ${ownMods.map(m => `${m.file} ${m.text.split('\n').length} lines`).join(', ') || 'none'}, ${globals.size} global(s)`);
if (DRY) process.exit(0);

// 1. screens/<name>.screen.html
mkdirSync(join(ROOT, 'screens'), { recursive: true });
const jsText = ownMods.map(m => `// ==== module: ${m.file} ====\n${m.text.replace(/\s+$/, '')}`).join('\n\n');
writeFileSync(join(ROOT, 'screens', `${name}.screen.html`),
  `<template>${block}</template>\n<style>\n${movedText.join('\n')}${movedText.length ? '\n' : ''}</style>\n<script type="module">\n${jsText}\n</script>\n`);

// 2. index.html placeholder
const placeholder = blk.open.replace(/>$/, ' data-lazy-screen>') + '</div>';
writeFileSync(join(ROOT, 'index.html'), html.slice(0, blk.start) + placeholder + html.slice(blk.end));

// 3. app.css: cut moved rules (and the newline after each), last first
let out = css;
for (const r of [...plan.moved].sort((a, b) => b.source.start.offset - a.source.start.offset)) {
  let s = r.source.start.offset, e = r.source.end.offset + 1;
  if (out[e] === '\n') e++;
  out = out.slice(0, s) + out.slice(e);
}
postcss.parse(out); // must still parse
writeFileSync(join(ROOT, 'app.css'), out);

// 4. modules removed, main.js / sw.js / registry updated
let main = rd('modules/main.js'), sw = rd('sw.js');
for (const m of ownMods) {
  rmSync(join(ROOT, 'modules', m.file));
  main = main.replace(new RegExp(`import '\\./${m.file.replace('.', '\\.')}';\\n`), '');
  sw = sw.replace(new RegExp(`  './modules/${m.file.replace('.', '\\.')}',\\n`), '');
}
sw = sw.replace("  './modules/main.js',\n", `  './modules/main.js',\n  './modules/${name}.screen.js',\n`);
writeFileSync(join(ROOT, 'modules/main.js'), main);
writeFileSync(join(ROOT, 'sw.js'), sw);

let reg = rd('modules/screen-registry.js');
const entry = `  '${screenId}': {\n    load: () => import('./${name}.screen.js'),\n    globals: [${[...globals].sort().map(g => `'${g}'`).join(', ')}],\n  },\n`;
const tail = reg.lastIndexOf('\n});');
reg = reg.slice(0, tail + 1) + entry + reg.slice(tail + 1);
writeFileSync(join(ROOT, 'modules/screen-registry.js'), reg);
console.log(`wrote screens/${name}.screen.html and updated index.html, app.css, main.js, sw.js, screen-registry.js`);
