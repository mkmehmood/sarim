import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';

const UNUSED_VARIABLE_BUDGET = 217;
const cwd = fileURLToPath(new URL('../', import.meta.url));

describe('static analysis', () => {
  it('has no undefined names, redeclarations or other ESLint errors, and no new unused variables', { timeout: 120000 }, async () => {
    const eslint = new ESLint({ cwd });
    const results = await eslint.lintFiles(['modules', 'scripts', 'tests', 'sw.js', 'build.js', 'build-key.js', 'desktop/main.js', 'desktop/preload.js', 'eslint.config.js']);
    const errors = [];
    let unused = 0;
    for (const r of results) {
      for (const m of r.messages) {
        if (m.severity === 2) errors.push(`${r.filePath.replace(cwd, '')}:${m.line} ${m.ruleId || 'parse'} ${m.message}`);
        else if (m.ruleId === 'no-unused-vars') unused++;
      }
    }
    assert.deepEqual(errors, [], `ESLint errors:\n${errors.join('\n')}`);
    assert.ok(unused <= UNUSED_VARIABLE_BUDGET, `${unused} unused variables (budget ${UNUSED_VARIABLE_BUDGET}). Remove the unused code you added; lower the budget when you clean up.`);
  });
});
