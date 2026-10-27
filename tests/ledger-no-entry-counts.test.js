import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LEDGER = readFileSync(new URL('../modules/cm-ledger.js', import.meta.url), 'utf8');

describe('customer, rep and entity ledgers', () => {
  it('never print entry counts in day or month summaries', () => {
    assert.doesNotMatch(LEDGER, /\}\s+entries\b/);
    assert.doesNotMatch(LEDGER, /' entr(y|ies)'/);
    assert.doesNotMatch(LEDGER, /'entry'/);
  });

  it('show kg sold only when the period actually sold something', () => {
    assert.match(LEDGER, /M\.kg > 0 \? kgSoldText\(M\.kg\) : ''/);
    assert.match(LEDGER, /D\.kg > 0 \? kgSoldText\(D\.kg\)/);
  });
});
