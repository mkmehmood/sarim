import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repDataCount, repRemovalPlan, withoutRep, repKey } from '../modules/rep-data.js';

const accounts = readFileSync(new URL('../modules/accounts.js', import.meta.url), 'utf8');

describe('repDataCount', () => {
  it('counts records tagged with the rep, ignoring case and spacing', () => {
    const stores = { rep: [{ salesRep: 'NORAN SHAH' }, { salesRep: ' noran shah ' }, { salesRep: 'OTHER' }], clients: [{ salesRep: 'Noran Shah' }], expenses: [{ seller: 'NORAN SHAH' }] };
    assert.equal(repDataCount('noran shah', stores), 4);
  });
  it('is zero when nothing references the rep', () => {
    assert.equal(repDataCount('ALI', { rep: [{ salesRep: 'NORAN SHAH' }], sales: [{ salesRep: 'NONE' }, null] }), 0);
    assert.equal(repDataCount('ALI', {}), 0);
    assert.equal(repDataCount('', { rep: [{ salesRep: '' }] }), 0);
  });
  it('does not mix up similar names', () => {
    assert.equal(repDataCount('ALI', { rep: [{ salesRep: 'ALI KHAN' }] }), 0);
  });
});

describe('repRemovalPlan', () => {
  const list = ['NORAN SHAH', 'ALI'];
  it('blocks removal when the rep has data', () => {
    const p = repRemovalPlan('Ali', { rep: [{ salesRep: 'ALI' }] }, list);
    assert.deepEqual(p, { blocked: true, count: 1, remove: false });
  });
  it('removes the profile when there is no data', () => {
    assert.deepEqual(repRemovalPlan('Ali', { rep: [] }, list), { blocked: false, count: 0, remove: true });
  });
  it('has nothing to remove when the rep is not listed', () => {
    assert.equal(repRemovalPlan('Zed', {}, list).remove, false);
  });
});

describe('withoutRep', () => {
  it('drops only the matching rep', () => {
    assert.deepEqual(withoutRep(['NORAN SHAH', 'ALI'], ' ali '), ['NORAN SHAH']);
    assert.equal(repKey(' ali '), 'ALI');
  });
});

describe('accounts wiring', () => {
  it('checks rep data before confirming a role removal or account removal', () => {
    assert.match(accounts, /droppingRep[\s\S]*?_repRemovalPlan\(acct\)[\s\S]*?plan\.blocked[\s\S]*?const change =/);
    assert.match(accounts, /wasRep[\s\S]*?_repRemovalPlan\(target\)[\s\S]*?plan\.blocked[\s\S]*?showGlassConfirm/);
  });
  it('takes the rep off the list after a successful removal', () => {
    assert.match(accounts, /droppedRep = droppingRep && await _dropRepFromList\(acct\)/);
    assert.match(accounts, /droppedRep = wasRep && await _dropRepFromList\(target\)/);
  });
});
