import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const db = new Map(Object.entries({
  production: [{ id: 'p1', formulaStore: 'f1', formulaUnits: 2 }, { id: 'p2', formulaId: 'f2', formulaUnits: 1 }, { id: 'p3', formulaStore: '', formulaUnits: 0 }],
  factory: [{ id: 'k1', store: 'zubair', formulaType: 'f1', units: 5 }, { id: 'k2', store: 'asaan', formulaId: 'f2', units: 3 }],
}));
const saves = [];
const sqliteStore = { init: async () => {}, get: async (k) => (db.has(k) ? structuredClone(db.get(k)) : null) };
mock.module('../modules/business.js', { namedExports: { sqliteStore, ensureArray: (v) => (Array.isArray(v) ? v : []), getTimestamp: () => 7 } });
mock.module('../modules/sync.js', { namedExports: { unifiedSave: async (k, list, _r, ids) => { saves.push([k, ids]); db.set(k, structuredClone(list)); } } });
mock.module('../modules/utilities-core.js', { namedExports: { triggerAutoSync() {} } });
mock.module('../modules/factory.js', { namedExports: { updateFormulaInventory: async () => {} } });

test('records carry formulaId and nothing else, and a second run changes nothing', async () => {
  const { runRecordFormulaIdMigration, planFormulaIdRename } = await import('../modules/record-formula-id-migration.js');
  assert.equal(await runRecordFormulaIdMigration(), true);
  assert.deepEqual(saves, [['production', ['p1', 'p3']], ['factory', ['k1']]]);
  assert.deepEqual(db.get('production').map((r) => [r.id, r.formulaId, 'formulaStore' in r]), [['p1', 'f1', false], ['p2', 'f2', false], ['p3', undefined, false]]);
  assert.deepEqual(db.get('factory').map((r) => [r.id, r.formulaId, 'formulaType' in r]), [['k1', 'f1', false], ['k2', 'f2', false]]);
  assert.equal(db.get('production')[0].updatedAt, 7);
  assert.equal(db.get('production')[1].updatedAt, undefined);
  saves.length = 0;
  assert.equal(await runRecordFormulaIdMigration(), false);
  assert.equal(saves.length, 0);
  assert.deepEqual(planFormulaIdRename(null, 'x', 1), { next: [], changed: [] });
  assert.deepEqual(planFormulaIdRename([null, 5, { id: 'a' }], 'x', 1).changed, []);
  assert.equal(planFormulaIdRename([{ id: 'b', x: 'keep', formulaId: 'new' }], 'x', 1).next[0].formulaId, 'new');
});
