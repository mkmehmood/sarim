import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import * as acorn from 'acorn';
import { compileScreen } from './screen-compile.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'screens');
let files = [];
try { files = readdirSync(dir).filter(f => f.endsWith('.screen.html')); } catch { files = []; }
const eslint = new ESLint({ cwd: root });
const problems = [];
for (const f of files) {
  const name = f.replace('.screen.html', '');
  const code = compileScreen(readFileSync(join(dir, f), 'utf8'), f);
  try { acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' }); } catch (e) { problems.push(`${f}: ${e.message}`); continue; }
  const [res] = await eslint.lintText(code, { filePath: join(root, 'modules', `${name}.screen.js`) });
  for (const m of res.messages) if (m.severity === 2) problems.push(`${f}:${m.line} ${m.ruleId || 'parse'} ${m.message}`);
}
if (problems.length) { console.error('✗ screen scripts failed lint:\n  - ' + problems.join('\n  - ')); process.exit(1); }
console.log(`✓ ${files.length} screen script(s) pass lint`);
