import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.window = globalThis.window || globalThis;
const { isTeamMode, isOwnRecord, hideMoney, anyHidden, MONEY_MASK } = await import('../modules/team-privacy.js');
const { hcMaskMoney } = await import('../modules/history-card.js');
const src = (f) => fs.readFileSync(new URL(`../modules/${f}`, import.meta.url), 'utf8');

describe('team privacy', () => {
  beforeEach(() => { window.appMode = 'userrole'; window._assignedManagerName = 'Sara'; });

  it('only the team mode hides money', () => {
    for (const mode of ['admin', 'rep', 'production', 'factory']) {
      window.appMode = mode;
      assert.equal(isTeamMode(), false);
      assert.equal(hideMoney({ createdBy: 'Someone else' }), false);
    }
    window.appMode = 'userrole';
    assert.equal(isTeamMode(), true);
  });

  it('own records stay visible, all others are hidden', () => {
    assert.equal(isOwnRecord({ createdBy: 'Sara' }), true);
    assert.equal(hideMoney({ createdBy: 'Sara' }), false);
    assert.equal(hideMoney({ createdBy: 'Omar' }), true);
    assert.equal(hideMoney({}), true);
    assert.equal(anyHidden([{ createdBy: 'Sara' }, { createdBy: 'Omar' }]), true);
    assert.equal(anyHidden([{ createdBy: 'Sara' }]), false);
  });

  it('a team member with no assigned name sees no money', () => {
    window._assignedManagerName = '';
    assert.equal(hideMoney({ createdBy: '' }), true);
  });

  it('masks money but keeps kg on history cards', () => {
    const out = hcMaskMoney({
      amount: '12,500', tag: 'Profit 1,200',
      metrics: [
        { label: 'Quantity', value: '25 kg', cls: 'qty-val' },
        { label: 'Net profit', value: '1,200', cls: 'profit-val' },
        { label: 'Rate', value: '500/kg' },
        { label: 'Paid so far', value: '2,000', cls: 'profit-val' }
      ]
    });
    assert.equal(out.amount, MONEY_MASK);
    assert.ok(!/\d/.test(out.tag));
    assert.equal(out.metrics[0].value, '25 kg');
    for (const i of [1, 2, 3]) assert.equal(out.metrics[i].value, MONEY_MASK);
    assert.equal(hcMaskMoney({ amount: '40 kg' }).amount, '40 kg');
  });

  it('every history surface applies the mask', () => {
    assert.match(src('cm-ledger.js'), /if \(e\.hide\) maskEntryMoney\(e\)/);
    assert.match(src('cm-ledger.js'), /d\.hidden\) return null/);
    for (const f of ['customers.js', 'rep-sales.js', 'utilities-core.js']) assert.match(src(f), /hide: hideMoney\(t\)/, f);
    assert.match(src('utilities-sales.js'), /hideMoney\(item\) \? hcMaskMoney\(cardOpts\)/);
    assert.match(src('rep-sales.js'), /hideMoney\(item\) \? hcMaskMoney\(_repCard\)/);
  });

  it('data entry is never gated by the mask', () => {
    for (const f of ['customers.js', 'rep-sales.js', 'utilities-core.js', 'utilities-sales.js', 'cm-ledger.js']) {
      assert.doesNotMatch(src(f), /hideMoney[^\n]*openStandaloneScreen|isTeamMode\(\)[^\n]*(startEdit|openStandaloneScreen)/, f);
    }
  });
});

describe('team privacy keeps entry forms working', () => {
  it('the collection previews read the real debt from data-value, not the masked text', () => {
    assert.match(src('utilities-sales.js'), /creditEl\.dataset\.value/);
    assert.match(src('rep-sales.js'), /_credEl\.dataset\.value/);
    assert.match(src('customers.js'), /_credNode\.dataset\.value = String\(totalCredit\)/);
  });
});
