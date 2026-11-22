import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('markup integrity', () => {
  it('never puts an attribute inside another attribute value', () => {
    assert.equal(/=\s*aria-label=/.test(html), false);
    assert.equal(/=\s*"\s*[a-z-]+="/.test(html), false);
  });
  it('keeps the restore picker handler whole so no code shows as page text', () => {
    const tag = html.split("\n").find((l) => l.includes('id="restoreInput"'));
    assert.match(tag, /onchange="\(async \(\) => \{ await unifiedRestore\(event\) \}\)\(\)"/);
    assert.match(tag, /aria-label="Restore Input"/);
  });
});
