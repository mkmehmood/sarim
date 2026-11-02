import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { typeOf, filterGroups, typeChips, personChips, heroModel, groupPending } from '../modules/approvals-core.js';
import { heroHtml, typeChipsHtml, personChipsHtml } from '../modules/approvals-ledger.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const mk = (id, collection, name, data = {}, extra = {}) => ({
  id: `${collection}__${id}`, collection, docId: id, action: 'set', isEdit: false, status: 'pending',
  data: { id, ...data }, submittedBy: { uid: name, name }, submittedAt: { seconds: 1700000000 }, ...extra,
});
const items = [
  mk('s1', 'rep', 'Sara', { salesRep: 'Sara', customerName: 'Ali', amount: 500 }),
  mk('s2', 'sales', 'Imran', { customerName: 'Zubair Traders', amount: 900 }),
  mk('t1', 'transactions', 'Sara', { customerName: 'Ali', amount: 200 }),
  mk('e1', 'expenses', 'Sara', { amount: 50 }),
];
const groups = groupPending(items);

describe('typeOf', () => {
  it('maps collections to the filter buckets', () => {
    assert.equal(typeOf('rep'), 'sales');
    assert.equal(typeOf('sales'), 'sales');
    assert.equal(typeOf('transactions'), 'payments');
    assert.equal(typeOf('expenses'), 'expenses');
    assert.equal(typeOf('inventory'), 'stock');
    assert.equal(typeOf('clients'), 'customers');
    assert.equal(typeOf('calculator'), 'other');
  });
});

describe('chips and hero model', () => {
  it('counts waiting items per type, in a fixed order, with All first', () => {
    const chips = typeChips(groups);
    assert.deepEqual(chips.map(c => `${c.key}:${c.count}`), ['all:4', 'sales:2', 'payments:1', 'expenses:1']);
  });
  it('lists people only when more than one person submitted', () => {
    assert.equal(personChips(groupPending([items[0], items[2]])).length, 0);
    const people = personChips(groups);
    assert.deepEqual(people.map(p => `${p.name}:${p.count}:${p.initial}`).sort(), ['Imran:1:I', 'Sara:3:S']);
  });
  it('summarises the waiting items for the card', () => {
    const h = heroModel(groups);
    assert.equal(h.count, 4);
    assert.equal(h.records, 4);
    assert.match(h.subtitle, /^From /);
    assert.equal(heroModel([]).subtitle, 'Nothing needs your approval right now.');
  });
});

describe('filterGroups', () => {
  const ctx = {};
  it('filters by type and by person', () => {
    assert.equal(filterGroups(groups, { type: 'sales' }, ctx).length, 2);
    assert.equal(filterGroups(groups, { person: 'Imran' }, ctx).length, 1);
    assert.equal(filterGroups(groups, { type: 'sales', person: 'Sara' }, ctx).length, 1);
    assert.equal(filterGroups(groups, { type: 'all', person: 'all', q: '' }, ctx).length, 4);
  });
  it('searches name, item, amount and submitter, ignoring case', () => {
    assert.equal(filterGroups(groups, { q: 'zubair' }, ctx).length, 1);
    assert.equal(filterGroups(groups, { q: 'IMRAN' }, ctx).length, 1);
    assert.equal(filterGroups(groups, { q: 'nomatchhere' }, ctx).length, 0);
  });
});

describe('header markup', () => {
  it('shows the count, or an all-caught-up card, or a loading card', () => {
    assert.match(heroHtml({ count: 3, subtitle: 'From Sara' }), /apv-hero-count">3<\/div>[\s\S]*waiting for approval/);
    assert.match(heroHtml({ count: 0, subtitle: 'Nothing needs your approval right now.' }), /is-clear[\s\S]*All caught up/);
    assert.match(heroHtml({ count: 0, loading: true }), /Loading approvals…/);
  });
  it('escapes names and marks the active chip', () => {
    const html = personChipsHtml([{ name: '<b>x</b>', initial: 'X', count: 2 }], '<b>x</b>');
    assert.ok(!html.includes('<b>x</b> <b>'));
    assert.match(html, /is-active/);
    assert.equal(typeChipsHtml([{ key: 'all', label: 'All', count: 1 }, { key: 'sales', label: 'Sales', count: 1 }], 'all'), '');
    assert.match(typeChipsHtml(typeChips(groups), 'sales'), /apv-chip is-active" data-key="sales"/);
  });
});

describe('screen wiring', () => {
  const ui = read('../modules/approvals.js');
  const html = read('../index.html');
  it('has the new header elements and no old summary line', () => {
    for (const id of ['approvals-hero', 'approvals-search', 'approvals-types', 'approvals-people', 'approvals-list']) {
      assert.ok(html.includes(`id="${id}"`), id);
    }
    assert.equal(html.includes('approvals-summary'), false);
    assert.match(html, /oninput="setApprovalSearch\(this\.value\)"/);
  });
  it('resets a filter whose chip disappeared, so the list never gets stuck empty', () => {
    assert.match(ui, /if \(!types\.some\(c => c\.key === _filter\.type\)\) _filter\.type = 'all';/);
    assert.match(ui, /if \(!people\.some\(c => c\.name === _filter\.person\)\) _filter\.person = 'all';/);
  });
  it('exposes the handlers the chips and search call', () => {
    assert.match(ui, /window\.setApprovalType = setApprovalType;/);
    assert.match(ui, /window\.setApprovalPerson = setApprovalPerson;/);
    assert.match(ui, /window\.setApprovalSearch = setApprovalSearch;/);
  });
  it('ships the styles', () => {
    const css = read('../app.css');
    for (const c of ['.apv-body', '.apv-hero', '.apv-chip', '.apv-chip.is-active', '.apv-avatar', '.apv-search']) assert.ok(css.includes(c), c);
  });
});
