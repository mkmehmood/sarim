import globals from 'globals';

const appGlobals = {
  firebase: 'readonly',
  L: 'readonly',
  jspdf: 'readonly',
  initSqlJs: 'readonly',
  Capacitor: 'readonly',
  google: 'readonly',
  openStandaloneScreen: 'readonly',
  closeStandaloneScreen: 'readonly',
  showTab: 'readonly',
};

export const errorRules = {
  'no-undef': 'error',
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-dupe-args': 'error',
  'no-dupe-else-if': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-const-assign': 'error',
  'no-func-assign': 'error',
  'no-import-assign': 'error',
  'no-self-assign': 'error',
  'no-unsafe-finally': 'error',
  'no-unsafe-negation': 'error',
  'no-empty-pattern': 'error',
  'no-invalid-regexp': 'error',
  'no-loss-of-precision': 'error',
  'no-this-before-super': 'error',
  'no-sparse-arrays': 'error',
  'constructor-super': 'error',
  'getter-return': 'error',
  'require-yield': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'vendor/**', 'android/**', 'desktop/node_modules/**', 'desktop/app/**', 'desktop/release/**', 'sql.js', 'sql-wasm.js'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021, ...globals.serviceworker, ...globals.node, ...appGlobals },
    },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: { ...errorRules, 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] },
  },
  {
    files: ['desktop/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
  },
];
