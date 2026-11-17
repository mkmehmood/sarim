import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { smInnerHtml, smStatsHtml, smBarHtml, smProductionHtml, smCalcHtml } from '../modules/summary-card.js';

const fmt = { num: (n) => String(n), amt: (n) => `Rs ${n}`, safe: (n) => Number(n) || 0 };

describe('summary card', () => {
  it('shows a hero figure and skips empty stats', () => {
    const html = smInnerHtml({ title: 'T', hero: { label: 'Profit', value: 'Rs 5', tone: 'good' }, stats: [{ label: 'A', value: '' }, { label: 'B', value: '2' }] });
    assert.ok(html.includes('sm-hero is-good') && html.includes('Rs 5'));
    assert.ok(!html.includes('>A<') && html.includes('>B<'));
  });
  it('keeps sections collapsible, draws no icon for them and writes no inline layout styles', () => {
    const html = smProductionHtml({ name: 'S', production: 1, returns: 0, sold: 1, remaining: 0, formulaUnits: 1, formulaCost: 1, value: 1, profit: 1, soldBy: [['Ali', 1]] }, fmt)
      + smCalcHtml('D', { revenue: 1, creditVal: 1, collected: 0, received: 1, expected: 1, cash: 1, cred: 1 }, fmt)
      + smBarHtml([{ label: 'a', value: 1, tone: 'good' }, { label: 'b', value: 3, tone: 'warn' }]);
    assert.ok(html.includes('<details class="sm-more"><summary>Formula usage</summary>'));
    const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
    assert.ok(!/\.sm-more\s*>\s*summary::after/.test(css));
    assert.ok(!/style="(?!--)/.test(html));
  });
  it('drops unknown value classes and bars with no data', () => {
    assert.ok(!smStatsHtml([{ label: 'x', value: '1', cls: 'bad" onclick="y' }]).includes('onclick'));
    assert.equal(smBarHtml([{ label: 'a', value: 0 }]), '');
  });
  it('flags a cash shortage in the calculator card', () => {
    const html = smCalcHtml('D', { revenue: 1, creditVal: 0, collected: 0, received: 90, expected: 100 }, fmt);
    assert.ok(html.includes('Short Rs 10') && html.includes('is-bad'));
  });
});
