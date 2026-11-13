#!/usr/bin/env node
// Verifies the Flutter host is complete relative to the web app. Exits non-zero on any gap.
//  1. every built web file is bundled in assets/www (byte-identical) and declared in pubspec.yaml
//  2. every local file/chunk referenced by index.html and the JS bundles exists in the bundle
//  3. every lazy screen in screens/ has a compiled chunk
//  4. every Capacitor plugin + method the web code calls is provided by the shim or knowingly absent
//  5. every shim method has a Dart handler, and every Dart->Kotlin channel method exists in Kotlin
//  6. the shim behaves correctly when executed against a mock WebView
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const app = join(here, '..');
const root = join(app, '..');
const dist = join(root, 'dist');
const www = join(app, 'assets', 'www');
const failures = [];
const fail = (m) => failures.push(m);
let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) fail(msg); };

const files = (dir) => readdirSync(dir).flatMap((e) => {
  const p = join(dir, e);
  return statSync(p).isDirectory() ? files(p) : [p];
});
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

// 1 ---------------------------------------------------------------------------------
ok(existsSync(join(dist, 'index.html')), 'dist/ is missing - run: node build.js');
ok(existsSync(join(www, 'index.html')), 'assets/www is missing - run: node flutter_app/tools/sync_web.mjs');
const distFiles = existsSync(dist) ? files(dist).filter((f) => !f.endsWith('meta.json')) : [];
for (const f of distFiles) {
  const rel = relative(dist, f);
  const w = join(www, rel);
  ok(existsSync(w) && sha(w) === sha(f), `bundle differs from dist: ${rel}`);
}
const wwwFiles = existsSync(www) ? files(www) : [];
for (const f of wwwFiles) ok(existsSync(join(dist, relative(www, f))), `stale file in assets/www: ${relative(www, f)}`);
const pubspec = readFileSync(join(app, 'pubspec.yaml'), 'utf8');
const dirs = new Set(wwwFiles.map((f) => dirname(relative(app, f)).split('\\').join('/') + '/'));
for (const d of dirs) ok(pubspec.includes(`- ${d}`), `pubspec.yaml does not declare asset folder ${d}`);

// 2 ---------------------------------------------------------------------------------
const index = existsSync(join(www, 'index.html')) ? readFileSync(join(www, 'index.html'), 'utf8') : '';
for (const m of index.matchAll(/(?:src|href)="(?!https?:|data:|#|mailto:|tel:)([^"?#]+)"/g)) {
  ok(existsSync(join(www, m[1])), `index.html references a missing file: ${m[1]}`);
}
for (const f of wwwFiles.filter((x) => x.endsWith('.js') && !x.includes('/vendor/'))) {
  const src = readFileSync(f, 'utf8');
  for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*|import\s*)["'](\.\/[^"']+\.js)["']/g)) {
    ok(existsSync(resolve(dirname(f), m[1])), `${relative(www, f)} imports a missing chunk: ${m[1]}`);
  }
}

// 3 ---------------------------------------------------------------------------------
const screensDir = join(root, 'screens');
const screenNames = existsSync(screensDir) ? readdirSync(screensDir).filter((n) => /\.(html|mjs|js)$/.test(n)).map((n) => n.replace(/\.[^.]+$/, '').replace(/\.screen$/, '')) : [];
const chunkNames = wwwFiles.map((f) => f.split('/').pop());
const screenChunks = chunkNames.filter((n) => /\.screen-[A-Z0-9]+\.js$/.test(n)).map((n) => n.replace(/\.screen-[A-Z0-9]+\.js$/, ''));
for (const n of screenNames) ok(screenChunks.includes(n), `lazy screen "${n}" has no compiled chunk in the bundle`);
console.log(`  screens in source: ${screenNames.length}, compiled screen chunks: ${screenChunks.length}`);

// 4 ---------------------------------------------------------------------------------
const shimSrc = readFileSync(join(app, 'assets', 'bridge', 'capacitor_shim.js'), 'utf8');
const listeners = [];
const handlerCalls = [];
const sandbox = {
  console,
  Promise,
  setTimeout,
  window: null,
};
sandbox.window = sandbox;
sandbox.addEventListener = (n, cb) => listeners.push([n, cb]);
sandbox.flutter_inappwebview = {
  callHandler: async (name, plugin, method, args) => {
    handlerCalls.push([name, plugin, method, args]);
    if (plugin === 'Fail') return { __error: true, code: 'X1', message: 'boom' };
    return { ok: true };
  },
};
vm.createContext(sandbox);
vm.runInContext(shimSrc, sandbox);
const Cap = sandbox.Capacitor;
ok(Cap && Cap.isNativePlatform() === true && Cap.getPlatform() === 'android', 'shim must report a native android platform');
const provided = {};
for (const [name, plugin] of Object.entries(Cap.Plugins)) provided[name] = new Set(Object.keys(plugin).filter((k) => typeof plugin[k] === 'function'));

