import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SALES = readFileSync(new URL('../modules/utilities-sales.js', import.meta.url), 'utf8');
const HTML = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('sale inventory notice placement', () => {
  const fn = SALES.slice(SALES.indexOf('export function createInventoryWarningElement'));
  const body = fn.slice(0, fn.indexOf('\nexport '));

  it('the sale save button sits inside the footer band, not directly in the card', () => {
    assert.match(HTML, /<div class="form-foot"><button class="btn btn-main" id="btn-save-cust-transaction"/);
  });

  it('inserts the notice next to the footer band instead of assuming the button is a direct child of the card', () => {
    assert.match(body, /closest\('\.form-foot'\)/);
    assert.doesNotMatch(body, /salesSection\.insertBefore\(/);
    assert.match(body, /anchor\.parentNode\.insertBefore\(warningDiv, anchor\)/);
  });
});

describe('camera screen colours', () => {
  const CSS = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
  const camRules = CSS.split('\n').filter(l => /^\s*\.cam-|^\s+(width: \d+px; height: \d+px; padding: 5px|min-width: 40px)/.test(l) || /^\.cam-/.test(l));
  it('uses fixed white (not the theme text colour) on the always-black camera screen', () => {
    const start = CSS.indexOf('.cam-modal {');
    const end = CSS.indexOf('@keyframes camFocus');
    assert.ok(start > 0 && end > start);
    assert.doesNotMatch(CSS.slice(start, end), /var\(--text-main\)/);
    assert.ok(camRules.length > 0);
  });
});
