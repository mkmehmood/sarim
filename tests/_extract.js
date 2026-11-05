import * as acorn from 'acorn';
import { readSource as readAppSource } from './helpers/source.js';

export function readSource(relPath) {
  return readAppSource(relPath);
}

export function extractFunctions(relPath, names, scope = {}) {
  const src = readSource(relPath);
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const found = new Map();
  for (const node of ast.body) {
    const decl = node.type === 'ExportNamedDeclaration' && node.declaration ? node.declaration : node;
    if (decl.type === 'FunctionDeclaration' && names.includes(decl.id.name)) found.set(decl.id.name, src.slice(decl.start, decl.end));
  }
  const missing = names.filter(n => !found.has(n));
  if (missing.length) throw new Error(`${relPath}: top-level function(s) not found: ${missing.join(', ')}`);
  const body = `${[...found.values()].join('\n')}\nreturn { ${names.join(', ')} };`;
  return new Function(...Object.keys(scope), body)(...Object.values(scope));
}
