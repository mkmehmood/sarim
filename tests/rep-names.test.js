import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fillEmptyRepList } from '../modules/rep-names.js';

describe('fillEmptyRepList: accounts control the list, history is only a safety net', () => {
  it('never changes a list that already has reps', () => {
    const data = { reps: ['BILAL'], rep: [{ salesRep: 'CHAND' }], sales: [{ salesRep: 'ZED' }] };
    assert.deepEqual(fillEmptyRepList(['ALI REP'], data), ['ALI REP']);
  });
  it('uses the backup list first when the current list is empty', () => {
    assert.deepEqual(fillEmptyRepList([], { reps: ['ali  rep', 'Bilal', 'BILAL'], sales: [{ salesRep: 'ZED' }] }), ['ALI REP', 'BILAL']);
  });
  it('falls back to reps that have records, so history is never left without its rep', () => {
    assert.deepEqual(fillEmptyRepList([], { sales: [{ salesRep: 'NONE' }, { salesRep: 'zed' }], rep: [{ salesRep: 'Chand' }, null] }), ['CHAND', 'ZED']);
  });
  it('stays empty when there is nothing to recover', () => {
    assert.deepEqual(fillEmptyRepList(null, null), []);
    assert.deepEqual(fillEmptyRepList([], { sales: [{ salesRep: 'NONE' }] }), []);
    assert.deepEqual(fillEmptyRepList(['', '  '], {}), []);
  });
});
