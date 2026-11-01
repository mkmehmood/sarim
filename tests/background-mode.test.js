import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

describe('android background', () => {
  const manifest = read('../android/app/src/main/AndroidManifest.xml');
  it('declares the foreground service and its permissions', () => {
    assert.match(manifest, /android\.permission\.FOREGROUND_SERVICE"/);
    assert.match(manifest, /FOREGROUND_SERVICE_SPECIAL_USE/);
    assert.match(manifest, /REQUEST_IGNORE_BATTERY_OPTIMIZATIONS/);
    assert.match(manifest, /android:name="\.KeepAliveService"[\s\S]*?foregroundServiceType="specialUse"/);
    assert.match(manifest, /PROPERTY_SPECIAL_USE_FGS_SUBTYPE/);
  });
  it('registers the plugin and ships the notification icon', () => {
    assert.match(read('../android/app/src/main/java/com/gullzubair/sarim/MainActivity.java'), /registerPlugin\(BackgroundModePlugin\.class\)/);
    assert.match(read('../android/app/src/main/java/com/gullzubair/sarim/BackgroundModePlugin.java'), /@CapacitorPlugin\(name = "BackgroundMode"\)/);
    assert.match(read('../android/app/src/main/java/com/gullzubair/sarim/KeepAliveService.java'), /R\.drawable\.ic_stat_background/);
    assert.ok(read('../android/app/src/main/res/drawable/ic_stat_background.xml').includes('<vector'));
  });
});

describe('background settings buttons', () => {
  const mod = read('../modules/background-mode.js');
  it('are hidden unless the matching app is running', () => {
    assert.match(mod, /bg\.classList\.toggle\('d-none', !android\)/);
    assert.match(mod, /st\.classList\.toggle\('d-none', !desktop\)/);
  });
  it('defaults to on for Android and stays registered for caching and loading', () => {
    assert.match(mod, /\(await sqliteStore\.get\(KEY\)\) !== false/);
    assert.ok(read('../sw.js').includes("'./modules/background-mode.js'"));
    assert.ok(read('../modules/main.js').includes("import './background-mode.js';"));
  });
  it('is refreshed whenever Settings opens', () => {
    assert.match(read('../modules/settings-screen.js'), /syncBackgroundButtons\(\)/);
  });
});
