import { getEditCtx } from './edit-mode.js';
import { sanitizeConfirmExtra } from './money-privacy.js';
const _pending = new Set();
const SHARE_PREF = 'sarim.shareInvoiceAfterSave';
const readSharePref = () => { try { return localStorage.getItem(SHARE_PREF) === '1'; } catch (_) { return false; } };
const writeSharePref = (v) => { try { localStorage.setItem(SHARE_PREF, v ? '1' : '0'); } catch (_) { } };

function shareCheckbox(opts, verb) {
  if (!opts.share || (typeof opts.share.when === 'function' && !opts.share.when())) return null;
  if (typeof window.warmInvoiceShare === 'function') window.warmInvoiceShare();
  return {
    label: 'Share invoice after saving',
    checked: readSharePref(),
    confirmTextChecked: opts.share.confirmText || `${verb || 'Save'} & Share`,
    onResult: (v) => { writeSharePref(v); window._gcShare = v ? { kind: opts.share.kind } : null; }
  };
}

function readDetails(fields) {
  const out = [];
  (fields || []).forEach(([id, label]) => {
    let v;
    if (typeof id === 'function') v = String(id() ?? '');
    else {
      const el = document.getElementById(id);
      if (!el || el.closest('.hidden')) return;
      v = el.tagName === 'SELECT' ? ((el.options[el.selectedIndex] || {}).text || '') : String(el.value ?? '');
    }
    v = v.replace(/\s+/g, ' ').trim();
    if (!v) return;
    if (v.length > 44) v = v.slice(0, 43) + '\u2026';
    out.push(`${label}: ${v}`);
  });
  return out;
}

export async function confirmGuard(key, run, opts = {}) {
  if (_pending.has(key)) return;
  window._gcShare = null;
  const ctx = getEditCtx();
  if (ctx && Array.isArray(opts.skipKinds) && opts.skipKinds.includes(ctx.kind)) return run();
  if (typeof window.showGlassConfirm !== 'function') return run();
  const label = opts.label || 'Entry';
  const inEdit = !!ctx && Array.isArray(opts.editKinds) && opts.editKinds.includes(ctx.kind);
  const isUpdate = inEdit || (typeof opts.isUpdate === 'function' && !!opts.isUpdate());
  const verb = isUpdate ? 'Update' : (opts.verb || 'Save');
  const details = readDetails(opts.fields);
  const tail = isUpdate ? 'The existing record will be replaced.' : 'Please review the details before continuing.';
  const message = details.length ? `${details.join('\n')}\n\n${tail}` : tail;
  if (opts.late) {
    const ask = async (extra = {}) => {
      const lines = details.concat(extra.lines || []);
      const parts = (extra.lead ? [extra.lead] : []).concat(lines, extra.notes || []);
      if (isUpdate) parts.push('The existing record will be replaced.');
      else if (!lines.length && !extra.warning && !extra.lead) parts.push(tail);
      if (extra.warning) parts.push(`Warning: ${extra.warning}`);
      return window.showGlassConfirm(parts.join('\n'), {
        title: `${verb} ${label}?`,
        confirmText: extra.confirmText || (extra.warning ? `${verb} Anyway` : verb),
        cancelText: 'Cancel',
        tone: extra.warning || isUpdate ? 'warning' : 'primary',
        checkbox: shareCheckbox(opts, verb)
      });
    };
    _pending.add(key);
    window._gcLate = { ask };
    try {
      return await run();
    } finally {
      window._gcLate = null;
      _pending.delete(key);
    }
  }
  _pending.add(key);
  let ok = false;
  try {
    ok = await window.showGlassConfirm(message, {
      title: `${verb} ${label}?`,
      confirmText: verb,
      cancelText: 'Cancel',
      tone: isUpdate ? 'warning' : 'primary',
      checkbox: shareCheckbox(opts, verb)
    });
  } finally {
    _pending.delete(key);
  }
  if (!ok) return;
  return run();
}

export function gcCommit(extra) {
  const l = window._gcLate;
  if (!l) return Promise.resolve(true);
  window._gcLate = null;
  return l.ask(sanitizeConfirmExtra(extra));
}

window.gcCommit = gcCommit;
