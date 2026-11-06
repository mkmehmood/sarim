// Read the app's source as if it were still one index.html, one app.css and one
// modules/ folder, even though lazy screens now live in screens/<name>.screen.html.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, basename } from 'node:path';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const rd = rel => readFileSync(join(ROOT, rel), 'utf8');
const screenFiles = () => (existsSync(join(ROOT, 'screens')) ? readdirSync(join(ROOT, 'screens')).filter(f => f.endsWith('.screen.html')).sort() : []);

function sections(text) {
  const tpl = /<template>([\s\S]*?)<\/template>\n<style>/.exec(text);
  const style = /<\/template>\n<style>\n?([\s\S]*?)<\/style>\n<script type="module">/.exec(text);
  const js = text.slice(text.indexOf('<script type="module">') + '<script type="module">'.length, text.lastIndexOf('</script>'));
  return { html: tpl ? tpl[1] : '', css: style ? style[1] : '', js };
}

// index.html with every lazy placeholder replaced by its screen markup (the original document)
export function readIndexHtml() {
  let html = rd('index.html');
  for (const f of screenFiles()) {
    const { html: block } = sections(rd('screens/' + f));
    const id = /<div id="([^"]+)"/.exec(block)[1];
    html = html.replace(new RegExp(`<div id="${id}"[^>]*data-lazy-screen></div>`), () => block);
  }
  return html;
}

// app.css plus the styles that moved into screen files
export function readAppCss() {
  return rd('app.css') + screenFiles().map(f => sections(rd('screens/' + f)).css).filter(c => c.trim()).join('');
}

// The text of modules/<file>, wherever it lives now. `file` may be 'x.js' or 'modules/x.js'.
function carvedInto(name) {
  const p = join(ROOT, 'docs/screen-split/carved.json');
  if (!existsSync(p)) return [];
  const map = JSON.parse(readFileSync(p, 'utf8'));
  return Object.entries(map).filter(([, origins]) => origins.includes(name)).map(([n]) => n);
}

export function readModule(file) {
  const name = basename(file);
  const base = readModuleOwn(name);
  const extra = carvedInto(name).map(n => readModuleOwn(n));
  return extra.length ? base + '\n' + extra.join('\n') : base;
}

function readModuleOwn(name) {
  if (existsSync(join(ROOT, 'modules', name))) return rd('modules/' + name);
  for (const f of screenFiles()) {
    const { js } = sections(rd('screens/' + f));
    const start = js.indexOf(`// ==== module: ${name} ====\n`);
    if (start < 0) continue;
    const from = start + `// ==== module: ${name} ====\n`.length;
    const next = js.indexOf('\n// ==== module: ', from);
    return js.slice(from, next < 0 ? js.length : next).trimEnd() + '\n';
  }
  throw new Error(`module ${name} not found in modules/ or screens/`);
}

export function foldedModuleNames() {
  const out = [];
  for (const f of screenFiles()) for (const m of sections(rd('screens/' + f)).js.matchAll(/^\/\/ ==== module: ([\w-]+\.js) ====$/gm)) out.push(m[1]);
  return out;
}

export function moduleNames() {
  return [...new Set([...readdirSync(join(ROOT, 'modules')).filter(n => n.endsWith('.js')), ...foldedModuleNames()])].sort();
}

export function moduleFiles() {
  return moduleNames().map(n => 'modules/' + n);
}

export function readSource(rel) {
  const clean = rel.replace(/^(\.\.\/)+/, '');
  if (clean === 'index.html') return readIndexHtml();
  if (clean === 'app.css') return readAppCss();
  if (clean.startsWith('modules/') && !existsSync(join(ROOT, clean))) return readModule(clean);
  return rd(clean);
}
