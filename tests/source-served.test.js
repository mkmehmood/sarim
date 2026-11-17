import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, normalize, sep } from 'node:path';
import * as acorn from 'acorn';

const root = fileURLToPath(new URL('../', import.meta.url));

function serveSource() {
  return new Promise(resolve => {
    const server = http.createServer(async (req, res) => {
      const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[/\\]+/, '');
      if (path.split(sep).includes('..')) { res.writeHead(403).end(); return; }
      try {
        res.writeHead(200).end(await readFile(join(root, path || 'index.html')));
      } catch {
        res.writeHead(404).end();
      }
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/` }));
  });
}

test('a site that serves the source tree as-is (no build step) has every file the app imports and precaches', async () => {
  const { server, base } = await serveSource();
  try {
    const get = async u => { const r = await fetch(u); return r.ok ? r.text() : null; };
    const seen = new Set();
    const missing = [];
    const queue = [`${base}modules/main.js`];
    while (queue.length) {
      const u = queue.pop();
      if (seen.has(u)) continue;
      seen.add(u);
      const text = await get(u);
      if (text === null) { missing.push(u.replace(base, '')); continue; }
      const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
      const add = spec => { if (spec.startsWith('.')) queue.push(new URL(spec, u).href); };
      const visit = n => {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(visit); return; }
        if (typeof n.type !== 'string') return;
        if ((n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration' || (n.type === 'ExportNamedDeclaration' && n.source)) && n.source) add(n.source.value);
        if (n.type === 'ImportExpression' && n.source.type === 'Literal') add(n.source.value);
        for (const k of Object.keys(n)) if (k !== 'type') visit(n[k]);
      };
      visit(ast);
    }
    const sw = await get(`${base}sw.js`);
    for (const m of sw.matchAll(/'(\.\/[^']+)'/g)) {
      const r = await fetch(new URL(m[1], base));
      if (!r.ok) missing.push(`service worker precache: ${m[1]}`);
    }
    assert.ok(seen.size > 50, 'the crawl reached the app');
    assert.deepEqual(missing, []);
  } finally {
    server.close();
  }
});
