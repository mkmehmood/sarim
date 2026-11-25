// Differential fixtures for the Calculator tab's live reconciliation. The arithmetic is the body of
// calculateSales() in modules/calc-tab.js, verbatim apart from reading its inputs from an object instead of
// the form fields (readNum is `parseFloat(value) || 0`, so a blank field is 0).
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { round2 } from '../../../../modules/finance.js';

const safeValue = (value) => (isNaN(value) || !isFinite(value) ? 0 : value); // utilities-payments.js

function calculateSales(f) {
  const costPerKg = 0; void costPerKg;
  const sold = f.sold, ret = f.returned, exp = f.expired, shared = f.shared, cred = f.credit;
  const prev = f.prevCreditReceived, rec = f.receivedCash, fieldExp = f.fieldExpenses;
  const salePrice = f.salePrice, commissionPerUnit = f.commissionPerUnit, commissionPaid = f.commissionPaid;
  const netSold = Math.max(0, sold - ret - exp - shared);
  const cashQty = Math.max(0, netSold - cred);
  const expected = (cashQty * salePrice) + prev - fieldExp - commissionPaid;
  const diff = rec - expected;
  let status, amount;
  if (Math.abs(diff) < 0.01) { status = 'MATCH'; amount = 0; }
  else if (diff < -0.01) { status = 'SHORT'; amount = Math.abs(diff); }
  else { status = 'OVER'; amount = diff; }
  const grossCommission = commissionPerUnit * netSold;
  const commissionPayable = Math.max(0, grossCommission - commissionPaid);
  return {
    netSold: round2(netSold), expected: safeValue(expected), status, amount: safeValue(amount),
    grossCommission: safeValue(grossCommission), commissionPaid: safeValue(commissionPaid), commissionPayable: safeValue(commissionPayable),
  };
}

let seed = 20261125;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = (max, dp = 2) => (rnd() < 0.25 ? 0 : Math.round(rnd() * max * 10 ** dp) / 10 ** dp);
const cases = [];
for (let i = 0; i < 400; i++) {
  const f = {
    sold: pick(500), returned: pick(40), expired: pick(30), shared: pick(20), credit: pick(200),
    prevCreditReceived: pick(50000, 0), receivedCash: pick(200000, 0), fieldExpenses: pick(5000, 0),
    salePrice: pick(900, 1), commissionPerUnit: pick(20), commissionPaid: pick(8000, 0),
  };
  // Half the cases land exactly on the expected cash, so the MATCH and sub-paisa boundaries are exercised.
  if (i % 2 === 0) {
    const e = calculateSales({ ...f, receivedCash: 0 }).expected;
    f.receivedCash = i % 4 === 0 ? e : Math.round((e + (rnd() - 0.5) * 0.03) * 100) / 100;
  }
  cases.push({ input: f, expected: calculateSales(f) });
}
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'calc_cases.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ cases }, null, 1) + '\n');
console.log(`wrote ${cases.length} cases`);
