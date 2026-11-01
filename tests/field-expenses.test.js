import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  addExpenseItem, removeExpenseItem, expenseTotal, cleanExpenseItems,
  expenseItemsOfRecord, commissionItemsOfRecord, mergeExpenseItems, sortedExpenseEntries,
  addCategoryName, cleanCategoryNames
} from '../modules/field-expense-items.js';
import { hcExpensesHtml } from '../modules/history-card.js';
import { smExpensesHtml, smCalcHtml } from '../modules/summary-card.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const fmt = { num: (n) => String(n), amt: (n) => `Rs ${n}`, safe: (n) => Number(n) || 0 };

describe('field expense items', () => {
  it('adds named expenses and merges the same name regardless of case', () => {
    let list = addExpenseItem([], ' Fuel ', 500);
    list = addExpenseItem(list, 'Food', 200);
    list = addExpenseItem(list, 'fuel', 250.5);
    assert.deepEqual(list, [{ name: 'Fuel', amount: 750.5 }, { name: 'Food', amount: 200 }]);
    assert.equal(expenseTotal(list), 950.5);
  });

  it('ignores blank names and amounts that are not above zero', () => {
    assert.deepEqual(addExpenseItem([], '', 10), []);
    assert.deepEqual(addExpenseItem([], 'Fuel', 0), []);
    assert.deepEqual(addExpenseItem([], 'Fuel', -5), []);
    assert.deepEqual(addExpenseItem([], 'Fuel', 'abc'), []);
    assert.deepEqual(cleanExpenseItems([{ name: 'A', amount: 1 }, { name: '', amount: 5 }, null, { name: 'B', amount: 0 }]), [{ name: 'A', amount: 1 }]);
  });

  it('does not change the list it was given', () => {
    const before = [{ name: 'Fuel', amount: 100 }];
    addExpenseItem(before, 'Fuel', 50);
    assert.deepEqual(before, [{ name: 'Fuel', amount: 100 }]);
  });

  it('removes one item by position', () => {
    const list = [{ name: 'A', amount: 1 }, { name: 'B', amount: 2 }, { name: 'C', amount: 3 }];
    assert.deepEqual(removeExpenseItem(list, 1), [{ name: 'A', amount: 1 }, { name: 'C', amount: 3 }]);
  });

  it('reads saved items, and falls back to the old single total for records saved before this', () => {
    assert.deepEqual(expenseItemsOfRecord({ fieldExpenseItems: [{ name: 'Fuel', amount: 40 }], fieldExpenses: 40 }), [{ name: 'Fuel', amount: 40 }]);
    assert.deepEqual(expenseItemsOfRecord({ fieldExpenses: 300 }), [{ name: 'Other', amount: 300 }]);
    assert.deepEqual(expenseItemsOfRecord({ fieldExpenses: 0 }), []);
    assert.deepEqual(expenseItemsOfRecord(null), []);
  });

  it('totals categories across records, biggest first', () => {
    const records = [
      { fieldExpenseItems: [{ name: 'Fuel', amount: 100 }, { name: 'Food', amount: 50 }] },
      { fieldExpenseItems: [{ name: 'fuel', amount: 60 }] },
      { fieldExpenses: 25 }
    ];
    let merged = [];
    for (const r of records) merged = mergeExpenseItems(merged, expenseItemsOfRecord(r));
    assert.deepEqual(sortedExpenseEntries(merged), [['Fuel', 160], ['Food', 50], ['Other', 25]]);
  });
});

describe('expense breakdown cards', () => {
  it('history card uses the same collapsible rows as the factory materials breakdown', () => {
    const html = hcExpensesHtml([['Fuel', 750], ['A <b>', 20]], (v) => `Rs ${v}`);
    assert.match(html, /<details class="panel hc-more"><summary>Expenses breakdown<\/summary><div class="hc-mats">/);
    assert.match(html, /<div class="hc-mat"><span class="hc-mat-name">Fuel<\/span>/);
    assert.ok(html.includes('Rs 750'));
    assert.ok(html.includes('A &lt;b&gt;'), 'names are escaped');
  });

  it('summary card lists each category like the sold breakdown', () => {
    const html = smExpensesHtml([['Fuel', 750], ['Food', 200]], fmt);
    assert.match(html, /<details class="sm-more"><summary>Expenses breakdown<\/summary><div class="sm-rows">/);
    assert.ok(html.includes('Fuel') && html.includes('Rs 750') && html.includes('Food'));
  });

  it('shows nothing when there are no expenses', () => {
    assert.equal(hcExpensesHtml([], String), '');
    assert.equal(hcExpensesHtml(undefined, String), '');
    assert.equal(smExpensesHtml([], fmt), '');
    assert.ok(!smCalcHtml('D', { revenue: 1, creditVal: 0, collected: 0, received: 1, expected: 1 }, fmt).includes('Expenses breakdown'));
  });

  it('the calculator summary card includes the breakdown when entries exist', () => {
    const html = smCalcHtml('D', { revenue: 1, creditVal: 0, collected: 0, received: 1, expected: 1, fieldExp: 950, fieldExpEntries: [['Fuel', 750], ['Food', 200]] }, fmt);
    assert.ok(html.includes('Expenses breakdown') && html.includes('Fuel'));
  });
});

