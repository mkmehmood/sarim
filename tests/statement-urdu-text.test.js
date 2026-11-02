import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readSource } from './_extract.js';
import { formatDayMonthYear } from '../modules/date-format.js';

const _src = readSource('modules/utilities-core.js');
const _from = _src.indexOf('function _stmtCellText');
const _to = _src.indexOf('export async function _shareStatementText');
const _buildStatementText = new Function('formatDayMonthYear', `${_src.slice(_from, _to).replace('export function _buildStatementText', 'function _buildStatementText')}\nreturn _buildStatementText;`)(formatDayMonthYear);

describe('Urdu statement text has no English words left in the row details', () => {
  const tables = [{
    head: [['Date', 'Type', 'Details', 'Debit (Sale)', 'Credit (Rcvd)', 'Balance']],
    body: [
      ['03 OCT 2026', 'COLLECTION', 'Payment 20,000', '-', '20,000', '1,02,832'],
      ['31 OCT 2026', 'COLLECTION', 'Expired credit 21.4 kg @320 = 6,848', '-', '6,848', '1,13,534'],
      ['02 NOV 2026', 'CREDIT\n(PAID)', '25 kg \u00d7 320\nSettled by collection', '8,000', '-', '1,13,534']
    ]
  }];
  const text = _buildStatementText({ title: 'Customer Account Statement', name: '\u0646\u0648\u0631', phone: '', rangeName: '03 OCT 2026 \u2013 02 NOV 2026', tables });
  it('translates months, payment, expired credit and settled labels', () => {
    assert.match(text, /اکتوبر/);
    assert.match(text, /نومبر/);
    assert.match(text, /ادائیگی/);
    assert.match(text, /ایکسپائرڈ کریڈٹ/);
    assert.match(text, /وصولی سے ادا/);
    assert.doesNotMatch(text.replace(/[\u2066\u2069\u200F]/g, ''), /[A-Za-z]{2,}/);
  });
  it('shows the expired amount like a credit sale', () => {
    assert.match(text, /6,848/);
    assert.match(text, /@320 = /);
  });
});
