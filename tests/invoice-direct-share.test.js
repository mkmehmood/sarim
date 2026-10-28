import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../modules/cm-ledger.js', import.meta.url), 'utf8');

describe('invoice sharing', () => {
  const direct = src.slice(src.indexOf('export async function openDayInvoice('), src.indexOf('let warmed = false;'));
  it('shares straight away without opening the preview dialog first', () => {
    assert.match(direct, /shareInvoiceFile\(file, state\.phone\)/);
    assert.ok(direct.indexOf('shareInvoiceFile(') < direct.indexOf('openDayInvoicePreview('));
  });
  it('only falls back to the preview when the browser needs a fresh tap', () => {
    assert.match(direct, /result === 'shared'\) return/);
    assert.match(direct, /await openDayInvoicePreview\(kind, dayKey\)/);
  });
});
