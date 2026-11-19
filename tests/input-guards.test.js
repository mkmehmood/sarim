import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalName, phoneIssue, dateIssue, strictAmount, roundMoney, amountIssue } from '../modules/input-guards.js';

describe('input guards', () => {
  it('phone: blank is fine, letters and bad lengths are rejected', () => {
    assert.equal(phoneIssue(''), '');
    assert.equal(phoneIssue('03001234567'), '');
    assert.equal(phoneIssue('+92 300 1234567'), '');
    assert.equal(phoneIssue('(042) 123-4567'), '');
    assert.notEqual(phoneIssue('abc'), '');
    assert.notEqual(phoneIssue('12'), '');
    assert.notEqual(phoneIssue('1234567890123456'), '');
    assert.notEqual(phoneIssue('0300-ABC-1234'), '');
  });
  it('date: blank allowed (callers default it), invalid and future rejected', () => {
    assert.equal(dateIssue('', '2026-11-18'), '');
    assert.equal(dateIssue('2026-11-18', '2026-11-18'), '');
    assert.equal(dateIssue('2026-01-01', '2026-11-18'), '');
    assert.equal(dateIssue('2026-11-19', '2026-11-18'), 'Date cannot be in the future.');
    assert.equal(dateIssue('2031-01-01', '2026-11-18'), 'Date cannot be in the future.');
    assert.equal(dateIssue('2026-13-45', '2026-11-18'), 'Please enter a valid date.');
    assert.equal(dateIssue('2026-02-30', '2026-11-18'), 'Please enter a valid date.');
    assert.equal(dateIssue('1900-01-01', '2026-11-18'), 'Please enter a valid date.');
    assert.equal(dateIssue('18/11/2026', '2026-11-18'), 'Please enter a valid date.');
  });
  it('strictAmount: accepts plain and comma numbers, rejects trailing junk', () => {
    assert.equal(strictAmount('1500'), 1500);
    assert.equal(strictAmount('1,500'), 1500);
    assert.equal(strictAmount('1,500.25'), 1500.25);
    assert.equal(strictAmount('0.5'), 0.5);
    for (const bad of ['', 'abc', '12abc', '1.2.3', '1,50', '-5', '1e12', ' ']) assert.ok(Number.isNaN(strictAmount(bad)), bad);
  });
  it('roundMoney and amountIssue', () => {
    assert.equal(roundMoney(1022.0000000000001), 1022);
    assert.equal(roundMoney(33.339), 33.34);
    assert.equal(amountIssue(0), 'Please enter a valid amount greater than 0.');
    assert.equal(amountIssue(1e12), 'Amount is too large.');
    assert.equal(amountIssue(10), '');
  });
  it('canonicalName reuses the stored spelling and collapses spaces', () => {
    const known = [{ name: 'Cust B' }, { name: 'Ali  Traders' }];
    assert.equal(canonicalName('cust b', known), 'Cust B');
    assert.equal(canonicalName('  CUST   B ', known), 'Cust B');
    assert.equal(canonicalName('ali traders', known), 'Ali Traders');
    assert.equal(canonicalName('New  Person', known), 'New Person');
    assert.equal(canonicalName('', known), '');
    assert.equal(canonicalName('x', null), 'x');
  });
});
