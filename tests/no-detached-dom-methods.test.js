import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleFiles, readSource } from './helpers/source.js';

test('DOM methods are never pulled off their element before being called', () => {
  const bad = [];
  for (const file of moduleFiles()) {
    const src = readSource(file);
    src.split('\n').forEach((line, i) => {
      if (/\.(getAttribute|querySelector|querySelectorAll|getElementById|addEventListener|setAttribute)\s*\|\|/.test(line)) bad.push(`${file}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, [], 'Calling a detached DOM method throws "Illegal invocation"; call it on the element instead');
});
