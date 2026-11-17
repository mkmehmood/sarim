import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moduleFiles, readSource } from './helpers/source.js';

const read = (f) => readSource(f);
const files = ['index.html', ...moduleFiles()];
const css = read('app.css');

describe('shared bar and avatar', () => {
  it('legacy track and avatar classes are gone', () => {
    const re = /(?<![\w-])person-avatar-ring(?![\w-])/;
    for (const file of files) assert.ok(!re.test(read(file)), `${file} still uses person-avatar-ring`);
    assert.ok(!re.test(css), 'css still defines person-avatar-ring');
    assert.ok(!/\.cy-progress-track(?![\w-])/.test(css), 'css still has the dead .cy-progress-track class');
  });

  it('one .bar and one .avatar rule define the shared look', () => {
    assert.equal([...css.matchAll(/^\.bar \{/gm)].length, 1);
    assert.equal([...css.matchAll(/^\.avatar \{/gm)].length, 1);
  });

  it('track and photo variants carry the shared class', () => {
    const src = files.map(read).join('\n');
    for (const [cls, shared] of [['cm-meter', 'bar'], ['cx-leg-track', 'bar'], ['pf-photo', 'avatar']]) {
      for (const m of src.matchAll(/class=\\?"([^"\\]*)\\?"/g)) {
        const t = m[1].split(/\s+/);
        if (t.includes(cls)) assert.ok(t.includes(shared), `${cls} is missing ${shared}: ${m[1]}`);
      }
    }
    assert.ok(/id="cy-progress-track" class="bar"/.test(read('modules/admin-data.js')));
  });
});
