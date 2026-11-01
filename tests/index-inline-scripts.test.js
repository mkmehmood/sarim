import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as acorn from 'acorn';
import { readSource } from './_extract.js';

describe('index.html inline scripts', () => {
  const html = readSource('index.html');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(m => !/\bsrc=/.test(m[1]) && !/type=["'](?:application\/(?:ld\+)?json|text\/template)/i.test(m[1]))
    .map(m => m[2])
    .filter(body => body.trim());

  it('has inline scripts to check', () => {
    assert.ok(scripts.length > 0);
  });

  scripts.forEach((body, i) => {
    it(`inline script #${i + 1} parses`, () => {
      assert.doesNotThrow(() => acorn.parse(body, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true }));
    });
  });
});
