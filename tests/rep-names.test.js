import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeRepNames } from '../modules/rep-names.js';

describe('mergeRepNames', () => {
  it('keeps the existing list and adds names from the backup list and records, without duplicates', () => {
    const out = mergeRepNames(['ALI REP'], { reps: ['ali  rep', 'BILAL'], rep: [{ salesRep: 'Chand' }], sales: [{ salesRep: 'NONE' }, { salesRep: 'bilal' }, null] });
    assert.deepEqual(out, ['ALI REP', 'BILAL', 'Chand']);
  });
  it('recovers rep names from an old backup that has no rep list', () => {
    assert.deepEqual(mergeRepNames([], { sales: [{ salesRep: 'ZED' }], rep: [] }), ['ZED']);
  });
  it('handles empty and bad input', () => {
    assert.deepEqual(mergeRepNames(null, null), []);
    assert.deepEqual(mergeRepNames(['NONE', ''], {}), []);
  });
});
