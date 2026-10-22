import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transferPrompt, modeBalance } from '../modules/ledger-core.js';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mod = readFileSync(new URL('../modules/daily-ledger.js', import.meta.url), 'utf8');
const pay = readFileSync(new URL('../modules/utilities-payments.js', import.meta.url), 'utf8');
const block = html.slice(html.indexOf('id="daily-ledger-screen"'), html.indexOf('id="raw-material-screen"'));
const fmt = (n) => String(n);
const row = (o) => ({ id: o.id, type: 'IN', amount: 0, mode: 'Cash', toMode: '', category: '', scope: '', party: '', note: '', ref: '', date: '2026-01-01', timestamp: 1, ...o });
describe('daily ledger screen controls', () => {
  it('has no scope buttons, swap button, history toggles or suggestion chips', () => {
    for (const gone of ['data-dl-scope', 'dl-scope-wrap', 'id="dl-category"', 'Swap Channels', 'data-dl-tf', 'data-dl-mf', 'Copy Full Audit Log', 'dailyLedgerCopyAudit', '-chips']) assert.equal(block.includes(gone), false, gone);
    assert.equal(mod.includes('dl-pick-chip'), false);
  });
  it('mode, destination and party fields use the app universal search', () => {
    assert.ok(block.includes("handleUniversalSearch('dl-mode','dl-mode-results','ledger-mode')"));
    assert.ok(block.includes("handleUniversalSearch('dl-to-mode','dl-to-results','ledger-mode')"));
    assert.ok(block.includes("handleUniversalSearch('dl-party','dl-party-results','ledger-party')"));
  });
  it('entries expand inline with Copy Voucher, Edit and Delete', () => {
    assert.ok(mod.includes('<details class="dl-details">'));
    for (const a of ['Copy Voucher', 'dailyLedgerEdit', 'dailyLedgerDelete']) assert.ok(mod.includes(a), a);
    assert.equal(mod.includes('dailyLedgerOpenDetail'), false);
  });
});
describe('category dialog uses universal search and click', () => {
  it('the dialog has a searchable input with a results list and no chip grid', () => {
    assert.match(mod, /handleUniversalSearch\('dl-dlg-new','dl-dlg-results','ledger-category'\)/);
    assert.match(mod, /label: 'Save Entry', variant: 'solid', value: null, guard/);
  });
  it('universal search knows the ledger sources and reports picks back', () => {
    assert.match(pay, /case 'ledger-category':/);
    assert.match(pay, /window\.dailyLedgerSearchItems/);
    assert.match(pay, /type === 'ledger' && typeof window\.dailyLedgerOnPick/);
    assert.match(pay, /\{ input: 'dl-dlg-new', results: 'dl-dlg-results' \}/);
  });
  it('save opens the category dialog for in and out but not transfers', () => {
    assert.match(mod, /if \(state\.type !== 'TRANSFER'\) \{\s*const picked = await pickCategoryDialog/);
  });
});
describe('transfer warning dialog', () => {
  it('save routes transfers through a warning-tone confirm', () => {
    assert.match(mod, /showGlassConfirm\(prompt\.message, \{ title: prompt\.title, confirmText: prev \? 'Update Transfer' : 'Transfer', tone: 'warning' \}\)/);
  });
  it('a covered transfer gets the plain confirm title', () => {
    const rows = [row({ id: 'a', type: 'IN', amount: 500, mode: 'Cash' })];
    const p = transferPrompt(rows, { amount: 200, mode: 'cash', toMode: 'Bank Transfer' }, fmt);
    assert.equal(p.insufficient, false);
    assert.equal(p.title, 'Confirm Transfer');
    assert.match(p.message, /Transfer 200 from cash ➔ Bank Transfer\?/);
    assert.equal(p.after, 300);
  });
  it('an overdrawn source channel is flagged with the resulting balance', () => {
    const rows = [row({ id: 'a', type: 'IN', amount: 100, mode: 'Easypaisa' })];
    const p = transferPrompt(rows, { amount: 250, mode: 'Easypaisa', toMode: 'Cash' }, fmt);
    assert.equal(p.insufficient, true);
    assert.equal(p.title, 'Insufficient Channel Balance');
    assert.match(p.message, /Warning: Easypaisa balance is 100\. This transfer will leave it at -150\./);
  });
  it('modeBalance matches the channel case-insensitively and defaults to zero', () => {
    const rows = [row({ id: 'a', type: 'IN', amount: 40, mode: 'Cash' })];
    assert.equal(modeBalance(rows, 'CASH'), 40);
    assert.equal(modeBalance(rows, 'JazzCash'), 0);
  });
});
