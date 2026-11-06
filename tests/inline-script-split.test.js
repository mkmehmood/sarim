import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { snapshot } from '../scripts/split-manifest.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n');
const published = new Set(snapshot().js.windowAssignments);

const overwrittenByModules = ['openDataMenu', 'closeDataMenu', 'openRecycleBin', 'closeRecycleBin', 'openEntityManagement', 'closeEntityManagement', 'openFactoryInventoryModal', 'closeFactoryInventoryModal'];
const movedToModules = ['openStoreManagerScreen', 'renderStoreList', 'resetStoreForm', 'editStore', 'deleteStore', 'saveStoreFromForm', 'prepareAddEntityScreen', 'prepareRawMaterialScreen', 'loadDbStructureScreen'];

test('names that modules publish are not also defined by an inline script that they would overwrite', () => {
  for (const n of overwrittenByModules) {
    assert.ok(published.has(n), `${n} must be published by a module`);
    assert.ok(!new RegExp(`window\\.${n}\\s*=`).test(inline), `${n} must not be assigned inline`);
  }
});

test('code moved out of index.html is published by modules and gone from the inline script', () => {
  for (const n of movedToModules) {
    assert.ok(published.has(n), `${n} must be published by a module`);
    assert.ok(!new RegExp(`function ${n}\\b|window\\.${n}\\s*=`).test(inline), `${n} must not be defined inline`);
  }
});

test('the inline navigation script keeps what must exist before modules load', () => {
  for (const n of ['openSidebar', 'closeSidebar', 'openStandaloneScreen', 'closeStandaloneScreen', 'sidebarNav']) {
    assert.ok(new RegExp(`window\\.${n}\\s*=`).test(inline), `${n} must stay inline`);
  }
});

test('each moved module publishes its globals as soon as it is evaluated', async () => {
  globalThis.window = globalThis.window || globalThis;
  const expected = {
    'store-manager': ['openStoreManagerScreen', 'renderStoreList', 'resetStoreForm', 'editStore', 'deleteStore', 'saveStoreFromForm'],
    'add-entity': ['prepareAddEntityScreen'],
    'raw-material': ['prepareRawMaterialScreen'],
  };
  for (const [mod, names] of Object.entries(expected)) {
    await import(`../modules/${mod}.js`);
    for (const n of names) assert.equal(typeof window[n], 'function', `${mod}: window.${n}`);
  }
});
