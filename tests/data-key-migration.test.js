import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { migrateLegacyKeysInDb, DATA_KEYS_MIGRATION_ROW } from '../modules/data-key-migration.js';
import { LEGACY_SQLITE_KEYS, RECORD_STORES } from '../modules/data-keys.js';
let SQL;
before(async () => {
  const file = new URL('../sql-wasm.js', import.meta.url).pathname;
  const m = { exports: {} };
  new Function('module', 'exports', 'require', '__dirname', '__filename', readFileSync(file, 'utf8'))(m, m.exports, createRequire(file), '.', file);
  SQL = await m.exports({ locateFile: f => new URL('../' + f, import.meta.url).pathname });
});
function freshDb() {
  const db = new SQL.Database();
  db.run(`CREATE TABLE kv_store (full_key TEXT NOT NULL PRIMARY KEY, user_key TEXT NOT NULL, uid TEXT NOT NULL DEFAULT '',
    collection TEXT NOT NULL DEFAULT '', row_type TEXT NOT NULL DEFAULT 'config', encrypted INTEGER NOT NULL DEFAULT 0,
    value TEXT, ts INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0)`);
  return db;
}
function put(db, uid, key, value, ts = 1, collection = key) {
  db.run('INSERT INTO kv_store VALUES (?,?,?,?,?,?,?,?,?)', [`u_${uid}_${key}`, key, uid, collection, 'collection', 1, value, ts, ts]);
}
const rows = db => Object.fromEntries(db.exec('SELECT full_key, user_key, collection, value, ts, encrypted FROM kv_store ORDER BY full_key')[0].values
  .map(([fk, uk, col, v, ts, enc]) => [fk, { uk, col, v, ts, enc }]));
describe('one-time local key migration (real SQLite)', () => {
  it('renames every legacy key for every user, keeping value, timestamp and encryption flag', () => {
    const db = freshDb();
    for (const [old] of Object.entries(LEGACY_SQLITE_KEYS)) { put(db, 'alice', old, 'A:' + old, 10, 'x'); put(db, 'bob', old, 'B:' + old, 20, 'x'); }
    put(db, 'alice', 'expenses', 'E', 5);
    const r = migrateLegacyKeysInDb(db);
    const out = rows(db);
    for (const [old, nu] of Object.entries(LEGACY_SQLITE_KEYS)) {
      assert.equal(out[`u_alice_${nu}`].v, 'A:' + old);
      assert.equal(out[`u_bob_${nu}`].v, 'B:' + old);
      assert.equal(out[`u_bob_${nu}`].uk, nu);
      assert.equal(out[`u_bob_${nu}`].col, nu);
      assert.equal(out[`u_bob_${nu}`].ts, 20);
      assert.equal(out[`u_bob_${nu}`].enc, 1);
      assert.ok(!(`u_alice_${old}` in out));
    }
    assert.equal(out.u_alice_expenses.v, 'E');
    assert.equal(Object.keys(r.renamed).length, Object.keys(LEGACY_SQLITE_KEYS).length);
    assert.ok(DATA_KEYS_MIGRATION_ROW in out);
  });
  it('the calculator history and production saves land on the new names', () => {
    const db = freshDb();
    put(db, 'u', 'noman_history', 'calc'); put(db, 'u', 'mfg_pro_pkr', 'prod');
    migrateLegacyKeysInDb(db);
    const out = rows(db);
    assert.equal(out.u_u_calculator_history.v, 'calc');
    assert.equal(out.u_u_production.v, 'prod');
  });
  it('runs once: a second call is skipped', () => {
    const db = freshDb();
    put(db, 'u', 'customer_sales', 'x');
    assert.equal(migrateLegacyKeysInDb(db).skipped, false);
    assert.equal(migrateLegacyKeysInDb(db).skipped, true);
  });
  it('when both spellings exist for a user, the newer row wins and nothing is lost', () => {
    const db = freshDb();
    put(db, 'u', 'stock_returns', 'old-newer', 50); put(db, 'u', 'returns', 'new-older', 40);
    put(db, 'v', 'stock_returns', 'old-older', 30); put(db, 'v', 'returns', 'new-newer', 60);
    migrateLegacyKeysInDb(db);
    const out = rows(db);
    assert.equal(out.u_u_returns.v, 'old-newer');
    assert.equal(out.u_v_returns.v, 'new-newer');
    assert.ok(!('u_u_stock_returns' in out) && !('u_v_stock_returns' in out));
  });
  it('covers exactly the registry renames', () => {
    for (const s of RECORD_STORES) if (s.legacySqlite && s.legacySqlite !== s.key) assert.equal(LEGACY_SQLITE_KEYS[s.legacySqlite], s.key);
  });
  it('an empty database is fine', () => {
    assert.equal(migrateLegacyKeysInDb(freshDb()).skipped, false);
  });
});
