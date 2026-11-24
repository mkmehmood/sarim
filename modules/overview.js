import { appMode, ensureRecordIntegrity, generateUUID, getTimestamp, sqliteStore } from './business.js';
import { openDialog } from './dialog.js';
import { emitSyncUpdate, getFirestoreCollection, pushDataToCloud, unifiedSave } from './sync.js';
import { notifyDataChange } from './utilities-core.js';
import { localDateStr } from './finance.js';
import { buildOverview, overviewHtml } from './overview-data.js';
import { nearestIndex, tipHtml } from './overview-lines.js';
import { auditData } from './overview-audit.js';
import { getFormulaStore } from './formula-store.js';
import { applyValues, planFields, validateValues } from './overview-fix.js';
import { LINK_CODES, repairStore, repairSummary } from './link-repair.js';
import { syncFix, syncMessage, touchPeers } from './overview-sync.js';

let _range = 6;
let _panel = 'sales';

export async function renderOverview() {
  const box = document.getElementById('tab-overview');
  if (!box) return;
  const keys = ['production', 'sales', 'rep', 'inventory', 'transactions', 'expenses', 'entities', 'factory'];
  const loaded = await Promise.all(keys.map((k) => sqliteStore.get(k).catch(() => [])));
  const data = Object.fromEntries(keys.map((k, i) => [k, loaded[i]]));
  data.formulas = await getFormulaStore().catch(() => []);
  box.innerHTML = overviewHtml(buildOverview(data, new Date(), _range), _range, { panel: _panel, stamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
}

const ESC = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const FACTS = {
  sales: ['date', 'customerName', 'supplyStore', 'quantity', 'unitPrice', 'totalValue', 'totalCost', 'profit', 'paymentType'],
  rep: ['date', 'customerName', 'paymentType', 'totalValue'],
  production: ['date', 'store', 'formulaName', 'net', 'totalSale', 'totalCost', 'profit'],
  transactions: ['date', 'type', 'entityName', 'amount'],
  expenses: ['date', 'name', 'category', 'amount'],
  inventory: ['name', 'quantity', 'cost'],
};
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
  const keys = ['production', 'sales', 'rep', 'inventory', 'transactions', 'expenses', 'entities'];
  const loaded = await Promise.all(keys.map((k) => sqliteStore.get(k).catch(() => [])));
  return auditData(Object.fromEntries(keys.map((k, i) => [k, loaded[i]])), localDateStr(new Date()));
}

function fieldHtml(f, i) {
  if (f.type === 'check') return `<label class="ov-fix-check"><input type="checkbox" data-fix-input="${i}"${f.value ? ' checked' : ''}> ${ESC(f.label)}</label>`;
  const control = f.type === 'select'
    ? `<select class="form-ctl" data-fix-input="${i}"><option value="">Choose...</option>${f.options.map((o) => `<option value="${ESC(o.value)}">${ESC(o.label)}</option>`).join('')}</select>`
    : `<input class="form-ctl" data-fix-input="${i}" type="${f.type === 'date' ? 'date' : 'text'}"${f.type === 'number' ? ' inputmode="decimal" autocomplete="off"' : ''} value="${ESC(f.value)}">`;
  return `<label class="ov-fix-label">${ESC(f.label)}${control}</label>`;
}

function fixBody(finding, plan) {
  const head = `${ESC(finding.label)}${finding.date ? ` \u00b7 ${ESC(finding.date)}` : ''}${finding.id ? ` \u00b7 id ${ESC(finding.id)}` : ''}`;
  const reasons = finding.reasons.map((r) => `<li>${ESC(r)}</li>`).join('');
  const notes = plan.notes.map((n) => `<p class="ov-fix-note">${ESC(n)}</p>`).join('');
  const fields = plan.fields.length ? `<div class="ov-sub">Update</div><div class="ov-fix-fields">${plan.fields.map(fieldHtml).join('')}</div>` : '';
  return `<div class="ov-fix"><div class="ov-fix-head">${head}</div><ul class="ov-fix-reasons">${reasons}</ul>${notes}${fields}<div class="ov-fix-error" role="alert" hidden></div></div>`;
}

function readFields(overlay, fields) {
  const raw = {};
  fields.forEach((f, i) => {
    const el = overlay.querySelector(`[data-fix-input="${i}"]`);
    raw[f.key] = !el ? '' : (f.type === 'check' ? el.checked : el.value);
  });
  return raw;
}

function syncDeps() {
  return {
    signedIn: () => !!window.currentUser,
    online: () => navigator.onLine !== false,
    flush: () => (window._syncQueue ? window._syncQueue.run(async () => {}) : Promise.resolve()),
    push: () => pushDataToCloud(true),
    ping: (payload) => emitSyncUpdate(payload),
    pending: () => (window.OfflineQueue && Array.isArray(window.OfflineQueue.queue) ? window.OfflineQueue.queue.length : 0),
    collectionKey: (col) => getFirestoreCollection(col),
  };
}

async function persistFixed(col, arr, idx, next) {
  const stamp = getTimestamp();
  const oldId = arr[idx] ? arr[idx].id : null;
  const record = ensureRecordIntegrity({ ...next, updatedAt: stamp }, true);
  arr[idx] = record;
  const idChanged = oldId != null && String(oldId) !== String(record.id);
  const peers = idChanged ? touchPeers(arr, oldId, idx, stamp) : [];
  if (peers.length) await unifiedSave(col, arr, null, [record.id, oldId]);
  else await unifiedSave(col, arr, record);
  notifyDataChange(col);
  const ids = [record.id, ...(peers.length ? [oldId] : [])];
  return syncFix({ col, ids, deps: syncDeps() });
}

async function repairLinks(col, scope) {
  const rows = await sqliteStore.get(col).catch(() => []);
  const arr = Array.isArray(rows) ? rows : [];
  const result = repairStore(arr, col === 'rep' ? 'rep' : 'sales', scope || {});
  if (!result.changedIds.length) return result;
  const stamp = getTimestamp();
  result.changedIds.forEach((id) => {
    const rec = arr.find((x) => x && x.id === id);
    if (rec) { rec.updatedAt = stamp; ensureRecordIntegrity(rec, true); }
  });
  await unifiedSave(col, arr, null, result.changedIds);
  notifyDataChange(col);
  result.outcome = await syncFix({ col, ids: result.changedIds, deps: syncDeps() });
  return result;
}

export async function openFix(col, idx, opts = {}) {
  if (!FACTS[col]) return 'done';
  let status = 'done';
  let { arr, finding } = await loadFinding(col, idx);
  if (!finding) { toast('That record no longer has a problem.', 'success'); await renderOverview(); return 'done'; }
  for (let guard = 0; guard < 8 && finding; guard += 1) {
    const [inventory, formulas, entities] = await Promise.all([
      sqliteStore.get('inventory').catch(() => []),
      getFormulaStore().catch(() => []),
      sqliteStore.get('entities').catch(() => []),
    ]);
    const ctx = { formulas, inventory: Array.isArray(inventory) ? inventory : [], entities: Array.isArray(entities) ? entities : [] };
    const today = localDateStr(new Date());
    const plan = planFields(col, finding.rec, finding.codes, today, ctx);
    let captured = null;
    const save = {
      label: plan.repair ? 'Repair' : (plan.fields.length || plan.newId ? (plan.newId && !plan.fields.length ? 'Give new id' : 'Save') : ''),
      variant: 'solid',
      value: 'save',
      guard: (overlay) => {
        const errEl = overlay.querySelector('.ov-fix-error');
        const check = validateValues(plan.fields, readFields(overlay, plan.fields), today);
        if (!check.ok) { errEl.textContent = check.message; errEl.hidden = false; return { ok: false }; }
        errEl.hidden = true;
        captured = check.values;
        return { ok: true, value: 'save' };
      },
    };
    const actions = [opts.sequence ? { label: 'Stop', variant: 'ghost', value: null } : { label: 'Cancel', variant: 'ghost', value: null }];
    if (opts.sequence) actions.push({ label: 'Skip', variant: 'ghost', value: 'skip' });
    if (plan.deletable) actions.push({ label: 'Delete', variant: 'ghost', value: 'delete' });
    if (save.label) actions.push(save);
    const picked = await openDialog({
      tone: finding.severity === 'error' ? 'danger' : 'warning',
      eyebrow: finding.severity === 'error' ? 'Needs fixing' : 'Please check',
      title: `${finding.label}: ${finding.title}`,
      body: fixBody(finding, plan),
      actions,
      dismissIndex: 0,
      focusIndex: -1,
    });
    if (picked === null || picked === undefined) { status = 'closed'; break; }
    if (picked === 'skip') { status = 'skipped'; break; }
    if (picked === 'delete') {
      const fn = window[DELETERS[col]];
      if (typeof fn !== 'function') { toast('Deleting is not available for this record here.', 'error'); break; }
      await fn(finding.rec.id);
      const removed = await syncFix({ col, ids: [finding.rec.id], deps: syncDeps() });
      toast(syncMessage(removed, 'Deleted'), 'success');
      await renderOverview();
      return 'done';
    }
    if (plan.repair) {
      let repaired;
      try {
        repaired = await repairLinks(col, finding.codes.includes('col_unapplied') ? { only: [finding.rec.id] } : { only: [], orphanIds: [finding.rec.id] });
      } catch (e) {
        toast('Could not repair. Nothing was changed.', 'error');
        break;
      }
      if (!repaired.changedIds.length) { toast('Nothing could be repaired automatically.', 'error'); break; }
      toast(syncMessage(repaired.outcome, repairSummary(repaired)), 'success');
      ({ arr, finding } = await loadFinding(col, idx));
      continue;
    }
    const next = plan.newId && !plan.fields.length ? { ...finding.rec, id: generateUUID('repair') } : applyValues(col, plan.newId ? { ...finding.rec, id: generateUUID('repair') } : finding.rec, captured || {}, ctx);
    let outcome;
    try {
      outcome = await persistFixed(col, arr, idx, next);
    } catch (e) {
      toast('Could not save the fix. Nothing was changed.', 'error');
      break;
    }
    toast(syncMessage(outcome, 'Saved'), 'success');
    ({ arr, finding } = await loadFinding(col, idx));
    if (finding && finding.codes.includes('sale_loss')) finding = null;
  }
  await renderOverview();
  return status;
}

async function fixAllLinks() {
  const audit = await loadAudit();
  const cols = ['sales', 'rep'].filter((c) => audit.findings.some((f) => f.collection === c && f.codes.some((x) => LINK_CODES.includes(x))));
  if (!cols.length) { toast('No records with this problem were found.', 'success'); await renderOverview(); return; }
  const count = audit.findings.filter((f) => f.codes.some((x) => LINK_CODES.includes(x))).length;
  const go = await openDialog({
    tone: 'warning',
    eyebrow: 'Repair',
    title: 'Repair payment links',
    body: `<div class="ov-fix"><p class="ov-fix-note">${count} record${count === 1 ? '' : 's'} will be repaired. Collection cash that no sale confirms is applied to that customer\u2019s unpaid sales, newest first, and payments from deleted collections are taken off the sales. Records that are already correct are not touched.</p></div>`,
    actions: [{ label: 'Cancel', variant: 'ghost', value: null }, { label: 'Repair all', variant: 'solid', value: 'go' }],
    dismissIndex: 0,
    focusIndex: -1,
  });
  if (go !== 'go') return;
  const total = { cleared: 0, restored: 0, applied: 0, changedIds: [], outcome: 'synced' };
  const worst = { synced: 0, queued: 1, local: 2 };
  try {
    for (const c of cols) {
      const r = await repairLinks(c);
      total.cleared += r.cleared; total.restored += r.restored; total.applied += r.applied; total.changedIds.push(...r.changedIds);
      if (r.outcome && worst[r.outcome] > worst[total.outcome]) total.outcome = r.outcome;
    }
  } catch (e) {
    toast('Could not repair. Nothing was changed.', 'error');
    return;
  }
  toast(syncMessage(total.outcome, repairSummary(total)), 'success');
  await renderOverview();
}

async function fixByCode(code) {
  if (LINK_CODES.includes(code)) { await fixAllLinks(); return; }
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

const chartData = new WeakMap();
const chartOff = new WeakMap();

function dataOf(chart) {
  if (!chartData.has(chart)) {
    try { chartData.set(chart, JSON.parse(chart.getAttribute('data-lines'))); } catch (_) { chartData.set(chart, null); }
  }
  return chartData.get(chart);
}

function hideTip(chart) {
  chart.querySelector('.ov-tip').hidden = true;
  chart.querySelector('.ov-cross').classList.add('is-off');
  chart.querySelector('.ov-hover').classList.add('is-off');
}

export function showTip(chart, clientX) {
  const data = dataOf(chart);
  if (!data) return;
  const svg = chart.querySelector('.ov-lines');
  const rect = svg.getBoundingClientRect();
  if (!rect.width) return;
  const idx = nearestIndex(data.x, ((clientX - rect.left) / rect.width) * data.W);
  const off = chartOff.get(chart) || new Set();
  const cross = chart.querySelector('.ov-cross');
  cross.setAttribute('x1', data.x[idx]);
  cross.setAttribute('x2', data.x[idx]);
  cross.classList.remove('is-off');
  chart.querySelector('.ov-hover').classList.remove('is-off');
  chart.querySelectorAll('.ov-hdot').forEach((dot) => {
    const i = Number(dot.getAttribute('data-s'));
    dot.setAttribute('cx', data.x[idx]);
    dot.setAttribute('cy', data.series[i].y[idx]);
    dot.classList.toggle('is-off', off.has(i));
  });
  const tip = chart.querySelector('.ov-tip');
  tip.innerHTML = tipHtml(data, idx, off);
  const pct = (data.x[idx] / data.W) * 100;
  tip.style.setProperty('--tip-x', `${pct}%`);
  tip.classList.toggle('is-right', pct >= 50);
  tip.hidden = false;
}

function toggleSeries(chart, chip) {
  const i = Number(chip.getAttribute('data-series'));
  const off = chartOff.get(chart) || new Set();
  if (off.has(i)) off.delete(i); else off.add(i);
  chartOff.set(chart, off);
  const on = !off.has(i);
  chip.classList.toggle('is-off', !on);
  chip.setAttribute('aria-pressed', String(on));
  chart.querySelectorAll(`[data-s="${i}"]`).forEach((el) => el.classList.toggle('is-off', !on));
  hideTip(chart);
}

function bindCharts(box) {
  box.addEventListener('pointerdown', (e) => {
    const hit = e.target.closest && e.target.closest('.ov-hit');
    box.querySelectorAll('.ov-linechart[data-lines]').forEach((c) => { if (!hit || !c.contains(hit)) hideTip(c); });
    if (hit) showTip(hit.closest('.ov-linechart'), e.clientX);
  });
  box.addEventListener('pointermove', (e) => {
    const hit = e.target.closest && e.target.closest('.ov-hit');
    if (hit && (e.pointerType !== 'mouse' || e.buttons === 0 || e.buttons === 1)) showTip(hit.closest('.ov-linechart'), e.clientX);
  });
  box.addEventListener('pointerout', (e) => {
    const hit = e.target.closest && e.target.closest('.ov-hit');
    if (hit && e.pointerType === 'mouse' && !hit.contains(e.relatedTarget)) hideTip(hit.closest('.ov-linechart'));
  });
  box.addEventListener('click', (e) => {
    const chip = e.target.closest && e.target.closest('.ov-chip-s');
    if (chip) toggleSeries(chip.closest('.ov-linechart'), chip);
  });
}

export function initOverview() {
  const box = document.getElementById('tab-overview');
  if (!box || box.dataset.bound === '1') return;
  box.dataset.bound = '1';
  bindCharts(box);
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
  });
}

if (typeof window !== 'undefined') {
  window.overviewIsHome = () => appMode === 'admin';
  window.renderOverview = renderOverview;
  window.initOverview = initOverview;
}
