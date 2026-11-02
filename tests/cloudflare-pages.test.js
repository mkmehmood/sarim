import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('Cloudflare Pages hosting', () => {
  const headers = read('../_headers');
  it('never caches the app shell or the service worker, so updates always arrive', () => {
    for (const path of ['/', '/index.html', '/sw.js', '/manifest.json']) {
      assert.match(headers, new RegExp(`^${path.replace('.', '\\.')}\\n  Cache-Control: no-cache`, 'm'));
    }
    assert.match(headers, /X-Content-Type-Options: nosniff/);
  });
  it('ships the headers file in the build output', () => {
    assert.match(read('../build.js'), /'brand-logo\.jpg', '_headers'/);
  });
  it('keeps the old GitHub Pages deploy manual so a private repo stops failing builds', () => {
    const wf = read('../.github/workflows/deploy.yml');
    assert.match(wf, /on:\n  workflow_dispatch:/);
    assert.doesNotMatch(wf, /branches: \[main\]/);
  });
  it('documents the project settings', () => {
    const doc = read('../docs/cloudflare-pages.md');
    assert.match(doc, /Build command: `npm ci && npm run build`/);
    assert.match(doc, /Build output directory: `dist`/);
    assert.match(doc, /NODE_VERSION/);
    assert.match(doc, /ALLOWED_ORIGIN/);
    assert.match(doc, /Authorized domains/);
  });
  it('uses relative paths only, so it works at the root of any address', () => {
    const m = JSON.parse(read('../manifest.json'));
    assert.equal(m.start_url, './');
    assert.equal(m.scope, './');
  });
});
