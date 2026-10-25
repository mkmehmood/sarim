import { dialogFeedback } from './feedback.js';
const SVG = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

export const dialogIcons = {
  question: SVG('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7"/><path d="M12 17h.01"/>'),
  trash: SVG('<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>'),
  warning: SVG('<path d="M10.3 3.9 2.4 17.6a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 17h.01"/>'),
  error: SVG('<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>'),
  success: SVG('<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.4 2.4 4.6-5"/>'),
  chevron: SVG('<path d="m9 6 6 6-6 6"/>'),
  lock: SVG('<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/><path d="M12 15v2"/>'),
  eye: SVG('<path d="M2.5 12C5.5 7.5 8.8 5.5 12 5.5S18.5 7.5 21.5 12c-3 4.5-6.3 6.5-9.5 6.5S5.5 16.5 2.5 12Z"/><circle cx="12" cy="12" r="3"/><path class="dlg-eye-slash" d="M4 4l16 16"/>')
};

const EYEBROWS = { primary: 'Confirm', danger: 'Permanent', warning: 'Warning', error: 'Error', success: 'Success' };
const CAPTIONS = { primary: 'Review before you continue', danger: 'This action is permanent', warning: 'Needs your attention', error: 'The action could not be completed', success: 'All done' };
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
let flowActive = false;
const endFlowOnInput = (e) => { if (!isDialogOpen() && !(e.target && e.target.closest && e.target.closest('.dlg-overlay'))) flowActive = false; };
['pointerdown', 'keydown', 'touchstart'].forEach((name) => document.addEventListener(name, endFlowOnInput, true));
export function isDialogFlowActive() {
  return flowActive || isDialogOpen();
}

function lockPage() {
  if (lockState) return;
  lockState = { body: document.body.classList.contains('scroll-locked'), html: document.documentElement.classList.contains('scroll-locked'), inert: [] };
  document.body.classList.add('scroll-locked');
  document.documentElement.classList.add('scroll-locked');
  Array.from(document.body.children).forEach((node) => {
    if (node.classList && node.classList.contains('dlg-overlay')) return;
    if (node.tagName === 'SCRIPT' || node.hasAttribute('inert')) return;
    node.setAttribute('inert', '');
    lockState.inert.push(node);
  });
}

function unlockPage() {
  if (!lockState) return;
  document.body.classList.toggle('scroll-locked', lockState.body);
  document.documentElement.classList.toggle('scroll-locked', lockState.html);
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
const FIGURE_PRIORITY = [/^new total$/i, /^total( value| sold)?$/i, /^amount$/i, /^total cost$/i, /^required/i, /^overpayment$/i, /^collecting$/i, /^this credit sale$/i, /^credit sales?$/i, /^net profit$/i];

export function humanizeKeys(text) {
  const s = String(text == null ? '' : text);
  if (typeof window.getStoreLabel !== 'function') return s;
  return s.replace(/\bSTORE_[A-Z0-9_]+\b/g, (k) => window.getStoreLabel(k) || k);
}

export function parseMessage(message) {
  const lines = humanizeKeys(message).replace(/\r/g, '').split('\n').map((l) => l.replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, ''));
  const blocks = [];
  let facts = null;
  let points = null;
  let paragraphs = 0;
  const flush = () => {
    if (facts) { blocks.push({ type: 'facts', items: facts }); facts = null; }
    if (points) { blocks.push({ type: 'points', items: points }); points = null; }
  };
  const callout = (kind, label, text) => blocks.push({ type: 'callout', kind, label, text });
  lines.forEach((raw) => {
    if (!raw) { flush(); return; }
    if (/^\u26A0/.test(raw)) { flush(); callout('warning', 'Warning', raw.replace(LEADING_GLYPHS, '')); return; }
    if (/^[\u21A9\u2139]/.test(raw)) { flush(); callout('info', 'Note', raw.replace(LEADING_GLYPHS, '')); return; }
    const line = raw.replace(LEADING_GLYPHS, '') || raw;
    const bullet = line.match(BULLET_RE);
    if (bullet) { if (facts) flush(); (points = points || []).push(bullet[1]); return; }
    if (/^this (action )?cannot be undone\.?$/i.test(line)) { flush(); callout('danger', 'Permanent', line); return; }
    const note = line.match(NOTE_RE);
    if (note) { flush(); callout(/^(note|important)$/i.test(note[1]) ? 'info' : 'warning', note[1][0].toUpperCase() + note[1].slice(1).toLowerCase(), note[2]); return; }
    const fact = line.match(FACT_RE);
    if (fact && !/^https?$/i.test(fact[1])) { if (points) flush(); (facts = facts || []).push({ k: fact[1], v: fact[2] }); return; }
    flush();
    if (/:$/.test(line)) { blocks.push({ type: 'subhead', text: line }); return; }
    blocks.push({ type: 'p', text: line, lead: paragraphs === 0 && !blocks.length });
    paragraphs += 1;
  });
  flush();
  let figure = null;
  for (const re of FIGURE_PRIORITY) {
    for (const blk of blocks) {
      if (blk.type !== 'facts') continue;
      const idx = blk.items.findIndex((f) => re.test(f.k) && /\d/.test(f.v) && f.v.length <= 18);
      if (idx >= 0) { figure = blk.items.splice(idx, 1)[0]; break; }
    }
    if (figure) break;
  }
  return { blocks: blocks.filter((blk) => blk.type !== 'facts' || blk.items.length), figure };
}

