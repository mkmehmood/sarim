import { appMode, ensureRecordIntegrity, generateUUID, getTimestamp, sqliteStore } from './business.js';
import { openDialog } from './dialog.js';
import { unifiedSave } from './sync.js';
import { notifyDataChange, triggerAutoSync } from './utilities-core.js';
import { localDateStr } from './finance.js';
import { buildOverview, overviewHtml } from './overview-data.js';
import { auditData } from './overview-audit.js';
import { getFormulaStore } from './formula-store.js';
import { applyFix, parseInput, planFixes } from './overview-fix.js';

let _range = 6;
let _panel = 'sales';

export async function renderOverview() {
  const box = document.getElementById('tab-overview');
  if (!box) return;
  const keys = ['production', 'sales', 'inventory', 'transactions', 'expenses', 'entities', 'factory'];
  const loaded = await Promise.all(keys.map((k) => sqliteStore.get(k).catch(() => [])));
  const data = Object.fromEntries(keys.map((k, i) => [k, loaded[i]]));
  data.formulas = await getFormulaStore().catch(() => []);
  box.innerHTML = overviewHtml(buildOverview(data, new Date(), _range), _range, { panel: _panel });
}

const ESC = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FACTS = {
  sales: ['date', 'customerName', 'supplyStore', 'quantity', 'unitPrice', 'totalValue', 'totalCost', 'profit', 'paymentType'],
  production: ['date', 'store', 'formulaName', 'net', 'totalSale', 'totalCost', 'profit'],
  transactions: ['date', 'type', 'entityName', 'amount'],
  expenses: ['date', 'name', 'category', 'amount'],
  inventory: ['name', 'quantity', 'cost'],
};
const TARGET = { sales: { go: 'sales' }, production: { go: 'prod' }, transactions: { go: 'payments' }, expenses: { go: 'payments' }, inventory: { screen: 'raw-material-screen' } };
const DELETERS = { sales: 'deleteTransactionFromOverlay', production: 'deleteProdEntry', transactions: 'deleteEntityTransaction', expenses: 'deleteExpenseFromOverlay' };

function toast(message, type = 'info') {
  if (typeof window.showToast === 'function') window.showToast(message, type);
}

async function loadFinding(col, idx) {
  const rows = await sqliteStore.get(col).catch(() => []);
  const arr = Array.isArray(rows) ? rows : [];
  const entities = await sqliteStore.get('entities').catch(() => []);
  const audit = auditData({ [col]: arr, entities }, localDateStr(new Date()));
  let finding = audit.findings.find((f) => f.idx === idx);
  const rec = arr[idx];
  if (!finding && col === 'sales' && rec && !rec.isDeleted && Number(rec.profit) < 0) {
    const q = Number(rec.quantity) || 0;
    const price = q > 0 ? (Number(rec.totalValue) || 0) / q : 0;
    const cost = q > 0 ? (Number(rec.totalCost) || 0) / q : 0;
    finding = { rec, idx, codes: ['sale_loss'], collection: col, id: rec.id == null ? '' : String(rec.id), date: String(rec.date || ''), title: rec.customerName || 'Sale', label: 'Sale', severity: 'warn', impact: Number(rec.profit) || 0, reasons: [`No data problem found. It sold at ${price.toFixed(2)} per kg against a cost of ${cost.toFixed(2)} per kg, a loss of ${Math.abs(Number(rec.profit) || 0).toLocaleString('en-US')}. Check the price or the cost.`] };
  }
  return { arr, finding };
}

async function loadAudit() {
  const keys = ['production', 'sales', 'inventory', 'transactions', 'expenses', 'entities'];
  const loaded = await Promise.all(keys.map((k) => sqliteStore.get(k).catch(() => [])));
  return auditData(Object.fromEntries(keys.map((k, i) => [k, loaded[i]])), localDateStr(new Date()));
}

function fixBody(col, finding, fixes) {
  const rec = finding.rec;
  const facts = (FACTS[col] || []).filter((k) => rec[k] !== undefined && rec[k] !== '').map((k) => `<div class="ov-fix-fact"><span>${ESC(k)}</span><b>${ESC(rec[k])}</b></div>`).join('');
  const reasons = finding.reasons.map((r) => `<li>${ESC(r)}</li>`).join('');
  const options = fixes.map((f, i) => `<li class="ov-fix-opt">${f.input ? `<label class="ov-fix-label">${ESC(f.input.label)}${f.input.type === 'select' ? `<select class="form-ctl" data-fix-input="${i}"><option value="">Choose...</option>${f.input.options.map((o) => `<option value="${ESC(o.value)}">${ESC(o.label)}</option>`).join('')}</select>` : `<input class="form-ctl" data-fix-input="${i}" type="${f.input.type === 'date' ? 'date' : 'number'}" step="any" inputmode="decimal" value="${ESC(f.input.value)}">`}</label>` : ''}<button type="button" class="panel dlg-option${f.danger ? ' is-danger' : ''}" data-opt="${i}" data-act="${i + 1}">${ESC(f.label)}${f.hint ? ` <small>${ESC(f.hint)}</small>` : ''}</button></li>`).join('');
  return `<div class="ov-fix"><div class="ov-fix-facts">${facts}</div><div class="ov-sub">What is wrong</div><ul class="ov-fix-reasons">${reasons}</ul><div class="ov-sub">Choose a fix</div><ul class="dlg-options">${options}</ul></div>`;
}

