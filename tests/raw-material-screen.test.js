import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const factory = readFileSync(new URL('../modules/factory.js', import.meta.url), 'utf8');
const screen = html.slice(html.indexOf('id="raw-material-screen"'), html.indexOf('id="formula-store-screen"'));

describe('raw material screen', () => {
  it('keeps every field id the save, edit and search code reads', () => {
    for (const id of ['factoryMaterialName', 'factoryMaterialUnitName', 'factoryMaterialQuantity', 'factoryMaterialConversionFactor',
      'factoryMaterialCost', 'factoryCalculatedKg', 'factoryCalculatedAmount', 'factoryMaterialSupplierType', 'existingSupplierSection',
      'newSupplierSection', 'factoryExistingSupplier', 'factory-supplier-search-results', 'factorySupplierName', 'factorySupplierPhone',
      'factorySupplierAutoEntity', 'deleteFactoryInventoryBtn', 'factoryInventoryModalTitle']) {
      assert.ok(screen.includes(`id="${id}"`), id);
    }
  });
  it('has one segmented option per supplier type and wires it to setFactorySupplierType', () => {
    for (const t of ['none', 'existing', 'new']) assert.ok(screen.includes(`setFactorySupplierType('${t}')`), t);
    assert.match(factory, /export function setFactorySupplierType/);
    assert.match(factory, /window\.setFactorySupplierType = setFactorySupplierType/);
  });
  it('resets the editing id and supplier fields when the form is cleared, so an add never overwrites an earlier edit', () => {
    const clear = factory.slice(factory.indexOf('export function clearFactoryInventoryForm'), factory.indexOf('export async function editFactoryInventoryItem'));
    assert.match(clear, /editingFactoryInventoryId = null/);
    assert.match(clear, /factoryExistingSupplier/);
    assert.match(clear, /setFactorySupplierType\('none'\)/);
  });
  it('labels the save button Update Material while editing', () => {
    assert.match(factory, /textContent = 'Update Material'/);
  });
});
