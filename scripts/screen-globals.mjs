import * as acorn from 'acorn';

const isFn = n => n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');

export function publishedGlobals(js) {
  const ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'module' });
  const kind = {};
  const note = (name, n) => { kind[name] = n; };
  for (const n of ast.body) {
    const d = n.type === 'ExportNamedDeclaration' ? n.declaration : n;
    if (!d) continue;
    if (d.type === 'FunctionDeclaration') note(d.id.name, 'function');
    else if (d.type === 'ClassDeclaration') note(d.id.name, 'class');
    else if (d.type === 'VariableDeclaration') for (const x of d.declarations) if (x.id.type === 'Identifier') note(x.id.name, isFn(x.init) ? 'function' : 'data');
  }
  const published = [];
  const add = (key, valueName, valueNode) => {
    if (valueNode && isFn(valueNode)) published.push({ key, fn: true });
    else if (valueName) published.push({ key, fn: kind[valueName] === 'function' });
    else published.push({ key, fn: false });
  };
  for (const n of ast.body) {
    if (n.type !== 'ExpressionStatement') continue;
    const e = n.expression;
    if (e.type === 'AssignmentExpression' && e.left.type === 'MemberExpression' && e.left.object.name === 'window' && !e.left.computed) {
      add(e.left.property.name, e.right.type === 'Identifier' ? e.right.name : null, e.right);
    } else if (e.type === 'CallExpression' && e.callee.type === 'MemberExpression' && e.callee.object.name === 'Object' && e.callee.property.name === 'assign' && e.arguments[0] && e.arguments[0].name === 'window' && e.arguments[1] && e.arguments[1].type === 'ObjectExpression') {
      for (const p of e.arguments[1].properties) {
        if (p.type !== 'Property' || p.computed) continue;
        const key = p.key.name || p.key.value;
        add(key, p.value.type === 'Identifier' ? p.value.name : null, p.value);
      }
    }
  }
  const functions = [...new Set(published.filter(x => x.fn).map(x => x.key))].sort();
  const data = [...new Set(published.filter(x => !x.fn).map(x => x.key))].sort();
  return { functions, data };
}
