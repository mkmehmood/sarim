import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
import { readFileSync } from 'node:fs';
// Tests the real CryptoEngine from modules/business.js (extracted, since that file needs a browser).
const _src = readFileSync(new URL('../modules/business.js', import.meta.url), 'utf8');
const _start = _src.indexOf('export const CryptoEngine = (() => {');
const _end = _src.indexOf('\n})();', _start) + '\n})();'.length;
if (_start < 0 || _end < _start) throw new Error('CryptoEngine block not found in business.js');
const _real = new Function(_src.slice(_start, _end).replace('export const CryptoEngine =', 'return'))();
const CryptoEngine = {
  ..._real,
  encrypt: async (...args) => (await _real.encrypt(...args)).arrayBuffer(),
};
const MAGIC_V4 = new Uint8Array([0x47,0x5A,0x4E,0x44,0x5F,0x45,0x4E,0x43,0x5F,0x56,0x34]);
const SALT_LEN = 32;
const IV_LEN = 12;
const UID_HASH_LEN = 32;
const EMAIL    = 'dealer@example.com';
const PASSWORD = 'correct-horse-battery-staple';
const UID      = 'uid-abc-123';
const PAYLOAD  = { sales: [{ id: 'rec-1', amount: 5000 }], version: 4 };
describe('CryptoEngine', () => {
  describe('V4 round-trip', () => {
    it('decrypts to the original object', async () => {
      const buf    = await CryptoEngine.encrypt(PAYLOAD, EMAIL, PASSWORD, UID);
      const result = await CryptoEngine.decrypt(buf, EMAIL, PASSWORD, UID);
      assert.deepEqual(result, PAYLOAD);
    });
    it('produces different ciphertext on every call (random salt+iv)', async () => {
      const buf1 = await CryptoEngine.encrypt(PAYLOAD, EMAIL, PASSWORD, UID);
      const buf2 = await CryptoEngine.encrypt(PAYLOAD, EMAIL, PASSWORD, UID);
      assert.notDeepEqual(new Uint8Array(buf1), new Uint8Array(buf2));
    });
    it('round-trips empty object', async () => {
      const buf    = await CryptoEngine.encrypt({}, EMAIL, PASSWORD, UID);
      const result = await CryptoEngine.decrypt(buf, EMAIL, PASSWORD, UID);
      assert.deepEqual(result, {});
    });
    it('round-trips deeply nested payload', async () => {
      const deep = { a: { b: { c: { d: [1, 2, 3], e: 'nested' } } }, ts: 1700000000000 };
      const buf  = await CryptoEngine.encrypt(deep, EMAIL, PASSWORD, UID);
      assert.deepEqual(await CryptoEngine.decrypt(buf, EMAIL, PASSWORD, UID), deep);
    });
    it('treats email as case-insensitive', async () => {
      const buf    = await CryptoEngine.encrypt(PAYLOAD, 'DEALER@EXAMPLE.COM', PASSWORD, UID);
      const result = await CryptoEngine.decrypt(buf, 'dealer@example.com', PASSWORD, UID);
      assert.deepEqual(result, PAYLOAD);
    });
    it('strips leading/trailing whitespace from email', async () => {
      const buf    = await CryptoEngine.encrypt(PAYLOAD, '  dealer@example.com  ', PASSWORD, UID);
      const result = await CryptoEngine.decrypt(buf, 'dealer@example.com', PASSWORD, UID);
      assert.deepEqual(result, PAYLOAD);
    });
    it('output starts with V4 magic bytes', async () => {
      const buf   = await CryptoEngine.encrypt(PAYLOAD, EMAIL, PASSWORD, UID);
      const bytes = new Uint8Array(buf);
      const magic = bytes.slice(0, MAGIC_V4.length);
      assert.deepEqual(magic, MAGIC_V4);
    });
    it('output length is magic + uidHash + salt + iv + ciphertext', async () => {
      const buf  = await CryptoEngine.encrypt(PAYLOAD, EMAIL, PASSWORD, UID);
      const ct   = new TextEncoder().encode(JSON.stringify(PAYLOAD)).length + 16;
      const expected = MAGIC_V4.length + UID_HASH_LEN + SALT_LEN + IV_LEN + ct;
      assert.equal(new Uint8Array(buf).length, expected);
    });
  });
  describe('V4 error cases', () => {
    it('throws WRONG_CREDENTIALS on wrong password', async () => {
      const buf = await CryptoEngine.encrypt(PAYLOAD, EMAIL, PASSWORD, UID);
      await assert.rejects(
        () => CryptoEngine.decrypt(buf, EMAIL, 'wrong-password', UID),
        (e) => { assert.equal(e.message, 'WRONG_CREDENTIALS'); return true; }
      );
    });
    it('throws WRONG_ACCOUNT when UID does not match', async () => {
      const buf = await CryptoEngine.encrypt(PAYLOAD, EMAIL, PASSWORD, UID);
      await assert.rejects(
        () => CryptoEngine.decrypt(buf, EMAIL, PASSWORD, 'different-uid'),
        (e) => { assert.equal(e.message, 'WRONG_ACCOUNT'); return true; }
      );
    });
    it('throws INVALID_FORMAT on arbitrary bytes', async () => {
      const junk = new Uint8Array(128).fill(0xff).buffer;
      await assert.rejects(
        () => CryptoEngine.decrypt(junk, EMAIL, PASSWORD, UID),
        (e) => { assert.equal(e.message, 'INVALID_FORMAT'); return true; }
      );
    });
    it('throws INVALID_FORMAT on empty buffer', async () => {
      await assert.rejects(
        () => CryptoEngine.decrypt(new ArrayBuffer(0), EMAIL, PASSWORD, UID),
        (e) => { assert.equal(e.message, 'INVALID_FORMAT'); return true; }
      );
    });
    it('throws WRONG_CREDENTIALS on truncated ciphertext', async () => {
      const buf   = await CryptoEngine.encrypt(PAYLOAD, EMAIL, PASSWORD, UID);
      const bytes = new Uint8Array(buf);
      const truncated = bytes.slice(0, bytes.length - 10).buffer;
      await assert.rejects(
        () => CryptoEngine.decrypt(truncated, EMAIL, PASSWORD, UID),
        (e) => {
          assert.ok(
            e.message === 'WRONG_CREDENTIALS' || e.message === 'WRONG_ACCOUNT',
            `unexpected error: ${e.message}`
          );
          return true;
        }
      );
    });
    it('throws WRONG_CREDENTIALS on single flipped bit in ciphertext', async () => {
      const buf   = await CryptoEngine.encrypt(PAYLOAD, EMAIL, PASSWORD, UID);
      const bytes = new Uint8Array(buf.slice(0));
      bytes[bytes.length - 5] ^= 0x01;
      await assert.rejects(
        () => CryptoEngine.decrypt(bytes.buffer, EMAIL, PASSWORD, UID),
        (e) => { assert.equal(e.message, 'WRONG_CREDENTIALS'); return true; }
      );
    });
  });
  describe('UID fallback', () => {
    it('encrypts and decrypts with empty-string UID', async () => {
      const buf    = await CryptoEngine.encrypt(PAYLOAD, EMAIL, PASSWORD, '');
      const result = await CryptoEngine.decrypt(buf, EMAIL, PASSWORD, '');
      assert.deepEqual(result, PAYLOAD);
    });
    it('uid=null treated same as empty string', async () => {
      const buf    = await CryptoEngine.encrypt(PAYLOAD, EMAIL, PASSWORD, null);
      const result = await CryptoEngine.decrypt(buf, EMAIL, PASSWORD, null);
      assert.deepEqual(result, PAYLOAD);
    });
  });
});
