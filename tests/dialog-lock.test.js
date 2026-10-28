import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isScreenAllowed, moneyLine, redactMoney, sanitizeConfirmExtra } from '../modules/money-privacy.js';

const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const read = (f) => readFileSync(new URL(`../modules/${f}`, import.meta.url), 'utf8');

afterEach(() => { delete globalThis.window; });

const asRole = (mode) => { globalThis.window = { appMode: mode }; };

describe('sanitizeConfirmExtra', () => {
  const extra = () => ({
    lead: 'Save this entry?',
    lines: ['Formula: A', moneyLine('Total Cost: Rs 10'), moneyLine('Net Profit: Rs 4')],
    notes: [moneyLine('Credited: Rs 5'), 'Raw materials deducted'],
    warning: 'John already has unpaid credit.',
    restrictedWarning: 'Check this credit sale before saving.',
  });

  it('drops money lines and notes and swaps the warning for restricted roles', () => {
    const out = sanitizeConfirmExtra(extra(), 'userrole');
    assert.deepEqual(out.lines, ['Formula: A']);
    assert.deepEqual(out.notes, ['Raw materials deducted']);
    assert.equal(out.warning, 'Check this credit sale before saving.');
    assert.equal('restrictedWarning' in out, false);
    assert.equal(out.lead, 'Save this entry?');
  });

  it('keeps every line as plain text for unrestricted modes', () => {
    for (const m of ['admin', 'rep', 'production', 'factory']) {
      const out = sanitizeConfirmExtra(extra(), m);
      assert.deepEqual(out.lines, ['Formula: A', 'Total Cost: Rs 10', 'Net Profit: Rs 4']);
      assert.deepEqual(out.notes, ['Credited: Rs 5', 'Raw materials deducted']);
      assert.equal(out.warning, 'John already has unpaid credit.');
    }
  });

  it('copes with empty input and does not mutate it', () => {
    assert.deepEqual(sanitizeConfirmExtra(undefined, 'userrole'), {});
    const e = extra();
    sanitizeConfirmExtra(e, 'userrole');
    assert.equal(e.lines.length, 3);
  });
});

describe('redactMoney', () => {
  it('returns the safe text only for restricted roles', () => {
    asRole('userrole');
    assert.equal(redactMoney('Available: Rs 90', 'Insufficient cash in hand.'), 'Insufficient cash in hand.');
    asRole('admin');
    assert.equal(redactMoney('Available: Rs 90', 'Insufficient cash in hand.'), 'Available: Rs 90');
  });
});

describe('isScreenAllowed', () => {
  it('limits restricted roles to the settings, splash and feedback screens', () => {
    for (const id of ['settings-screen', 'splash-screen', 'feedback-screen']) assert.equal(isScreenAllowed(id, 'userrole'), true, id);
    for (const id of ['entity-details-screen', 'expense-details-screen', 'customer-edit-screen', 'customer-management-screen',
      'stock-transfer-screen', 'payment-transfer-screen', 'daily-ledger-screen', 'add-entity-screen', 'raw-material-screen',
      'recycle-bin-screen', 'store-manager-screen', 'user-roles-screen', 'app-accounts-screen']) {
      assert.equal(isScreenAllowed(id, 'userrole'), false, id);
    }
  });

  it('does not restrict any other mode', () => {
    for (const m of ['admin', 'rep', 'production', 'factory', undefined]) assert.equal(isScreenAllowed('entity-details-screen', m), true, String(m));
  });
});

describe('wiring', () => {
  it('routes gcCommit through the sanitizer', () => {
    const src = read('confirm-guard.js');
    assert.match(src, /import \{ sanitizeConfirmExtra \} from '\.\/money-privacy\.js'/);
    assert.match(src, /l\.ask\(sanitizeConfirmExtra\(extra\)\)/);
  });

  it('gates openStandaloneScreen on isScreenAllowed', () => {
    const start = HTML.indexOf('function openStandaloneScreen(id)');
    assert.ok(start > 0);
    const body = HTML.slice(start, start + 500);
    assert.match(body, /window\.isScreenAllowed\(id\)/);
  });

  it('marks the money lines in the role-facing confirm dialogs', () => {
    assert.match(read('utilities-core.js'), /moneyLine\(`Net Profit:/);
    assert.match(read('factory.js'), /moneyLine\(`Cost Per Unit:/);
    const sales = read('utilities-sales.js');
    assert.match(sales, /moneyLine\(`Unpaid balance:/);
    assert.match(sales, /moneyLine\(`Owes:/);
    assert.match(sales, /moneyLine\(`Expired goods credited:/);
  });

  it('redacts cash-in-hand alerts', () => {
    assert.equal((read('utilities-payments.js').match(/redactMoney\(`Insufficient cash in hand/g) || []).length, 3);
    assert.match(read('utilities-sales.js'), /redactMoney\(`Insufficient cash in hand/);
  });
});
