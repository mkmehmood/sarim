import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hcInnerHtml, hcCardHtml, hcMetricsHtml, hcChip, hcEmptyHtml } from '../modules/history-card.js';

describe('history card', () => {
  it('shows the title, amount and tag, and escapes the title', () => {
    const html = hcInnerHtml({ title: '<b>Ali</b>', amount: '500', tag: 'Cash', tone: 'good', icon: 'sale' });
    assert.ok(!html.includes('<b>'));
    assert.ok(html.includes('hc-amt'));
    assert.ok(html.includes('Cash'));
  });
  it('uses initials for a person and an icon otherwise', () => {
    assert.ok(hcInnerHtml({ avatar: 'Mahmood Khan', title: 'x' }).includes('MK'));
    assert.ok(hcInnerHtml({ icon: 'factory', title: 'x' }).includes('<svg'));
  });
  it('drops empty metrics and unknown value classes', () => {
    const html = hcMetricsHtml([{ label: 'A', value: '' }, { label: 'B', value: '1', cls: 'evil" onclick="x' }]);
    assert.ok(!html.includes('>A<'));
    assert.ok(!html.includes('onclick'));
  });
  it('keeps the .card hook and data attributes the filters rely on', () => {
    const html = hcCardHtml({ title: 'x', tone: 'bad' }, { attrs: { 'data-date': '2026-10-20', 'data-customer': 'ali' }, className: 'highlight-card' });
    assert.ok(/class="card hc-card is-bad highlight-card"/.test(html));
    assert.ok(html.includes('data-date="2026-10-20"') && html.includes('data-customer="ali"'));
  });
  it('renders chips and empty states', () => {
    assert.equal(hcChip(''), '');
    assert.ok(hcEmptyHtml('Nothing').includes('Nothing'));
  });
});

import { hcToggle } from '../modules/history-card.js';
describe('history card is small until tapped', () => {
  it('has a tappable header and keeps everything else in one body', () => {
    const html = hcInnerHtml({ title: 'x', amount: '1', chips: ['<span>c</span>'], metrics: [{ label: 'A', value: '1' }], actions: '<button>d</button>' });
    assert.match(html, /<div class="hc-head" role="button" tabindex="0" aria-expanded="false">/);
    const body = html.slice(html.indexOf('<div class="hc-body">'));
    assert.ok(body.includes('hc-metrics') && body.includes('hc-actions') && body.includes('hc-chips'));
    assert.ok(!html.slice(0, html.indexOf('<div class="hc-body">')).includes('hc-metrics'));
  });
  it('keeps sections collapsible and draws no icon for them', () => {
    const html = hcInnerHtml({ title: 'x', sections: [{ title: 'More', metrics: [{ label: 'A', value: '1' }] }] });
    assert.ok(html.includes('<details class="panel hc-more"><summary>More</summary>'));
    const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
    assert.ok(!/\.hc-more\s*>\s*summary::after/.test(css));
  });
  it('cards start closed and toggle flips state and aria', () => {
    assert.ok(!hcCardHtml({ title: 'x' }, { className: 'highlight-card' }).includes('is-open'));
    assert.ok(!hcCardHtml({ title: 'x' }).includes('is-open'));
    const head = { v: 'false', setAttribute(k, v) { this.v = v; } };
    const set = new Set();
    const card = { classList: { toggle: (c) => (set.has(c) ? (set.delete(c), false) : (set.add(c), true)) }, querySelector: () => head };
    hcToggle(card); assert.equal(head.v, 'true');
    hcToggle(card); assert.equal(head.v, 'false');
  });
});