describe('calculator tab wiring', () => {
  it('the Field Expenses field opens the pop-up and cannot be typed into', () => {
    const html = read('index.html');
    const m = /<input[^>]*id="fieldExpenses"[^>]*>/.exec(html);
    assert.ok(m, 'field exists');
    assert.match(m[0], /readonly/);
    assert.match(m[0], /onclick="openFieldExpensePopup\(\)"/);
  });

  it('the pop-up has a name field, an amount field and a Save button that keeps it open for more', () => {
    const src = read('modules/field-expenses.js');
    assert.match(src, /nameId: 'fe-name'/);
    assert.match(src, /nameId: 'cp-name'/);
    assert.match(src, /id="\$\{cfg\.nameId\}"/);
    assert.match(src, /id="\$\{pre\}-amount"/);
    assert.match(src, /label: 'Save'/);
    assert.match(src, /return \{ ok: false \}/);
    assert.match(src, /window\.openFieldExpensePopup = openFieldExpensePopup/);
    assert.ok(read('modules/main.js').includes("import './field-expenses.js'"));
    assert.ok(read('sw.js').includes("'./modules/field-expenses.js'") && read('sw.js').includes("'./modules/field-expense-items.js'"));
  });

  it('saving a calculator entry stores the items and clears them afterwards', () => {
    const src = read('modules/utilities-sales.js');
    assert.match(src, /fieldExpenseItems: getFieldExpenseItems\(\)/);
    assert.match(src, /resetFieldExpenses\(\);/);
  });

  it('history cards, period summaries and totals all carry the breakdown', () => {
    const src = read('modules/utilities-payments.js');
    assert.match(src, /fieldExpItems: expenseItemsOfRecord\(h\)/);
    assert.match(src, /range\.fieldExpItems = mergeExpenseItems/);
    assert.match(src, /body: hcExpensesHtml\(sortedExpenseEntries\(data\.fieldExpItems\), fmtAmt\)/);
    assert.match(src, /smExpensesHtml\(sortedExpenseEntries\(data\.fieldExpItems\)/);
  });
});

describe('commission paid pop-up', () => {
  it('the Commission Paid field opens the same pop-up and cannot be typed into', () => {
    const m = /<input[^>]*id="commissionPaid"[^>]*>/.exec(read('index.html'));
    assert.ok(m, 'field exists');
    assert.match(m[0], /readonly/);
    assert.match(m[0], /onclick="openCommissionPaidPopup\(\)"/);
  });

  it('the name field uses universal search so a tapped category is reused', () => {
    const src = read('modules/field-expenses.js');
    assert.match(src, /handleUniversalSearch\('\$\{cfg\.nameId\}','\$\{cfg\.resultsId\}','\$\{cfg\.source\}'\)/);
    assert.match(src, /window\.openCommissionPaidPopup = openCommissionPaidPopup/);
    const pay = read('modules/utilities-payments.js');
    assert.match(pay, /case 'field-expense-category':/);
    assert.match(pay, /case 'commission-category':/);
    assert.match(pay, /type === 'category-pick'/);
  });

  it('commission items fall back to a single Commission line for older records', () => {
    assert.deepEqual(commissionItemsOfRecord({ commissionPaidItems: [{ name: 'Advance', amount: 40 }] }), [{ name: 'Advance', amount: 40 }]);
    assert.deepEqual(commissionItemsOfRecord({ commissionPaid: 300 }), [{ name: 'Commission', amount: 300 }]);
    assert.deepEqual(commissionItemsOfRecord({ commissionPaid: 0 }), []);
  });

  it('saving stores commission items, clears them, and cards show a Commission breakdown', () => {
    const sales = read('modules/utilities-sales.js');
    assert.match(sales, /commissionPaidItems: getCommissionItems\(\)/);
    assert.match(sales, /resetCommissionPaid\(\);/);
    assert.ok(smExpensesHtml([['Advance', 40]], fmt, 'Commission breakdown').includes('Commission breakdown'));
    assert.ok(hcExpensesHtml([['Advance', 40]], String, 'Commission breakdown').includes('Commission breakdown'));
    const pay = read('modules/utilities-payments.js');
    assert.match(pay, /range\.commissionItems = mergeExpenseItems/);
  });
});

describe('category lists are separate from app data and from each other', () => {
  it('keeps names unique regardless of case and drops blanks', () => {
    assert.deepEqual(cleanCategoryNames([' Fuel ', 'fuel', '', null, 'Food']), ['Fuel', 'Food']);
    assert.deepEqual(addCategoryName(['Fuel'], 'FUEL'), ['Fuel']);
    assert.deepEqual(addCategoryName(['Fuel'], 'Food'), ['Fuel', 'Food']);
    assert.deepEqual(addCategoryName(['Fuel'], ''), ['Fuel']);
  });

  it('search reads its own saved list per field, never sales or rep records', () => {
    const src = read('modules/field-expenses.js');
    assert.match(src, /storeKey: 'field_expense_categories'/);
    assert.match(src, /storeKey: 'commission_categories'/);
    assert.match(src, /sqliteStore\.get\(KINDS\[kind\]\.storeKey\)/);
    assert.match(src, /loadCategories\(kind\)/);
    assert.ok(!/loadCollections/.test(src), 'does not search sales or rep records');
    const biz = read('modules/business.js');
    assert.match(biz, /'field_expense_categories'/);
    assert.match(biz, /'commission_categories'/);
  });
});
