import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toInternationalDigits } from '../modules/phone-format.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('direct WhatsApp / messages sharing', () => {
  it('turns local numbers into international digits', () => {
    assert.equal(toInternationalDigits('0300 1234567'), '923001234567');
    assert.equal(toInternationalDigits('+92 300-1234567'), '923001234567');
    assert.equal(toInternationalDigits('0092 300 1234567'), '923001234567');
    assert.equal(toInternationalDigits('3001234567'), '923001234567');
    assert.equal(toInternationalDigits('44 7700 900123'), '447700900123');
  });

  it('gives nothing for missing or unusable numbers', () => {
    assert.equal(toInternationalDigits(''), '');
    assert.equal(toInternationalDigits(null), '');
    assert.equal(toInternationalDigits('abc'), '');
    assert.equal(toInternationalDigits('12'), '');
  });

  it('the Android plugin is registered, can see WhatsApp and messages apps, and uses the file provider', () => {
    assert.match(read('android/app/src/main/java/com/gullzubair/sarim/MainActivity.java'), /registerPlugin\(DirectSharePlugin\.class\)/);
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    assert.match(manifest, /<queries>[\s\S]*com\.whatsapp[\s\S]*smsto[\s\S]*<\/queries>/);
    const java = read('android/app/src/main/java/com/gullzubair/sarim/DirectSharePlugin.java');
    assert.match(java, /@CapacitorPlugin\(name = "DirectShare"\)/);
    assert.match(java, /public void shareToWhatsApp/);
    assert.match(java, /public void sendText/);
    assert.match(java, /public void openChat/);
    assert.match(java, /whatsapp:\/\/send\?phone=/);
    assert.match(java, /ACTION_SEND_MULTIPLE/);
    assert.match(java, /@s\.whatsapp\.net/);
    assert.match(java, /\.fileprovider/);
  });

  it('pictures and PDFs go to WhatsApp, text goes to messages, everything else keeps the share sheet', () => {
    const src = read('modules/native.js');
    assert.match(src, /callDirect\('shareToWhatsApp'/);
    assert.match(src, /callDirect\('sendText'/);
    assert.match(src, /if \(data\.text && !data\.url\) return nativeShareText/);
    assert.match(src, /return systemShareFiles\(list, opts\)/);
    assert.match(src, /await systemShareFiles\(\[new File/, 'a failed save still falls back to the plain share sheet');
  });

  it('the invoice sheet has one share button and hands the customer number to the bridge', () => {
    const src = read('modules/cm-ledger.js');
    assert.doesNotMatch(src, /sendVia|nativeDirectShare/);
    assert.match(src, /phone: phone \|\| ''/);
    const core = read('modules/utilities-core.js');
    assert.match(core, /title: 'Account Statement', phone:/);
    assert.match(core, /title: 'اکاؤنٹ اسٹیٹمنٹ', phone:/);
  });

  it('phone numbers dial on tap and open WhatsApp on hold', () => {
    const pay = read('modules/utilities-payments.js');
    assert.match(pay, /class="u-0d9dbdd phone-link"/);
    assert.match(pay, /data-wa=/);
    assert.doesNotMatch(pay, /oncontextmenu=\\?"event\.preventDefault\(\);window\.open\('https:\/\/wa\.me/);
    const act = read('modules/phone-actions.js');
    assert.match(act, /HOLD_MS = 500/);
    assert.match(act, /contextmenu/);
    assert.match(act, /nativeOpenWhatsAppChat/);
    assert.match(read('modules/native.js'), /callDirect\('openChat'/);
    assert.ok(read('modules/main.js').includes("import './phone-actions.js'"));
    assert.ok(read('sw.js').includes("'./modules/phone-actions.js'"));
  });
});