export function renderBlocks(blocks) {
  return blocks.map((blk) => {
    if (blk.type === 'facts') {
      if (blk.items.length <= 3) return `<dl class="dlg-meta">${blk.items.map((f) => `<div><dt>${escapeHtml(f.k)}</dt><dd>${escapeHtml(f.v)}</dd></div>`).join('')}</dl>`;
      return `<dl class="dlg-facts">${blk.items.map((f) => `<div><dt>${escapeHtml(f.k)}</dt><dd>${escapeHtml(f.v)}</dd></div>`).join('')}</dl>`;
    }
    if (blk.type === 'points') return `<ul class="dlg-points">${blk.items.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ul>`;
    if (blk.type === 'callout') return `<div class="dlg-callout dlg-callout--${blk.kind}" role="note"><strong>${escapeHtml(blk.label)}</strong><span>${escapeHtml(blk.text)}</span></div>`;
    if (blk.type === 'subhead') return `<p class="dlg-subhead">${escapeHtml(blk.text)}</p>`;
    return `<p class="${blk.lead ? 'dlg-lead' : 'dlg-text'}">${escapeHtml(blk.text)}</p>`;
  }).join('');
}

export function formatMessage(message) {
  return renderBlocks(parseMessage(message).blocks);
}

function closeActive() {
  if (active) active.force();
}

export function dialogMarkup({ tone = 'primary', title = '', eyebrow = null, caption = null, icon = null, body = '', figure = null, actions = [], dismissIndex = -1 }, id = 'dlg-x') {
    const buttons = actions.map((a, i) => `<button type="button" class="dlg-btn dlg-btn--${a.variant === 'solid' ? 'solid' : 'ghost'}" data-act="${i}"${i === dismissIndex ? ' data-dlg-cancel' : ''}>${escapeHtml(a.label)}</button>`).join('');
    const glyph = icon || pickIcon(tone, title, '');
    const figureHtml = figure ? `<div class="dlg-figure"><span class="dlg-figure-label">${escapeHtml(figure.k)}</span><strong class="dlg-figure-value">${escapeHtml(figure.v)}</strong></div>` : '';
    return `<div class="dlg" role="${ROLES[tone] || 'dialog'}" aria-modal="true" aria-labelledby="${id}-t" aria-describedby="${id}-b" data-tone="${tone}" tabindex="-1"><div class="dlg-chip"><span class="dlg-chip-icon" aria-hidden="true">${glyph}</span><span>${escapeHtml(eyebrow || EYEBROWS[tone] || '')}</span></div><div class="dlg-card"><div class="dlg-top"><span class="dlg-glyph" aria-hidden="true">${glyph}</span><span class="dlg-caption">${escapeHtml(caption || CAPTIONS[tone] || '')}</span></div><h2 class="title dlg-title" id="${id}-t">${escapeHtml(humanizeKeys(String(title)).trim())}</h2><div class="dlg-body" id="${id}-b">${body}</div><footer class="dlg-foot${figure ? ' has-figure' : ''}">${figureHtml}<div class="dlg-actions">${buttons}</div></footer></div></div>`;
}

