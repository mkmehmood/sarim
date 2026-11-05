import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moduleFiles, readSource } from './helpers/source.js';

const files = moduleFiles();

describe('units are pooled by formula id, with no fixed slots', () => {
  for (const f of files) {
    it(`${f} has no standard/asaan pools, slot helpers or slots key`, () => {
      const src = readSource(f);
      assert.ok(!/SLOT_KEYS|deriveSlots|unitPoolKey|formulaTypeFor|getFormulaSlot|getStoredFormulaSlots|getStoreFormulaType|_formulaSlot|slotPool|FormulaPoolMigration|\bformulaStore\b|\bformulaType\b/.test(src), `${f} uses a slot helper`);
      assert.ok(!/\b(standard|asaan)\s*:\s*(\[|\{|\d)/.test(src), `${f} keys data by standard/asaan`);
      assert.ok(!/(\.|\[['"])(standard|asaan)\b/.test(src.replace(/BUILTIN_BADGE_CLASSES\.asaan/g, '')), `${f} reads a standard/asaan key`);
      assert.ok(!/['"`]slots(_timestamp)?['"`]/.test(src), `${f} reads the slots key`);
    });
  }
});
