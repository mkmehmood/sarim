import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');

describe('customer management shows weight instead of entry counts', () => {
  const ledger = read('modules/cm-ledger.js');

  it('ledger month and day summaries use total kg for customers and reps', () => {
    assert.ok(!/countLabel/.test(ledger), 'no entry-count label remains in any ledger');
    assert.ok(/\} kg sold/.test(ledger), 'weight is formatted as kg sold');
    assert.ok(!/\$\{D\.items\.length\} entries/.test(ledger), 'day footer no longer hard-codes entries');
    assert.ok(!/\$\{M\.c\} \$\{M\.c === 1/.test(ledger), 'month header no longer hard-codes entries');
  });

  it('both ledger builders pass each entry weight', () => {
    for (const f of ['modules/customers.js', 'modules/rep-sales.js']) {
      assert.ok(/_entries\.push\(\{\s*id: t\.id, qty: periodQuantity\(\[\{ t \}\]\)/.test(read(f)), `${f} sets qty on every ledger entry`);
    }
  });

  it('rep customer rows show kg, not an entry count', () => {
    const rep = read('modules/rep-sales.js');
    assert.ok(/customerData\.qty > 0 \?[^\n]*\} kg/.test(rep));
    assert.ok(!/customerData\.count/.test(rep));
  });

  it('rep activity header shows total kg', () => {
    const rep = read('modules/rep-sales.js');
    assert.ok(/hc-list-count">\$\{fmtNum\(periodQuantity\(activityData\.map/.test(rep));
    assert.ok(!/activityData\.length\} \$\{activityData\.length === 1/.test(rep));
  });
});