export function openDialog({ tone = 'primary', title = '', eyebrow = null, caption = null, icon = null, body = '', figure = null, actions = [], dismissIndex = -1, dismissOnBackdrop = true, focusIndex = -1, onBodyClick = null }) {
  return new Promise((resolve) => {
    closeActive();
    const id = `dlg-${++seq}`;
    const previous = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'dlg-overlay';
    overlay.dataset.tone = tone;
    overlay.innerHTML = dialogMarkup({ tone, title, eyebrow, caption, icon, body, figure, actions, dismissIndex }, id);
    const dialog = overlay.firstElementChild;
    let settled = false;
    let guarding = false;
    const finish = (value, immediate, kind) => {
      if (settled) return;
      settled = true;
      if (kind) dialogFeedback(kind, tone);
      flowActive = true;
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
        finish(dismissValue, false, 'cancel');
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
      if (btn && !btn.dataset.opt) {
        const act = actions[Number(btn.dataset.act)];
        const kind = act.variant === 'solid' ? 'confirm' : 'cancel';
        if (typeof act.guard !== 'function') { finish(act.value, false, kind); return; }
        if (guarding) return;
        guarding = true;
        btn.disabled = true;
        Promise.resolve(act.guard(overlay)).then((res) => {
          guarding = false;
          btn.disabled = false;
          if (res && res.ok) finish(res.value, false, kind);
        }).catch(() => { guarding = false; btn.disabled = false; });
        return;
      }
      const opt = e.target.closest('[data-opt]');
      if (opt && onBodyClick) { finish(onBodyClick(Number(opt.dataset.opt)), false, 'select'); return; }
      if (e.target === overlay && dismissOnBackdrop) finish(dismissValue, false, 'cancel');
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
    dialogFeedback('open', tone);
    const chip = dialog.querySelector('.dlg-chip');
    const fitNotch = () => {
      dialog.style.setProperty('--nw', `${Math.ceil(chip.offsetWidth) + 10}px`);
      dialog.style.setProperty('--nh', `${Math.ceil(chip.offsetHeight) + 10}px`);
    };
    fitNotch();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitNotch);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => {
      const items = Array.from(dialog.querySelectorAll('[data-act],[data-opt]'));
      const target = focusIndex >= 0 ? dialog.querySelector(`[data-act="${focusIndex}"]`) : items[0];
      try { (target || dialog).focus({ preventScroll: true }); } catch (_) {}
    });
  });
}

const CHECK_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

function checkboxMarkup(cb) {
  return `<label class="dlg-check"><input type="checkbox" class="dlg-check-input" data-dlg-check${cb.checked ? ' checked' : ''}><span class="dlg-check-box">${CHECK_GLYPH}</span><span class="dlg-check-text">${escapeHtml(cb.label)}</span></label>`;
}