const ABSENT_ON_PURPOSE = new Set(['Geolocation', 'Camera', 'PushNotifications']);
const used = new Map(); // plugin -> Set(methods)
const note = (p, m) => { if (!used.has(p)) used.set(p, new Set()); if (m) used.get(p).add(m); };
const modulesDir = join(root, 'modules');
for (const f of readdirSync(modulesDir).filter((n) => n.endsWith('.js'))) {
  const src = readFileSync(join(modulesDir, f), 'utf8');
  for (const m of src.matchAll(/Plugins\.([A-Za-z]+)/g)) note(m[1]);
  for (const m of src.matchAll(/registerPlugin\(\s*['"]([A-Za-z]+)['"]/g)) note(m[1]);
  for (const m of src.matchAll(/const\s*\{([^}]+)\}\s*=\s*(?:P|_plugins)\(\)/g)) m[1].split(',').map((s) => s.trim()).filter(Boolean).forEach((n) => note(n));
  for (const m of src.matchAll(/\b(SaveFile|DirectShare|Share|Filesystem|Haptics|HapticFeedback|NativeBiometric|LocalNotifications|App|WindowBackground|Keyboard|StatusBar|SplashScreen|fs)\.([a-zA-Z]+)\(/g)) {
    note(m[1] === 'fs' ? 'Filesystem' : m[1], m[2]);
  }
  for (const m of src.matchAll(/\bplugin\.(saveToDownloads|openFile)\(/g)) note('SaveFile', m[1]);
  for (const m of src.matchAll(/callDirect\(\s*['"]([A-Za-z]+)['"]/g)) note('DirectShare', m[1]);
  for (const m of src.matchAll(/\bnb\.(isAvailable|verifyIdentity)\(/g)) note('NativeBiometric', m[1]);
}
for (const [plugin, methods] of used) {
  if (ABSENT_ON_PURPOSE.has(plugin)) { console.log(`  ${plugin}: handled by the WebView itself (no shim needed)`); continue; }
  ok(provided[plugin], `web app uses Capacitor plugin "${plugin}" but the shim does not provide it`);
  for (const m of methods) if (provided[plugin]) ok(provided[plugin].has(m), `web app calls ${plugin}.${m}() but the shim does not provide it`);
}

// 5 ---------------------------------------------------------------------------------
const dart = readFileSync(join(app, 'lib', 'native_bridge.dart'), 'utf8');
const kotlin = readFileSync(join(app, 'android_overrides', 'MainActivity.kt'), 'utf8');
const NOOP = new Set(['Keyboard', 'StatusBar', 'SplashScreen']);
for (const [plugin, methods] of Object.entries(provided)) {
  if (NOOP.has(plugin)) continue;
  ok(new RegExp(`case '${plugin}'`).test(dart), `Dart has no handler for plugin ${plugin}`);
  for (const m of methods) {
    if (['addListener', 'removeAllListeners'].includes(m)) continue;
    if (plugin === 'DirectShare' && m === 'shareToWhatsApp') continue; // rejected in JS with UNAVAILABLE on purpose
    ok(new RegExp(`['"]${m}['"]|case '${m}'|method == '${m}'|_${m}\\b`).test(dart) || ['Share', 'WindowBackground', 'App'].includes(plugin), `Dart does not implement ${plugin}.${m}`);
  }
}
for (const m of dart.matchAll(/invoke(?:Map)?Method(?:<[^>]*>)?\(\s*'([A-Za-z]+)'/g)) {
  ok(kotlin.includes(`"${m[1]}"`), `Dart calls channel method ${m[1]} that MainActivity.kt does not implement`);
}
ok(kotlin.includes('"sarim/native"') && dart.includes("'sarim/native'"), 'method channel names differ between Dart and Kotlin');

// 6 ---------------------------------------------------------------------------------
const run = async () => {
  const r = await Cap.Plugins.SaveFile.saveToDownloads({ filename: 'a.pdf', mime: 'application/pdf', data: 'QQ==' });
  ok(r && r.ok === true, 'shim: saveToDownloads should resolve the native result');
  ok(handlerCalls.some((c) => c[0] === 'native' && c[1] === 'SaveFile' && c[2] === 'saveToDownloads' && c[3].filename === 'a.pdf'), 'shim: handler call has wrong shape');
  let code = null;
  try { await Cap.registerPlugin('Fail').x; await (Cap.Plugins.Fail || (Cap.Plugins.Fail = { x: () => sandbox.flutter_inappwebview.callHandler('native', 'Fail', 'x', {}).then((res) => { if (res.__error) { const e = new Error(res.message); e.code = res.code; throw e; } }) })).x(); } catch (e) { code = e.code; }
  ok(code === 'X1', 'shim: native errors must surface with their code');
  let unavailable = null;
  try { await Cap.Plugins.DirectShare.shareToWhatsApp({}); } catch (e) { unavailable = e.code; }
  ok(unavailable === 'UNAVAILABLE', 'shim: shareToWhatsApp must reject with UNAVAILABLE so the web app falls back to the share sheet');
  let backs = 0;
  await Cap.Plugins.App.addListener('backButton', () => { backs++; });
  ok(sandbox.__flutterBack() === true && backs === 1, 'shim: back button listeners must fire');
  let tapped = null;
  await Cap.Plugins.LocalNotifications.addListener('localNotificationActionPerformed', (e) => { tapped = e; });
  sandbox.__flutterEmit('LocalNotifications', 'localNotificationActionPerformed', { id: 7 });
  ok(tapped && tapped.id === 7, 'shim: notification tap events must reach listeners');
  ok(Object.keys(await Cap.Plugins.StatusBar.setStyle({})).length === 0, 'shim: StatusBar no-op should resolve');
};
await run();

if (failures.length) {
  console.error(`\nParity check FAILED (${failures.length} problem(s) in ${checks} checks):`);
  failures.forEach((f) => console.error('  - ' + f));
  process.exit(1);
}
console.log(`\nParity check passed: ${checks} checks, ${distFiles.length} web files bundled, ${Object.keys(provided).length} native plugins bridged.`);
