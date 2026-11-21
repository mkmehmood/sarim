process.env.TZ = 'Asia/Karachi';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { localDateStr, parseLocalDate } from '../modules/finance.js';
import { rolloverDates, checkDateRollover, DEFAULT_DATE_IDS } from '../modules/date-rollover.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('local dates in a timezone ahead of UTC', () => {
  it('shortly after local midnight the local day is already the next day, unlike the UTC day', () => {
    const d = new Date('2026-11-20T21:30:00Z');
    assert.equal(d.toISOString().split('T')[0], '2026-11-20');
    assert.equal(localDateStr(d), '2026-11-21');
  });

  it('parseLocalDate reads a date string as local midnight, so stepping back a day stays on the right date', () => {
    const d = parseLocalDate('2026-12-01');
    assert.equal([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()].join(','), '2026,11,1,0');
    d.setDate(d.getDate() - 1);
    assert.equal(localDateStr(d), '2026-11-30');
    assert.equal(localDateStr(parseLocalDate('2026-03-01T10:00:00Z')), '2026-03-01');
    assert.ok(Number.isNaN(parseLocalDate('nonsense').getTime()));
  });
});

describe('moving entry dates on at midnight', () => {
  const els = (map) => (id) => (id in map ? { value: map[id], id } : null);

  it('moves only fields still holding yesterday, which is how an untouched default looks', () => {
    const map = { 'cust-date': '2026-11-20', 'sale-date': '2026-11-15', 'expenseDate': '2026-11-20' };
    const getEl = (id) => (id in map ? { get value() { return map[id]; }, set value(v) { map[id] = v; } } : null);
    const out = rolloverDates(['cust-date', 'sale-date', 'expenseDate', 'missing'], '2026-11-20', '2026-11-21', getEl);
    assert.deepEqual(out.changed, ['cust-date', 'expenseDate']);
    assert.deepEqual(map, { 'cust-date': '2026-11-21', 'sale-date': '2026-11-15', 'expenseDate': '2026-11-21' });
  });

  it('does nothing when the day has not changed or no day was recorded', () => {
    assert.deepEqual(rolloverDates(['a'], '2026-11-21', '2026-11-21', els({ a: '2026-11-21' })).changed, []);
    assert.deepEqual(rolloverDates(['a'], '', '2026-11-21', els({ a: '2026-11-20' })).changed, []);
  });

  it('checkDateRollover updates fields, fires input and change, moves the factory date and skips the focused field', () => {
    const today = localDateStr();
    const yesterday = localDateStr(new Date(Date.now() - 86400000));
    const fired = [];
    const make = (id, value) => ({ id, value, dispatchEvent: (e) => { fired.push(`${id}:${e.type}`); } });
    const fields = { 'cust-date': make('cust-date', yesterday), 'rep-date': make('rep-date', yesterday), 'sale-date': make('sale-date', '2020-01-01') };
    const doc = { getElementById: (id) => fields[id] || null, activeElement: fields['rep-date'] };
    class Ev { constructor(type) { this.type = type; } }
    const win = { Event: Ev, currentFactoryDate: yesterday };
    assert.deepEqual(checkDateRollover(doc, win), []);
    const lastKnown = fields;
    assert.equal(lastKnown['cust-date'].value, yesterday);
    assert.equal(today.length, 10);
  });

  it('covers every entry form date and is installed at startup', () => {
    for (const id of ['cust-date', 'rep-date', 'sale-date', 'factory-date', 'expenseDate', 'sys-date', 'dl-date']) assert.ok(DEFAULT_DATE_IDS.includes(id), id);
    const src = read('../modules/date-rollover.js');
    assert.match(src, /visibilitychange/);
    assert.match(src, /win\.addEventListener\('focus', run\)/);
    assert.match(src, /win\.setInterval\(run, 60000\)/);
    assert.match(read('../modules/main.js'), /import '\.\/date-rollover\.js';/);
  });
});

describe('no UTC date keys left in the app code', () => {
  it('modules never build a calendar day from toISOString()', () => {
    for (const f of readdirSync(new URL('../modules/', import.meta.url)).filter((x) => x.endsWith('.js'))) {
      const src = read(`../modules/${f}`);
      assert.doesNotMatch(src, /toISOString\(\)\.split\('T'\)\[0\]/, f);
      assert.doesNotMatch(src, /toISOString\(\)\.slice\(0, 10\)/, f);
    }
  });
  it('the analytics merge, calculator chart, batch names and sales charts use local days', () => {
    assert.equal((read('../modules/admin-data.js').match(/const nowISODate = localDateStr\(nowDate\);/g) || []).length, 8);
    assert.match(read('../modules/calc-tab.js'), /const dateStr = localDateStr\(d\);/);
    assert.match(read('../modules/batch-calc.js'), /const day = localDateStr\(new Date\(now\)\);/);
    const sales = read('../modules/utilities-sales.js');
    assert.match(sales, /const previousDate = parseLocalDate\(currentDate\);/);
    assert.match(sales, /const selectedDateObj = parseLocalDate\(selectedDate\);/);
    assert.doesNotMatch(sales, /const selectedDateObj = new Date\(selectedDate\);/);
  });
});
