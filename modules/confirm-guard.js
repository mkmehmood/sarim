import { getEditCtx } from './edit-mode.js';
const _pending = new Set();
export async function confirmGuard(key, run, opts = {}) {
  if (_pending.has(key)) return;
  const ctx = getEditCtx();
  if (ctx && Array.isArray(opts.skipKinds) && opts.skipKinds.includes(ctx.kind)) return run();
  if (typeof window.showGlassConfirm !== 'function') return run();
  const label = opts.label || 'Entry';
  const inEdit = !!ctx && Array.isArray(opts.editKinds) && opts.editKinds.includes(ctx.kind);
  const isUpdate = inEdit || (typeof opts.isUpdate === 'function' && !!opts.isUpdate());
  const verb = isUpdate ? 'Update' : (opts.verb || 'Save');
  const message = isUpdate
    ? `Update this ${label.toLowerCase()}?\nThe existing record will be replaced.`
    : `${verb} this ${label.toLowerCase()}?\nPlease review the details before continuing.`;
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
