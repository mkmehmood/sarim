import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const html = read('../index.html');
const sideStart = html.indexOf('<div id="sidebar-settings-section">');
const sidebar = html.slice(sideStart, html.indexOf('</div>\n  </div>', sideStart) > 0 ? html.indexOf('id="settings-screen"') : sideStart + 9000);
const settingsStart = html.indexOf('id="settings-screen"');
const settings = html.slice(settingsStart, html.indexOf('id="store-manager-screen"'));
const labelOf = (block) => Array.from(block.matchAll(/<button\b[\s\S]*?<\/button>/g)).map((m) => {
  const g = m[0];
  return g.slice(g.indexOf('</svg>') + 6, -9).replace(/<[^>]+>/g, '').trim().replace(/&amp;/g, '&');
});
describe('sidebar arrangement', () => {
  const section = html.slice(sideStart, html.indexOf('id="sidebar-btn-settings"') + 2000);
  it('daily work and records stay in the sidebar', () => {
    const w = section.slice(section.indexOf('id="sidebar-label-work"'), section.indexOf('id="sidebar-label-records"'));
    assert.deepEqual(labelOf(w), ['Daily Ledger', 'Stock Transfer', 'Payment Transfer']);
    const r = section.slice(section.indexOf('id="sidebar-label-records"'), section.indexOf('class="sidebar-footer"'));
    assert.deepEqual(labelOf(r), ['Add Entity', 'Add Raw Materials', 'Formula Store']);
  });
  it('ends with a Settings button and Logout', () => {
    assert.match(section, /id="sidebar-btn-settings"[^>]*openStandaloneScreen\('settings-screen'\)/);
    assert.ok(section.indexOf('Settings') < section.indexOf('_showLogoutConfirmDialog'));
  });
  it('moved items are gone from the sidebar section', () => {
    const own = html.slice(sideStart, html.indexOf('_showLogoutConfirmDialog', sideStart));
    for (const id of ['sidebar-btn-sync', 'sidebar-btn-recycle', 'sidebar-btn-theme', 'bio-toggle-btn', 'sidebar-btn-stores', 'backup-restore-screen', 'device-display-screen', 'feedback-screen', 'user-roles-screen', 'app-accounts-screen', 'sales-rep-screen', 'db-structure-screen']) assert.equal(own.includes(id), false, id);
  });
  it('non-admin gating now only keeps the Settings button visible', () => {
    assert.ok(html.includes("var alwaysVisibleIds = new Set(['sidebar-btn-settings']);"));
  });
});
describe('sidebar footer', () => {
  const footerStart = html.indexOf('<div class="sidebar-footer">');
  const footer = html.slice(footerStart, html.indexOf('id="settings-screen"'));
  it('pins Settings then Logout below the scrolling list', () => {
    assert.ok(footerStart > html.indexOf('<div class="sidebar-scroll">'));
    assert.deepEqual(labelOf(footer), ['Settings', 'Logout']);
    assert.ok(html.indexOf('Formula Store\n    </button>') < footerStart);
  });
  it('is outside the scrolling list and always at the bottom', () => {
    const scrollStart = html.indexOf('<div class="sidebar-scroll">');
    const scrollPart = html.slice(scrollStart, footerStart);
    assert.equal(scrollPart.includes('sidebar-btn-settings'), false);
    assert.equal(scrollPart.includes('_showLogoutConfirmDialog'), false);
    assert.match(read('../app.css'), /\.sidebar-footer \{[^}]*flex-shrink: 0/);
  });
  it('keeps Logout for admins only, as before', () => {
    assert.ok(html.includes("window.setDisplay(logoutBtn, mode === 'admin' ? '' : 'none')"));
  });
});
describe('settings screen back', () => {
  it('has a back arrow that closes only the settings screen', async () => {
    assert.match(settings, /class="(?:btn )?screen-back-btn"[^>]*onclick="closeSettingsScreen\(\)"/);
    const calls = [];
    globalThis.window = { closeStandaloneScreen: (id) => calls.push(id) };
    const { closeSettingsScreen } = await import('../modules/settings-screen.js');
    closeSettingsScreen();
    assert.deepEqual(calls, ['settings-screen']);
  });
});
describe('settings screen', () => {
  it('is the first standalone screen so everything it opens stacks above it', () => {
    const first = html.match(/<div id="([^"]+)" class="standalone-screen\b/);
    assert.equal(first[1], 'settings-screen');
  });
  it('holds every moved button in the planned groups', () => {
    const groups = settings.split('<p class="settings-group-label">').slice(1).map((g) => [g.slice(0, g.indexOf('</p>')).replace(/&amp;/g, '&'), labelOf(g)]);
    assert.deepEqual(groups, [
      ['Data & Sync', ['Sync Data', 'Backup & Restore', 'Recycle Bin', 'Database Structure']],
      ['Appearance & Device', ['Theme', 'Sound & Haptics']],
      ['Security', ['Fingerprint Lock']],
      ['Accounts', ['App Accounts']],
      ['Business', ['Store Manager']],
      ['Danger Zone', ['Close Financial Year']]
    ]);
  });
  it('keeps element ids that scripts rely on and never closes the sidebar from inside', () => {
    for (const id of ['sidebar-btn-sync', 'sidebar-btn-recycle', 'sidebar-btn-theme', 'bio-toggle-btn', 'bio-toggle-label', 'sidebar-btn-stores']) assert.ok(settings.includes(`id="${id}"`), id);
    assert.equal(settings.includes('closeSidebar()'), false);
  });
  it('is registered for back navigation, caching and loading', () => {
    assert.match(read('../modules/utilities-payments.js'), /'settings-screen':\s+\{ closeFn/);
    assert.ok(read('../sw.js').includes("'./modules/settings-screen.js'"));
    assert.ok(read('../modules/main.js').includes("import './settings-screen.js';"));
  });
});
describe('prepareSettingsScreen role gating', () => {
  const makeBtn = (id) => { const set = new Set(); return { id, classList: { toggle: (c, on) => { if (on) set.add(c); else set.delete(c); }, contains: (c) => set.has(c) } }; };
  const run = async (mode) => {
    const g = [[makeBtn('sidebar-btn-sync'), makeBtn('x1')], [makeBtn('sidebar-btn-theme')], [makeBtn('bio-toggle-btn')]];
    const cards = g.map((btns) => { const set = new Set(); return { btns, classList: { toggle: (c, on) => { if (on) set.add(c); else set.delete(c); }, contains: (c) => set.has(c) }, querySelectorAll: () => btns }; });
    const all = cards.flatMap((c) => c.btns);
    globalThis.window = { appMode: mode, syncBiometricButton() { this.synced = true; } };
    globalThis.document = { getElementById: () => ({ querySelectorAll: (sel) => (sel === '.card' ? cards : all) }) };
    const { prepareSettingsScreen } = await import('../modules/settings-screen.js');
    prepareSettingsScreen();
    return { all, cards, win: globalThis.window };
  };
  it('admin sees everything', async () => {
    const r = await run('admin');
    assert.ok(r.all.every((b) => !b.classList.contains('d-none')));
    assert.ok(r.win.synced);
  });
  it('other roles keep only sync, recycle bin and theme, and empty groups collapse', async () => {
    const r = await run('rep');
    assert.deepEqual(r.all.map((b) => [b.id, b.classList.contains('d-none')]), [['sidebar-btn-sync', false], ['x1', true], ['sidebar-btn-theme', false], ['bio-toggle-btn', true]]);
    assert.deepEqual(r.cards.map((c) => c.classList.contains('d-none')), [false, false, true]);
  });
});
