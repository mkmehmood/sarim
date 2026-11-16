import { sqliteStore } from './business.js';
import { buildOverview, overviewHtml } from './overview-data.js';

let _range = 6;

export async function renderOverview() {
  const box = document.getElementById('tab-overview');
  if (!box) return;
  const [production, sales, inventory, transactions, expenses] = await Promise.all(['production', 'sales', 'inventory', 'transactions', 'expenses'].map((k) => sqliteStore.get(k).catch(() => [])));
  const model = buildOverview({ production, sales, inventory, transactions, expenses }, new Date(), _range);
  box.innerHTML = overviewHtml(model, _range);
}

export function goTo(el) {
  const screen = el.getAttribute('data-screen');
  if (screen) {
    if (typeof window.openStandaloneScreen === 'function') window.openStandaloneScreen(screen);
    if (typeof window.prepareRawMaterialScreen === 'function') window.prepareRawMaterialScreen();
    return;
  }
  const tab = el.getAttribute('data-go');
  if (tab && typeof window.sidebarNav === 'function') window.sidebarNav(tab);
}

export function initOverview() {
  const box = document.getElementById('tab-overview');
  if (!box || box.dataset.bound === '1') return;
  box.dataset.bound = '1';
  box.addEventListener('keydown', (e) => {
    const r = e.target.closest && e.target.closest('[data-range]');
    if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); }
  });
  box.addEventListener('click', (e) => {
    const range = e.target.closest('[data-range]');
    if (range) { _range = Number(range.getAttribute('data-range')); renderOverview(); return; }
    const go = e.target.closest('[data-go],[data-screen]');
    if (go && box.contains(go)) goTo(go);
  });
}

if (typeof window !== 'undefined') {
  window.renderOverview = renderOverview;
  window.initOverview = initOverview;
}
