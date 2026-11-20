const humanize = (id) => String(id || '').replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim();

export function accessibleNameFor(el) {
  if (!el || !el.getAttribute) return '';
  if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.getAttribute('title')) return '';
  const type = (el.getAttribute('type') || '').toLowerCase();
  if (type === 'hidden') return '';
  if (el.id && el.ownerDocument && el.ownerDocument.querySelector(`label[for="${el.id}"]`)) return '';
  if (el.closest && el.closest('label')) return '';
  const field = el.closest && el.closest('.field');
  if (field && field.querySelector('label')) return '';
  const hint = el.getAttribute('placeholder');
  if (hint && hint.trim()) return hint.trim();
  const name = humanize(el.id || el.getAttribute('name'));
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
}

export function applyAccessibleNames(root) {
  const scope = root || document;
  let n = 0;
  scope.querySelectorAll('input, select, textarea').forEach((el) => {
    const label = accessibleNameFor(el);
    if (label) { el.setAttribute('aria-label', label); n++; }
  });
  scope.querySelectorAll('button').forEach((b) => {
    if (!b.textContent.trim() && !b.getAttribute('aria-label') && !b.getAttribute('title')) {
      const guess = humanize(b.id);
      if (guess) { b.setAttribute('aria-label', guess.charAt(0).toUpperCase() + guess.slice(1)); n++; }
    }
  });
  return n;
}

let _timer = null;
export function startAccessibleNames() {
  if (typeof document === 'undefined') return;
  const run = () => { _timer = null; applyAccessibleNames(document); };
  const schedule = () => { if (!_timer) _timer = setTimeout(run, 400); };
  run();
  if (typeof MutationObserver === 'function') new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
}
