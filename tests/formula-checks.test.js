import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formulaFormIssue } from '../modules/formula-checks.js';

const ok = [{ label: 'TAMAN', matId: 'm1', qty: '5' }, { label: 'CALCIUM', matId: 'm2', qty: '2' }];
const base = { rows: ok };

describe('formula editor checks', () => {
  it('accepts a good formula and ignores fully blank rows', () => {
    assert.equal(formulaFormIssue(base), '');
    assert.equal(formulaFormIssue({ ...base, rows: [...ok, { label: '', qty: '' }] }), '');
  });
  it('rejects a typed ingredient that was never picked from the list', () => {
    assert.match(formulaFormIssue({ ...base, rows: [...ok, { label: 'Taman2', matId: '', qty: '3' }] }), /Pick "Taman2"/);
  });
  it('rejects a missing or zero quantity instead of silently dropping the row', () => {
    assert.match(formulaFormIssue({ ...base, rows: [{ label: 'TAMAN', matId: 'm1', qty: '' }] }), /Enter a quantity/);
    assert.match(formulaFormIssue({ ...base, rows: [{ label: 'TAMAN', matId: 'm1', qty: '0' }] }), /Enter a quantity/);
    assert.match(formulaFormIssue({ ...base, rows: [{ label: '', matId: '', qty: '4' }] }), /no ingredient/);
  });
  it('rejects the same material twice and linked formulas twice', () => {
    assert.match(formulaFormIssue({ ...base, rows: [...ok, { label: 'TAMAN', matId: 'm1', qty: '1' }] }), /listed twice/);
    const links = [{ label: 'Mix A', formulaId: 'f9', qty: '1' }, { label: 'Mix A', formulaId: 'f9', qty: '2' }];
    assert.match(formulaFormIssue({ ...base, rows: links }), /listed twice/);
  });
});
