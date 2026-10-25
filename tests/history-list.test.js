import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const html = read('index.html');
const css = read('app.css');

const IDS = ['prodHistoryList', 'custHistoryList', 'factoryHistoryList', 'paymentHistoryList', 'historyList', 'repHistoryList',
  'expenseManagementHistoryList', 'entityManagementHistoryList', 'customerManagementHistoryList', 'repCustomerManagementHistoryList'];

describe('one shared gap between consecutive history cards', () => {
  it('every history list container uses .history-list', () => {
    for (const id of IDS) {
      const tag = html.match(new RegExp('<div\\b[^>]*\\bid="' + id + '"[^>]*>'));
      assert.ok(tag, id + ' exists');
      assert.match(tag[0], /class="(?:[^"]* )?history-list(?: [^"]*)?"/, id + ' carries history-list');
    }
  });

  it('the gap is declared once, as a small token', () => {
    const token = css.match(/--history-gap:\s*(\d+)px/);
    assert.ok(token && Number(token[1]) <= 8, 'gap token is 8px or less');
    assert.equal((css.match(/gap: var\(--history-gap\)/g) || []).length, 1);
    assert.ok(/\.history-list > \.card, \.hc-list > \.card \{ margin-bottom: 0; \}/.test(css), 'cards add no extra margin inside a list');
  });

  it('no per-id or per-card spacing rules remain', () => {
    assert.ok(!/#prodHistoryList, #custHistoryList/.test(css));
    assert.ok(!/\.factory-history-item:last-child/.test(css));
    const cust = css.match(/\.cust-history-item \{([^}]*)\}/)[1];
    assert.ok(!/margin-bottom/.test(cust));
  });
});
