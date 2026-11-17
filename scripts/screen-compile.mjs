// Compiles screens/<name>.screen.html (a <template>, <style> and <script type="module">)
// into one JS module. The same function serves the esbuild production build, the dev
// server and the lint step, so all three see identical code.
//
// The screen's <script> keeps its imports relative to modules/ (it is compiled as if it
// lived at modules/<name>.screen.js). Its top level must not touch the screen's own DOM:
// the loader evaluates the module first and mounts the markup afterwards. Put start-up
// DOM work in `export function onMount() {}`; the loader calls it once, after mounting.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import * as acorn from 'acorn';
import { join, basename } from 'node:path';

export function parseScreen(text, where = 'screen') {
  const tStart = text.indexOf('<template');
  const tOpenEnd = text.indexOf('>', tStart) + 1;
  const sIdx = text.lastIndexOf('<script');
  const sOpenEnd = sIdx < 0 ? -1 : text.indexOf('>', sIdx) + 1;
  const sClose = sIdx < 0 ? -1 : text.lastIndexOf('</script>');
  if (tStart < 0) throw new Error(`${where}: no <template>`);
  const styleIdx = text.indexOf('<style', tStart);
  const tClose = (styleIdx > 0 ? text.lastIndexOf('</template>', styleIdx) : (sIdx > 0 ? text.lastIndexOf('</template>', sIdx) : text.lastIndexOf('</template>')));
  if (tClose < 0) throw new Error(`${where}: unclosed <template>`);
  const html = text.slice(tOpenEnd, tClose);
  let css = '';
  if (styleIdx > 0) {
    const open = text.indexOf('>', styleIdx) + 1;
    const close = text.indexOf('</style>', open);
    if (close < 0) throw new Error(`${where}: unclosed <style>`);
    css = text.slice(open, close);
  }
  const js = sIdx > 0 && sClose > sOpenEnd ? text.slice(sOpenEnd, sClose) : '';
  return { html, css, js };
}

export function compileScreen(text, where) {
  const { html, css, js } = parseScreen(text, where);
  return `${js}\nexport const __screenHtml = ${JSON.stringify(html)};\nexport const __screenCss = ${JSON.stringify(css)};\n`;
}

export function compileScreenStatic(text, where) {
  const { html, css, js } = parseScreen(text, where);
  const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  const edits = [];
  const fix = n => {
    if (n && n.type === 'Literal' && typeof n.value === 'string' && n.value.startsWith('./')) {
      edits.push({ start: n.start, end: n.end, text: `'../../modules/${n.value.slice(2)}'` });
    }
  };
  const visit = n => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if (typeof n.type !== 'string') return;
    if (n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration' || (n.type === 'ExportNamedDeclaration' && n.source)) fix(n.source);
    if (n.type === 'ImportExpression') fix(n.source);
    for (const k of Object.keys(n)) if (k !== 'type' && k !== 'start' && k !== 'end') visit(n[k]);
  };
  visit(ast);
  let out = js;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return `${out}\nexport const __screenHtml = ${JSON.stringify(html)};\nexport const __screenCss = ${JSON.stringify(css)};\n`;
}

export function compiledPathFor(root, name) {
  return join(root, 'screens', 'compiled', `${name}.screen.js`);
}

export function writeCompiledScreens(root) {
  const dir = join(root, 'screens');
  const out = join(dir, 'compiled');
  mkdirSync(out, { recursive: true });
  const names = readdirSync(dir).filter(f => f.endsWith('.screen.html')).map(f => f.replace('.screen.html', ''));
  for (const name of names) writeFileSync(compiledPathFor(root, name), compileScreenStatic(readFileSync(join(dir, `${name}.screen.html`), 'utf8'), name));
  for (const f of existsSync(out) ? readdirSync(out) : []) if (f.endsWith('.screen.js') && !names.includes(f.replace('.screen.js', ''))) writeFileSync(join(out, f), '');
  return names;
}

export function screenFileFor(root, requestPath) {
  const name = basename(requestPath).replace(/\.screen\.js$/, '');
  return join(root, 'screens', `${name}.screen.html`);
}

export function compileScreenFile(root, requestPath) {
  const file = screenFileFor(root, requestPath);
  return compileScreen(readFileSync(file, 'utf8'), file);
}

export function compileScreenStaticFile(root, requestPath) {
  const file = screenFileFor(root, requestPath);
  return compileScreenStatic(readFileSync(file, 'utf8'), file);
}

// esbuild plugin: `import('./x.screen.js')` is served from screens/x.screen.html
export function screenPlugin(root) {
  return {
    name: 'screens',
    setup(b) {
      b.onResolve({ filter: /\.screen\.js$/ }, a => ({ path: screenFileFor(root, a.path) }));
      b.onLoad({ filter: /\.screen\.html$/ }, a => ({
        contents: compileScreen(readFileSync(a.path, 'utf8'), a.path),
        loader: 'js',
        resolveDir: join(root, 'modules'),
      }));
    },
  };
}
