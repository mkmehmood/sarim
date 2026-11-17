import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickTopScreen } from '../modules/screen-order.js';
describe('back button closes the screen on top', () => {
  it('with equal stacking the screen opened last wins, so Settings is not closed under a sub-screen', () => {
    const settings = { id: 'settings-screen', z: 10200 };
    const backup = { id: 'backup-restore-screen', z: 10200 };
    assert.equal(pickTopScreen([settings, backup], (e) => e.z).id, 'backup-restore-screen');
  });
  it('a higher stacking level still wins', () => {
    const a = { id: 'a', z: 10300 };
    const b = { id: 'b', z: 10200 };
    assert.equal(pickTopScreen([a, b], (e) => e.z).id, 'a');
  });
  it('a missing stacking value counts as zero and nothing open gives null', () => {
    assert.equal(pickTopScreen([{ id: 'x' }], (e) => e.z).id, 'x');
    assert.equal(pickTopScreen([], () => 0), null);
  });
  it('the native back handler uses it', () => {
    const src = readFileSync(new URL('../modules/native.js', import.meta.url), 'utf8');
    assert.ok(src.includes('pickTopScreen(screens'));
  });
});
