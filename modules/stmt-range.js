import { formatDayMonthYear } from './date-format.js';
import { openDialog } from './dialog.js';

const SVG_RANGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>';
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function isValidRange(from, to) {
  return ISO.test(from) && ISO.test(to) && from <= to;
}

export function rangeLabel(from, to) {
  if (!from && !to) return 'All Time';
  const fmt = (iso) => {
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? iso : formatDayMonthYear(d);
  };
  return `${fmt(from)} \u2013 ${fmt(to)}`;
}

export function rangeBounds(from, to) {
  return {
    start: ISO.test(from || '') ? new Date(from + 'T00:00:00') : null,
    end: ISO.test(to || '') ? new Date(to + 'T23:59:59') : null
  };
}

export async function promptStatementRange({ title = 'Statement Range', min = '', max = '' } = {}) {
  const today = todayIso();
  const from = ISO.test(min) ? min : today;
  const to = ISO.test(max) ? max : today;
  const body = `<div class="dlg-range"><label class="dlg-range-field"><span class="dlg-range-label">From</span><input type="date" class="form-ctl dlg-input dlg-range-input" data-range="from" value="${esc(from)}" max="${esc(today)}"></label><label class="dlg-range-field"><span class="dlg-range-label">To</span><input type="date" class="form-ctl dlg-input dlg-range-input" data-range="to" value="${esc(to)}" max="${esc(today)}"></label></div><div class="dlg-error" data-range-error role="alert"></div>`;
  return openDialog({
    tone: 'primary',
    title,
    caption: 'Pick the dates to include',
    eyebrow: 'Date range',
    icon: SVG_RANGE,
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost', value: null },
      {
        label: 'Continue',
        variant: 'solid',
        value: true,
        guard: (overlay) => {
          const f = overlay.querySelector('[data-range="from"]').value;
          const t = overlay.querySelector('[data-range="to"]').value;
          const err = overlay.querySelector('[data-range-error]');
          if (!ISO.test(f) || !ISO.test(t)) { err.textContent = 'Choose both a From and a To date.'; return { ok: false }; }
          if (f > t) { err.textContent = 'The From date must be on or before the To date.'; return { ok: false }; }
          return { ok: true, value: { from: f, to: t } };
        }
      }
    ],
    dismissIndex: 0
  });
}