export function showGlassConfirm(message, { title = null, confirmText = 'Confirm', cancelText = 'Cancel', danger = false, icon = null, tone = null, alertOnly = false, checkbox = null } = {}) {
  const shownTitle = requireTitle(title);
  const resolvedTone = pickTone(shownTitle, message, danger, tone);
  const svg = (icon && String(icon).indexOf('<') !== -1) ? icon : pickIcon(resolvedTone, shownTitle, confirmText);
  const useCheck = !!checkbox && !alertOnly;
  const confirmAction = { label: confirmText, variant: 'solid', value: true };
  if (useCheck) {
    confirmAction.guard = (overlay) => {
      const box = overlay.querySelector('[data-dlg-check]');
      if (typeof checkbox.onResult === 'function') checkbox.onResult(!!(box && box.checked));
      return { ok: true, value: true };
    };
  }
  const actions = alertOnly
    ? [{ label: confirmText, variant: 'solid', value: true }]
    : [{ label: cancelText, variant: 'ghost', value: false }, confirmAction];
  const safeFirst = !alertOnly && resolvedTone === 'danger';
  const parsed = parseMessage(message);
  const bodyHtml = renderBlocks(parsed.blocks) + (useCheck ? checkboxMarkup(checkbox) : '');
  const pending = openDialog({
    tone: resolvedTone,
    title: shownTitle,
    icon: svg,
    body: bodyHtml,
    figure: parsed.figure,
    actions,
    dismissIndex: 0,
    dismissOnBackdrop: !safeFirst,
    focusIndex: safeFirst ? 0 : actions.length - 1
  });
  if (useCheck) {
    const overlays = document.querySelectorAll('.dlg-overlay');
    const overlay = overlays[overlays.length - 1];
    const box = overlay && overlay.querySelector('[data-dlg-check]');
    const btn = overlay && overlay.querySelector(`[data-act="${actions.length - 1}"]`);
    if (box && btn) {
      const sync = () => { btn.textContent = box.checked && checkbox.confirmTextChecked ? checkbox.confirmTextChecked : confirmText; };
      box.addEventListener('change', sync);
      sync();
    }
  }
  return pending.then((value) => {
    announce(message, resolvedTone, shownTitle, alertOnly ? '' : (value === true ? `Confirmed: ${confirmText}` : `Chosen: ${cancelText}`));
    return value;
  });
}

export function showPasswordConfirm({ title = null, message = '', email = '', confirmText = 'Confirm', cancelText = 'Cancel', inputId = '_dlg_pwd_input', verify = null } = {}) {
  const shownTitle = requireTitle(title);
  const errId = `${inputId}_err`;
  const account = email ? `<p class="dlg-account">Account: <strong>${escapeHtml(email)}</strong></p>` : '';
  const body = `${formatMessage(message)}${account}<div class="dlg-field"><input type="password" id="${inputId}" class="form-ctl dlg-input" placeholder="Your account password" autocomplete="current-password" autocapitalize="none" spellcheck="false"><button type="button" class="btn dlg-eye" id="${inputId}_eye" aria-label="Show password">${dialogIcons.eye}</button></div><div class="dlg-error" id="${errId}" role="alert" aria-live="polite"></div>`;
  const guard = async (overlay) => {
    const input = overlay.querySelector(`#${inputId}`);
    const err = overlay.querySelector(`#${errId}`);
    const okBtn = overlay.querySelector('.dlg-btn--solid');
    const pwd = input ? input.value : '';
    if (!pwd) { err.textContent = 'Please enter your password.'; dialogFeedback('reject'); if (input) input.focus(); return { ok: false }; }
    err.textContent = '';
    const label = okBtn.textContent;
    okBtn.textContent = 'Verifying\u2026';
    let valid = false;
    try { valid = typeof verify === 'function' ? !!(await verify(pwd)) : true; } catch (_) { valid = false; }
    okBtn.textContent = label;
    if (!valid) {
      err.textContent = 'Incorrect password. Please try again.';
      dialogFeedback('reject');
      if (input) { input.value = ''; input.focus(); }
      return { ok: false };
    }
    return { ok: true, value: pwd };
  };
  const result = openDialog({
    tone: 'primary',
    title: shownTitle,
    caption: 'Account password required',
    icon: dialogIcons.lock,
    body,
    actions: [{ label: cancelText, variant: 'ghost', value: null }, { label: confirmText, variant: 'solid', value: null, guard }],
    dismissIndex: 0,
    dismissOnBackdrop: false,
    focusIndex: -1
  }).then((value) => {
    announce(`${message}${email ? `\nAccount: ${email}` : ''}`, 'primary', shownTitle, value ? `Confirmed: ${confirmText}` : `Chosen: ${cancelText}`);
    return value;
  });
  const input = document.getElementById(inputId);
  const eye = document.getElementById(`${inputId}_eye`);
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const okBtn = input.closest('.dlg-overlay').querySelector('.dlg-btn--solid');
      if (okBtn && !okBtn.disabled) okBtn.click();
    });
    setTimeout(() => { try { input.focus({ preventScroll: true }); } catch (_) {} }, 80);
  }
  if (eye && input) {
    eye.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      eye.classList.toggle('on', show);
      eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  }
  return result;
}

