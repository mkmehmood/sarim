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
    const clear = factory.slice(factory.indexOf('function _resetPurchaseFields'), factory.indexOf('export function hideFactoryMaterialResults'));
    assert.match(clear, /_setSelected\(null\)/);
    assert.match(clear, /_setPurchase\(null\)/);
    assert.match(clear, /factoryExistingSupplier/);
    assert.match(clear, /setFactorySupplierType\('none'\)/);
  });
  it('labels the save button Update Purchase while editing a purchase', () => {
    assert.match(factory, /'factorySaveMaterialBtn', 'Update Purchase'/);
  });
  it('has material search, purchase date, summary and an embedded purchase history', () => {
    for (const id of ['factory-material-search-results', 'factoryPurchaseDate', 'factoryPurchaseHistory', 'factoryMatCollected', 'factoryMatPending']) {
      assert.ok(screen.includes(`id="${id}"`), id);
    }
  });
  it('keeps supplier and pending amounts out of the inventory table rows', () => {
    const table = factory.slice(factory.indexOf('export async function renderFactoryInventory'), factory.indexOf('window.', factory.indexOf('export async function renderFactoryInventory')));
    assert.doesNotMatch(table, /supplierName|totalPayable|Owed/);
    assert.match(table, /collectedKg\(item\)/);
  });
});
