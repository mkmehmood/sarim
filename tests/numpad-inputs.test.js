import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');

const files = ['index.html', ...readdirSync(new URL('screens/', root)).filter((f) => f.endsWith('.screen.html')).map((f) => 'screens/' + f)];
const inputs = [];
for (const f of files) {
  for (const m of read(f).matchAll(/<input\b[^>]*>/g)) {
    const tag = m[0];
    const attr = (n) => (tag.match(new RegExp(`\\b${n}="([^"]*)"`)) || [])[1];
    inputs.push({ file: f, tag, id: attr('id') || '(no id)', type: attr('type'), inputmode: attr('inputmode') });
  }
}

describe('numeric fields open the number pad, not the letter keyboard', () => {
  it('every number input declares a numeric inputmode', () => {
    const nums = inputs.filter((i) => i.type === 'number');
    assert.ok(nums.length > 30, 'the scan finds the number inputs');
    const bad = nums.filter((i) => !['decimal', 'numeric'].includes(i.inputmode)).map((i) => `${i.file}#${i.id}`);
    assert.deepEqual(bad, [], 'number inputs without inputmode: ' + bad.join(', '));
  });

  it('phone inputs open the phone pad', () => {
    const phones = inputs.filter((i) => /phone/i.test(i.id));
    assert.ok(phones.length >= 3);
    for (const p of phones) assert.ok(p.type === 'tel' || p.inputmode === 'tel', `${p.file}#${p.id}`);
  });

  it('the manual ledger page field is numeric on customers, rep customers and entities', () => {
    for (const id of ['edit-cust-ledger-page', 'rep-edit-cust-ledger-page', 'entityLedgerPage']) {
      const i = inputs.find((x) => x.id === id);
      assert.ok(i, `${id} exists`);
      assert.equal(i.inputmode, 'numeric', `${id} opens the number pad`);
      assert.match(i.tag, /maxlength="12"/);
    }
  });

  it('the old balance amount is a decimal number field', () => {
    const i = inputs.find((x) => x.id === 'entityOpeningAmount');
    assert.ok(i);
    assert.equal(i.type, 'number');
    assert.equal(i.inputmode, 'decimal');
  });

  it('the old balance picker offers credit and debit', () => {
    const html = read('index.html');
    const sel = html.match(/<select id="entityOpeningType"[\s\S]*?<\/select>/);
    assert.ok(sel);
    assert.match(sel[0], /value="credit"/);
    assert.match(sel[0], /value="debit"/);
  });

  it('inputs created from JavaScript also declare an inputmode', () => {
    for (const f of readdirSync(new URL('modules/', root)).filter((n) => n.endsWith('.js'))) {
      for (const m of read('modules/' + f).matchAll(/<input\b[^>]*type=\\?"number\\?"[^>]*>/g)) {
        assert.match(m[0], /inputmode=/, `modules/${f}: ${m[0].slice(0, 80)}`);
      }
    }
  });
});

describe('rep customer and entity screens carry the ledger page and edit history', () => {
  const html = read('index.html');
  it('both screens have a history card', () => {
    assert.match(html, /id="rep-cust-edit-history-card"/);
    assert.match(html, /id="entity-edit-history-card"/);
  });
  it('rep customers save the page and record history', () => {
    const rep = read('modules/rep-sales.js');
    assert.match(rep, /contact\.ledgerPage = ledgerPage/);
    assert.match(rep, /pushHistory\(contact, historyDiff\(REP_HISTORY_FIELDS/);
    assert.match(rep, /avatarBadge: repContact\?\.ledgerPage/);
  });
  it('entities save the old balance, page and history, and use the old balance in every balance total', () => {
    const pay = read('modules/utilities-payments.js');
    assert.match(pay, /openingBalance,\s*\n?ledgerPage,/);
    assert.match(pay, /pushHistory\(_updated, historyDiff\(ENTITY_HISTORY_FIELDS/);
    assert.equal((pay.match(/\] = openingBalanceOf\(entity\)/g) || []).length, 2, 'both balance builders start from the old balance');
    assert.match(read('modules/payments-tab.js'), /entityNetBalances\[e\.id\] = openingBalanceOf\(e\)/);
  });
});
