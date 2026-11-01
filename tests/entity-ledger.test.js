import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');

describe('payments entity details uses the shared ledger', () => {
  const html = read('index.html');
  const core = read('modules/utilities-core.js');
  const ledger = read('modules/cm-ledger.js');
  it('screen has the same summary, filter and month-jump hosts as Sales', () => {
    for (const id of ['entityManagementSummary', 'entityHistoryFilters', 'entityMonthJump', 'entityManagementHistoryList']) {
      assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
    }
    assert.ok(!html.includes('id="entityPdfRange"'), 'old period dropdown must be gone');
  });
  it('ledger config knows the entity kind and offers the invoice button', () => {
    assert.match(ledger, /ent: \{[^}]*list: 'entityManagementHistoryList'/);
    assert.doesNotMatch(ledger, /noInvoice: true/);
  });
  it('renderer feeds renderLedger and the PDF export takes From/To', () => {
    assert.match(core, /renderLedger\('ent'/);
    assert.ok(!core.includes("getElementById('entityPdfRange')"));
    assert.match(core, /kind === 'entity'\) \{\s*\n\s*const bounds/);
  });
});
