import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rlInitials, rlHue, rlJsArg, rlRowHtml, rlEmptyHtml, rlPhoto } from '../modules/record-list.js';

describe('record list rows', () => {
  it('builds initials from the first and last word', () => {
    assert.equal(rlInitials('ahmed khan'), 'AK');
    assert.equal(rlInitials('Gull'), 'G');
    assert.equal(rlInitials('  '), '?');
  });
  it('gives the same name the same colour every time', () => {
    assert.equal(rlHue('Ahmed Khan'), rlHue('Ahmed Khan'));
  });
  it('escapes names and quotes so a row cannot break out of its attribute', () => {
    const html = rlRowHtml({ name: `O'Neil <b>`, tone: 'debt', amount: '10', tag: 'Owes', onOpen: `openCustomerManagement('${rlJsArg(`O'Neil "x"`)}')` });
    assert.ok(!html.includes('<b>'));
    assert.ok(html.includes('is-debt'));
    assert.ok(html.includes('role="button"'));
    assert.ok(!/onclick="[^"]*"x/.test(html.replace(/&quot;/g, '')));
  });
  it('omits the avatar when asked and is not clickable without an action', () => {
    const html = rlRowHtml({ name: 'Soda', avatar: 'none', amount: '1' });
    assert.ok(!html.includes('rl-av'));
    assert.ok(!html.includes('onclick'));
  });
  it('renders an empty state with a title and hint', () => {
    assert.ok(rlEmptyHtml('Nothing here', 'Add one').includes('Add one'));
  });
});

describe('record list photos', () => {
  it('shows a stored photo over the initials and falls back if it fails', () => {
    const html = rlRowHtml({ name: 'Mahmood Khan', photo: 'data:image/jpeg;base64,AAAA', amount: '1' });
    assert.ok(html.includes('has-photo'));
    assert.ok(html.includes('<img src="data:image/jpeg;base64,AAAA"'));
    assert.ok(html.includes('MK'));
    assert.ok(html.includes('onerror'));
  });
  it('ignores values that are not image data URLs', () => {
    assert.ok(!rlRowHtml({ name: 'Ali', photo: 'javascript:alert(1)', amount: '1' }).includes('<img'));
    assert.equal(rlPhoto({ k: 'http://x/y.png' }, 'k'), '');
    assert.equal(rlPhoto({ k: 'data:image/png;base64,AA' }, 'k'), 'data:image/png;base64,AA');
  });
});