async function persistFixed(col, arr, idx, next) {
  const record = ensureRecordIntegrity({ ...next, updatedAt: getTimestamp() }, true);
  arr[idx] = record;
  await unifiedSave(col, arr, record);
  notifyDataChange(col);
  triggerAutoSync();
  return record;
}

export async function openFix(col, idx, opts = {}) {
  if (!FACTS[col]) return 'done';
  let status = 'done';
  let { arr, finding } = await loadFinding(col, idx);
  if (!finding) { toast('That record no longer has a problem.', 'success'); await renderOverview(); return 'done'; }
  for (let guard = 0; guard < 8 && finding; guard += 1) {
    const inventory = await sqliteStore.get('inventory').catch(() => []);
    const fixes = planFixes(col, finding.rec, finding.codes, localDateStr(new Date()), { formulas: await getFormulaStore().catch(() => []), inventory: Array.isArray(inventory) ? inventory : [] });
    let raw = null;
    const picked = await openDialog({
      tone: finding.severity === 'error' ? 'danger' : 'warning',
      eyebrow: finding.severity === 'error' ? 'Needs fixing' : 'Please check',
      title: `Fix ${finding.label}: ${finding.title}`,
      body: fixBody(col, finding, fixes),
      actions: opts.sequence ? [{ label: 'Stop', variant: 'ghost', value: null }, { label: 'Skip', variant: 'ghost', value: 'skip' }] : [{ label: 'Close', variant: 'ghost', value: null }],
      dismissIndex: 0,
      focusIndex: -1,
      onBodyClick: (i) => {
        const overlays = document.querySelectorAll('.dlg-overlay');
        const input = overlays[overlays.length - 1].querySelector(`[data-fix-input="${i}"]`);
        raw = input ? input.value : null;
        return i;
      },
    });
    if (picked === null || picked === undefined) { status = 'closed'; break; }
    if (picked === 'skip') { status = 'skipped'; break; }
    const fix = fixes[picked];
    if (!fix) break;
    if (fix.kind === 'open') {
      const t = TARGET[col];
      if (t.screen && typeof window.openStandaloneScreen === 'function') window.openStandaloneScreen(t.screen);
      else if (t.go && typeof window.sidebarNav === 'function') window.sidebarNav(t.go);
      return 'closed';
    }
    if (fix.kind === 'delete') {
      const fn = window[DELETERS[col]];
      if (typeof fn !== 'function') { toast('Deleting is not available for this record here. Open its screen instead.', 'error'); break; }
      await fn(finding.rec.id);
      await renderOverview();
      return 'done';
    }
    const parsed = parseInput(fix, raw);
    if (!parsed.ok) { toast(parsed.message, 'error'); continue; }
    const next = fix.kind === 'newid' ? { ...finding.rec, id: generateUUID('repair') } : applyFix(finding.rec, fix, parsed.value);
    try {
      await persistFixed(col, arr, idx, next);
    } catch (e) {
      toast('Could not save the fix. Nothing was changed.', 'error');
      break;
    }
    toast('Record fixed', 'success');
    ({ arr, finding } = await loadFinding(col, idx));
    if (finding && finding.codes.includes('sale_loss')) finding = null;
  }
  await renderOverview();
  return status;
}

async function fixByCode(code) {
  const audit = await loadAudit();
  const f = audit.findings.find((x) => x.codes.includes(code));
  if (!f) { toast('No records with this problem were found.', 'success'); await renderOverview(); return; }
  await openFix(f.collection, f.idx);
}

async function fixAll() {
  const done = new Set();
  for (let n = 0; n < 1000; n += 1) {
    const audit = await loadAudit();
    const f = audit.findings.find((x) => !done.has(`${x.collection}:${x.id || x.idx}`));
    if (!f) break;
    done.add(`${f.collection}:${f.id || f.idx}`);
    const status = await openFix(f.collection, f.idx, { sequence: true });
    if (status === 'closed') break;
  }
  await renderOverview();
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
    const r = e.target.closest && e.target.closest('[data-range],[data-panel]');
    if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); }
  });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-fix-all]')) { fixAll(); return; }
    const codeBtn = e.target.closest('[data-fix-code]');
    if (codeBtn && box.contains(codeBtn)) { fixByCode(codeBtn.getAttribute('data-fix-code')); return; }
    const fixBtn = e.target.closest('[data-fix]');
    if (fixBtn && box.contains(fixBtn)) { const [col, idx] = fixBtn.getAttribute('data-fix').split(':'); openFix(col, Number(idx)); return; }
    const tab = e.target.closest('[data-panel]');
    if (tab && box.contains(tab)) {
      _panel = tab.getAttribute('data-panel');
      box.querySelectorAll('[data-panel]').forEach((el) => el.classList.toggle('active', el === tab));
      box.querySelectorAll('[data-panel-id]').forEach((el) => { el.hidden = el.getAttribute('data-panel-id') !== _panel; });
      return;
    }
    const range = e.target.closest('[data-range]');
    if (range) { _range = Number(range.getAttribute('data-range')); renderOverview(); return; }
    const go = e.target.closest('[data-go],[data-screen]');
    if (go && box.contains(go)) goTo(go);
  });
}

if (typeof window !== 'undefined') {
  window.overviewIsHome = () => appMode === 'admin';
  window.renderOverview = renderOverview;
  window.initOverview = initOverview;
}