export function showGlassAlert(message, { title = null, tone, buttonText = 'OK', icon = null } = {}) {
  const t = ['success', 'warning', 'error'].includes(tone) ? tone : 'warning';
  return showGlassConfirm(message, { title, confirmText: buttonText, tone: t, icon, alertOnly: true });
}

export function showChoiceDialog(message, choices, { title = null, cancelText = 'Cancel', icon = null } = {}) {
  const list = Array.isArray(choices) ? choices : [];
  const shownTitle = requireTitle(title);
  const options = list.map((c, i) => `<li><button type="button" class="dlg-option" data-opt="${i}" data-act="${i + 1}">${c.icon ? `<span class="dlg-option-icon" aria-hidden="true">${c.icon}</span>` : ''}<span class="dlg-option-label">${escapeHtml(c.label)}</span><span class="dlg-option-go" aria-hidden="true">${dialogIcons.chevron}</span></button></li>`).join('');
  return openDialog({
    tone: 'primary',
    title: shownTitle,
    icon: icon && String(icon).indexOf('<') !== -1 ? icon : dialogIcons.question,
    body: `${formatMessage(message)}<ul class="dlg-options">${options}</ul>`,
    actions: [{ label: cancelText, variant: 'ghost', value: null }],
    dismissIndex: 0,
    focusIndex: -1,
    onBodyClick: (i) => (list[i] ? list[i].value : null)
  }).then((value) => {
    const picked = value == null ? null : list.find((c) => c.value === value);
    announce(message, 'primary', shownTitle, `Chosen: ${picked ? picked.label : cancelText}`);
    return value;
  });
}

export function splitFigures(message) {
  return String(message == null ? '' : message)
    .replace(/[.!]?\s+(?=(?:Available|Current balance):)/g, '\n')
    .replace(/\s*(?:\u2014|,|\.)\s+(?=(?:Required|Requested|Shortage|Extra required)\b[^:]*:)/g, '\n');
}

export function notifyBlocking(message, tone, title) {
  return showGlassAlert(splitFigures(message), { tone, title });
}
const TONE_LINES = { warning: CAPTIONS.warning, danger: CAPTIONS.danger, error: CAPTIONS.error };
function requireTitle(title) {
  const text = humanizeKeys(String(title == null ? '' : title)).trim();
  if (!text) throw new TypeError('A dialog title is required');
  return text;
}
export function describeForDevice(message, { tone = 'warning', title = null, action = '' } = {}) {
  const t = EYEBROWS[tone] ? tone : 'warning';
  const parsed = parseMessage(splitFigures(message));
  const lines = [];
  const figureLine = parsed.figure ? `${parsed.figure.k}: ${parsed.figure.v}` : '';
  let figureDone = !figureLine;
  parsed.blocks.forEach((blk) => {
    if (blk.type === 'facts') blk.items.forEach((f) => lines.push(`${f.k}: ${f.v}`));
    else if (blk.type === 'points') blk.items.forEach((x) => lines.push(`\u2022 ${x}`));
    else if (blk.type === 'callout') lines.push(`${blk.label}: ${blk.text}`);
    else lines.push(blk.text);
    if (!figureDone && (blk.type === 'p' || blk.type === 'subhead')) { lines.push(figureLine); figureDone = true; }
  });
  if (!figureDone) lines.unshift(figureLine);
  if (TONE_LINES[t]) lines.unshift(TONE_LINES[t]);
  if (action) lines.unshift(action);
  return { tone: t, title: requireTitle(title), body: lines.join('\n') };
}
function announce(message, tone, title, action) {
  if (typeof window.notifyFromDialog !== 'function') return;
  try { window.notifyFromDialog(describeForDevice(message, { tone, title, action })); } catch (_) {}
}
window.showGlassConfirm = showGlassConfirm;
window.showGlassAlert = showGlassAlert;
window.showChoiceDialog = showChoiceDialog;
window.showPasswordConfirm = showPasswordConfirm;
window.notifyBlocking = notifyBlocking;
window.isDialogOpen = isDialogOpen;
window.isDialogFlowActive = isDialogFlowActive;
