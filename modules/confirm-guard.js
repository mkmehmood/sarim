import { getEditCtx } from './edit-mode.js';
const _pending = new Set();
function readDetails(fields) {
  const out = [];
  (fields || []).forEach(([id, label]) => {
    const el = document.getElementById(id);
    if (!el || el.closest('.hidden')) return;
    let v = el.tagName === 'SELECT' ? ((el.options[el.selectedIndex] || {}).text || '') : String(el.value ?? '');
    v = v.replace(/\s+/g, ' ').trim();
    if (!v) return;
    if (v.length > 44) v = v.slice(0, 43) + '\u2026';
    out.push(`${label}: ${v}`);
  });
  return out;
}
export async function confirmGuard(key, run, opts = {}) {
  if (_pending.has(key)) return;
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
      const parts = lines.slice();
      if (isUpdate) parts.push('The existing record will be replaced.');
      else if (!lines.length && !extra.warning) parts.push(tail);
      if (extra.warning) parts.push(`Warning: ${extra.warning}`);
      return window.showGlassConfirm(parts.join('\n'), {
        title: `${verb} ${label}?`,
        confirmText: extra.confirmText || (extra.warning ? `${verb} Anyway` : verb),
        cancelText: 'Cancel',
        tone: extra.warning || isUpdate ? 'warning' : 'primary'
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
      tone: isUpdate ? 'warning' : 'primary'
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
  return l.ask(extra || {});
}
window.gcCommit = gcCommit;
