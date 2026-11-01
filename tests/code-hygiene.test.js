import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import * as acorn from 'acorn';
import { readSource } from './_extract.js';

const ROOT_JS = ['sw.js', 'build.js', 'build-key.js', 'eslint.config.js', 'desktop/main.js', 'desktop/preload.js'];

function listJs() {
  const dirs = ['modules', 'scripts', 'tests'];
  const files = dirs.flatMap(d => readdirSync(new URL(`../${d}/`, import.meta.url)).filter(f => f.endsWith('.js')).map(f => `${d}/${f}`));
  return [...files, ...ROOT_JS].sort();
}

function parseJs(src) {
  for (const sourceType of ['module', 'script']) {
    const comments = [];
    const tokens = [];
    try {
      acorn.parse(src, { ecmaVersion: 'latest', sourceType, allowHashBang: true, allowReturnOutsideFunction: true, onComment: comments, onToken: tokens });
      return { comments, tokens };
    } catch (e) {
      if (sourceType === 'script') throw e;
    }
  }
}

function literalRanges(tokens) {
  return tokens.filter(t => t.type.label === 'string' || t.type.label === 'template' || t.type.label === 'regexp').map(t => [t.start, t.end]);
}

function blankRuns(src, protectedRanges) {
  const hits = [];
  const re = /\n[ \t]*\n[ \t]*\n/g;
  let m;
  while ((m = re.exec(src))) {
    const at = m.index;
    if (!protectedRanges.some(([s, e]) => at >= s && at < e)) hits.push(src.slice(0, at).split('\n').length + 1);
  }
  return hits;
}

function stripCssLiterals(css) {
  return css.replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|url\(\s*[^)'"]*\)/gi, '""');
}

function htmlParts(html) {
  const scripts = [];
  const styles = [];
  const markup = html
    .replace(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi, (_, body) => { scripts.push(body); return '<script></script>'; })
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_, body) => { styles.push(body); return '<style></style>'; });
  return { markup, scripts, styles };
}

describe('source files carry no comments', () => {
  for (const file of listJs()) {
    it(file, () => {
      const { comments } = parseJs(readSource(file));
      assert.equal(comments.length, 0, `${file} has ${comments.length} comment(s); first at offset ${comments[0]?.start}`);
    });
  }
  it('app.css', () => {
    assert.ok(!stripCssLiterals(readSource('app.css')).includes('/*'), 'app.css contains a comment');
  });
  it('index.html markup, inline scripts and inline styles', () => {
    const { markup, scripts, styles } = htmlParts(readSource('index.html'));
    assert.ok(!markup.includes('<!--'), 'index.html contains an HTML comment');
    for (const body of scripts.filter(b => b.trim())) {
      try {
        assert.equal(parseJs(body).comments.length, 0, 'inline <script> contains a comment');
      } catch (e) {
        if (e instanceof assert.AssertionError) throw e;
      }
    }
    for (const body of styles) assert.ok(!stripCssLiterals(body).includes('/*'), 'inline <style> contains a comment');
  });
});

describe('source files never leave two or more blank lines in a row', () => {
  for (const file of listJs()) {
    it(file, () => {
      const src = readSource(file);
      const { tokens } = parseJs(src);
      const lines = blankRuns(src, literalRanges(tokens));
      assert.deepEqual(lines, [], `${file}: repeated blank lines near line(s) ${lines.join(', ')}`);
    });
  }
  for (const file of ['app.css', 'index.html']) {
    it(file, () => {
      const src = readSource(file);
      const lines = blankRuns(src, []);
      assert.deepEqual(lines, [], `${file}: repeated blank lines near line(s) ${lines.join(', ')}`);
    });
  }
});
