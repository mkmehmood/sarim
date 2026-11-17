import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('desktop background', () => {
  const main = read('../desktop/main.js');
  it('hides to the tray on close instead of quitting, unless the user quits', () => {
    assert.match(main, /win\.on\('close', \(e\) => \{\s*if \(quitting \|\| !trayAvailable\(\)\) return;\s*e\.preventDefault\(\);\s*win\.hide\(\);/);
    assert.match(main, /app\.on\('before-quit', \(\) => \{ quitting = true; \}\)/);
    assert.match(main, /label: 'Quit', click: \(\) => \{ quitting = true; app\.quit\(\); \}/);
  });
  it('keeps the hidden window at full speed and can start with the computer', () => {
    assert.match(main, /backgroundThrottling: false/);
    assert.match(main, /setLoginItemSettings\(\{ openAtLogin: !!on, args: on \? \['--hidden'\] : \[\] \}\)/);
    assert.match(main, /START_HIDDEN/);
  });
  it('exposes the start-with-computer switch to the page', () => {
    assert.match(read('../desktop/preload.js'), /__desktopStartup/);
    assert.match(main, /desktop:get-startup/);
    assert.match(main, /desktop:set-startup/);
  });
});

describe('android has no background service', () => {
  const manifest = read('../android/app/src/main/AndroidManifest.xml');
  it('declares no foreground service or battery-exemption permission', () => {
    assert.doesNotMatch(manifest, /FOREGROUND_SERVICE/);
    assert.doesNotMatch(manifest, /REQUEST_IGNORE_BATTERY_OPTIMIZATIONS/);
    assert.doesNotMatch(manifest, /KeepAliveService/);
  });
  it('ships no service or plugin code and keeps the push notification icon', () => {
    const dir = '../android/app/src/main/java/com/gullzubair/sarim/';
    assert.equal(existsSync(new URL(dir + 'KeepAliveService.java', import.meta.url)), false);
    assert.equal(existsSync(new URL(dir + 'BackgroundModePlugin.java', import.meta.url)), false);
    assert.doesNotMatch(read(dir + 'MainActivity.java'), /BackgroundModePlugin/);
    assert.match(manifest, /default_notification_icon"\s+android:resource="@drawable\/ic_stat_notification"/);
    assert.ok(read('../android/app/src/main/res/drawable/ic_stat_notification.xml').includes('<vector'));
  });
  it('has no Background button in Settings', () => {
    assert.equal(read('../index.html').includes('bg-mode-btn'), false);
    assert.equal(existsSync(new URL('../modules/background-mode.js', import.meta.url)), false);
  });
});

describe('start-with-computer button', () => {
  const mod = read('../modules/desktop-startup.js');
  it('is hidden unless the desktop app is running', () => {
    assert.match(mod, /st\.classList\.toggle\('d-none', !desktop\)/);
  });
  it('is loaded, cached and refreshed when Settings opens', () => {
    assert.ok(read('../sw.js').includes("'./modules/desktop-startup.js'"));
    assert.ok(read('../modules/main.js').includes("import './desktop-startup.js';"));
    assert.match(read('../modules/settings-screen.js'), /syncStartupButton\(\)/);
  });
});
