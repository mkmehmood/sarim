const SVG = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
export const dialogIcons = {
  question: SVG('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7"/><path d="M12 17h.01"/>'),
  trash: SVG('<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>'),
  warning: SVG('<path d="M10.3 3.9 2.4 17.6a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>'),
  error: SVG('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>'),
  success: SVG('<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.4 2.4 4.6-5"/>'),
  chevron: SVG('<path d="m9 6 6 6-6 6"/>')
};
const EYEBROWS = { primary: 'Confirmation', danger: 'Permanent action', warning: 'Warning', error: 'Error', success: 'Completed' };
const ROLES = { primary: 'dialog', success: 'dialog', danger: 'alertdialog', warning: 'alertdialog', error: 'alertdialog' };
const WARN_RE = /warning|insufficient|exceed|over-?collect|overpay|high credit|caution|unsaved|mismatch|cannot|can't|not enough|shortage|short by|already (used|sold|has)|outstanding/i;
const DELETE_RE = /delete|remove|erase|purge|discard|clear|wipe/i;
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const escapeHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let seq = 0;
let active = null;
let lockState = null;
export function isDialogOpen() {
  return !!document.querySelector('.dlg-overlay');
}
function lockPage() {
  if (lockState) return;
  lockState = { body: document.body.style.overflow, html: document.documentElement.style.overflow, inert: [] };
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  Array.from(document.body.children).forEach((node) => {
    if (node.classList && node.classList.contains('dlg-overlay')) return;
    if (node.tagName === 'SCRIPT' || node.hasAttribute('inert')) return;
    node.setAttribute('inert', '');
    lockState.inert.push(node);
  });
}
function unlockPage() {
  if (!lockState) return;
  document.body.style.overflow = lockState.body;
  document.documentElement.style.overflow = lockState.html;
  lockState.inert.forEach((node) => node.removeAttribute('inert'));
  lockState = null;
}
export function pickTone(title, message, danger, tone) {
  if (tone && EYEBROWS[tone]) return tone;
  if (danger) return 'danger';
  if (WARN_RE.test(String(title || '')) || /^\s*(warning|caution)/i.test(String(message || ''))) return 'warning';
  return 'primary';
}
function pickIcon(tone, title, confirmText) {
  if (tone === 'danger') return DELETE_RE.test(`${title} ${confirmText}`) ? dialogIcons.trash : dialogIcons.warning;
  if (tone === 'warning') return dialogIcons.warning;
  if (tone === 'error') return dialogIcons.error;
  if (tone === 'success') return dialogIcons.success;
  return dialogIcons.question;
}
const LEADING_GLYPHS = /^[\s\u00A0\u2190-\u21FF\u2600-\u27BF\uFE0F\u{1F300}-\u{1FAFF}]+/u;
const BULLET_RE = /^[\u2022\u00B7\u25CF*\-\u2013]\s+(.+)$/;
const NOTE_RE = /^(warning|note|caution|important):\s+(.+)$/i;
const FACT_RE = /^([A-Za-z0-9][A-Za-z0-9 ()/&'.\u2019-]{0,32}):\s+(.{1,70})$/;
export function formatMessage(message) {
  const lines = String(message == null ? '' : message).replace(/\r/g, '').split('\n').map((l) => l.replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, ''));
  const out = [];
  let facts = null;
  let points = null;
  let paragraphs = 0;
  const flush = () => {
    if (facts) { out.push(`<dl class="dlg-facts">${facts.join('')}</dl>`); facts = null; }
    if (points) { out.push(`<ul class="dlg-points">${points.join('')}</ul>`); points = null; }
  };
  const callout = (kind, label, text) => out.push(`<div class="dlg-callout dlg-callout--${kind}" role="note"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(text)}</span></div>`);
  lines.forEach((raw) => {
    if (!raw) { flush(); return; }
    if (/^\u26A0/.test(raw)) { flush(); callout('warning', 'Warning', raw.replace(LEADING_GLYPHS, '')); return; }
    if (/^[\u21A9\u2139]/.test(raw)) { flush(); callout('info', 'Note', raw.replace(LEADING_GLYPHS, '')); return; }
    const line = raw.replace(LEADING_GLYPHS, '') || raw;
    const bullet = line.match(BULLET_RE);
    if (bullet) { if (facts) flush(); (points = points || []).push(`<li>${escapeHtml(bullet[1])}</li>`); return; }
    if (/^this (action )?cannot be undone\.?$/i.test(line)) { flush(); callout('danger', 'Permanent', line); return; }
    const note = line.match(NOTE_RE);
    if (note) { flush(); callout(/^(note|important)$/i.test(note[1]) ? 'info' : 'warning', note[1][0].toUpperCase() + note[1].slice(1).toLowerCase(), note[2]); return; }
    const fact = line.match(FACT_RE);
    if (fact && !/^https?$/i.test(fact[1])) { if (points) flush(); (facts = facts || []).push(`<div><dt>${escapeHtml(fact[1])}</dt><dd>${escapeHtml(fact[2])}</dd></div>`); return; }
    flush();
    if (/:$/.test(line)) { out.push(`<p class="dlg-subhead">${escapeHtml(line)}</p>`); return; }
    out.push(`<p class="${paragraphs === 0 && !out.length ? 'dlg-lead' : 'dlg-text'}">${escapeHtml(line)}</p>`);
    paragraphs += 1;
  });
  flush();
  return out.join('');
}
function closeActive() {
  if (active) active.force();
}
export function openDialog({ tone = 'primary', title = '', eyebrow = null, icon = null, body = '', actions = [], dismissIndex = -1, dismissOnBackdrop = true, focusIndex = -1, onBodyClick = null }) {
  return new Promise((resolve) => {
    closeActive();
    const id = `dlg-${++seq}`;
    const previous = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'dlg-overlay';
    overlay.dataset.tone = tone;
    const buttons = actions.map((a, i) => `<button type="button" class="dlg-btn dlg-btn--${a.variant === 'solid' ? 'solid' : 'ghost'}" data-act="${i}"${i === dismissIndex ? ' data-dlg-cancel' : ''}>${escapeHtml(a.label)}</button>`).join('');
    overlay.innerHTML = `<div class="dlg" role="${ROLES[tone] || 'dialog'}" aria-modal="true" aria-labelledby="${id}-t" aria-describedby="${id}-b" data-tone="${tone}" tabindex="-1"><header class="dlg-head"><span class="dlg-glyph">${icon || pickIcon(tone, title, '')}</span><div class="dlg-heading"><span class="dlg-eyebrow">${escapeHtml(eyebrow || EYEBROWS[tone] || '')}</span><h2 class="dlg-title" id="${id}-t">${escapeHtml(String(title).trim())}</h2></div></header><div class="dlg-body" id="${id}-b">${body}</div><footer class="dlg-foot">${buttons}</footer></div>`;
    const dialog = overlay.firstElementChild;
    let settled = false;
    const finish = (value, immediate) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKey, true);
      active = null;
      overlay.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      const remove = () => {
        overlay.remove();
        if (!isDialogOpen()) unlockPage();
        if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
          try { previous.focus({ preventScroll: true }); } catch (_) {}
        }
      };
      if (immediate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) remove();
      else {
        overlay.classList.add('is-closing');
        setTimeout(remove, 150);
      }
      resolve(value);
    };
    const dismissValue = dismissIndex >= 0 && actions[dismissIndex] ? actions[dismissIndex].value : null;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(dismissValue);
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(dialog.querySelectorAll(FOCUSABLE)).filter((n) => !n.disabled && n.offsetParent !== null);
      if (!items.length) { e.preventDefault(); dialog.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    overlay.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-act]');
      if (btn && !btn.dataset.opt) { finish(actions[Number(btn.dataset.act)].value); return; }
      const opt = e.target.closest('[data-opt]');
      if (opt && onBodyClick) { finish(onBodyClick(Number(opt.dataset.opt))); return; }
      if (e.target === overlay && dismissOnBackdrop) finish(dismissValue);
    });
    overlay.addEventListener('touchmove', (e) => {
      if (!e.target.closest('.dlg-body')) e.preventDefault();
    }, { passive: false });
    overlay.addEventListener('wheel', (e) => {
      if (!e.target.closest('.dlg-body')) e.preventDefault();
    }, { passive: false });
    active = { force: () => finish(dismissValue, true) };
    lockPage();
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => {
      const items = Array.from(dialog.querySelectorAll('[data-act],[data-opt]'));
      const target = focusIndex >= 0 ? dialog.querySelector(`[data-act="${focusIndex}"]`) : items[0];
      try { (target || dialog).focus({ preventScroll: true }); } catch (_) {}
    });
  });
}
export function showGlassConfirm(message, { title = 'Confirm', confirmText = 'Confirm', cancelText = 'Cancel', danger = false, icon = null, tone = null, alertOnly = false } = {}) {
  const resolvedTone = pickTone(title, message, danger, tone);
  const svg = (icon && String(icon).indexOf('<') !== -1) ? icon : pickIcon(resolvedTone, title, confirmText);
  const actions = alertOnly
    ? [{ label: confirmText, variant: 'solid', value: true }]
    : [{ label: cancelText, variant: 'ghost', value: false }, { label: confirmText, variant: 'solid', value: true }];
  const safeFirst = !alertOnly && resolvedTone === 'danger';
  return openDialog({
    tone: resolvedTone,
    title,
    icon: svg,
    body: formatMessage(message),
    actions,
    dismissIndex: 0,
    dismissOnBackdrop: !safeFirst,
    focusIndex: safeFirst ? 0 : actions.length - 1
  });
}
const ALERT_TITLES = { success: 'Success', warning: 'Warning', error: 'Something went wrong' };
export function showGlassAlert(message, { title = null, tone = 'warning', buttonText = 'OK', icon = null } = {}) {
  const t = ['success', 'warning', 'error'].includes(tone) ? tone : 'warning';
  return showGlassConfirm(message, { title: title || ALERT_TITLES[t], confirmText: buttonText, tone: t, icon, alertOnly: true });
}
export function showChoiceDialog(message, choices, { title = 'Choose', cancelText = 'Cancel', icon = null } = {}) {
  const list = Array.isArray(choices) ? choices : [];
  const options = list.map((c, i) => `<li><button type="button" class="dlg-option" data-opt="${i}" data-act="${i + 1}">${c.icon ? `<span class="dlg-option-icon" aria-hidden="true">${c.icon}</span>` : ''}<span class="dlg-option-label">${escapeHtml(c.label)}</span><span class="dlg-option-go" aria-hidden="true">${dialogIcons.chevron}</span></button></li>`).join('');
  return openDialog({
    tone: 'primary',
    title,
    icon: icon && String(icon).indexOf('<') !== -1 ? icon : dialogIcons.question,
    body: `${formatMessage(message)}<ul class="dlg-options">${options}</ul>`,
    actions: [{ label: cancelText, variant: 'ghost', value: null }],
    dismissIndex: 0,
    focusIndex: -1,
    onBodyClick: (i) => (list[i] ? list[i].value : null)
  });
}
export function splitFigures(message) {
  return String(message == null ? '' : message)
    .replace(/[.!]?\s+(?=(?:Available|Current balance):)/g, '\n')
    .replace(/\s*(?:\u2014|,|\.)\s+(?=(?:Required|Requested|Shortage|Extra required)\b[^:]*:)/g, '\n');
}
export function alertTitle(message, tone) {
  const m = String(message || '');
  if (/cash in hand/i.test(m)) return 'Low cash in hand';
  if (/insufficient|not enough|not in raw material|short by|shortage/i.test(m) && /inventory|material|stock|units|kg/i.test(m)) return tone === 'error' ? 'Low inventory' : 'Inventory warning';
  if (/credit/i.test(m)) return tone === 'error' ? 'Credit error' : 'Credit warning';
  if (/cannot delete|cannot be deleted|cannot change|cannot be edited/i.test(m)) return 'Action not allowed';
  if (/payment/i.test(m)) return tone === 'error' ? 'Payment error' : 'Payment warning';
  return null;
}
export function notifyBlocking(message, tone = 'warning', title = null) {
  return showGlassAlert(splitFigures(message), { tone, title: title || alertTitle(message, tone) });
}
window.showGlassConfirm = showGlassConfirm;
window.showGlassAlert = showGlassAlert;
window.showChoiceDialog = showChoiceDialog;
window.notifyBlocking = notifyBlocking;
window.isDialogOpen = isDialogOpen;
