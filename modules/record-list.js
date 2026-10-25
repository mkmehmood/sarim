const esc = (v) => (v == null ? '' : String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

const HUES = [158, 199, 262, 330, 24, 48, 186, 292];

export function rlInitials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const first = Array.from(words[0])[0] || '?';
  const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] || '') : '';
  return (first + last).toUpperCase();
}

export function rlHue(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

export function rlPhoto(photos, key) {
  if (!photos || typeof photos !== 'object' || !key) return '';
  const v = photos[key];
  return typeof v === 'string' && /^data:image\//i.test(v) ? v : '';
}

export function rlJsArg(value) {
  return esc(String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/'/g, "\\'"));
}

export function rlRowHtml(opts) {
  const tone = opts.tone || 'muted';
  const details = (opts.details || []).filter(Boolean).map((d) => `<span class="rl-detail">${d}</span>`).join('');
  const badges = (opts.badges || []).filter(Boolean).join('');
  const avatar = opts.avatar === 'none'
    ? ''
    : `<div class="rl-av${opts.photo ? ' has-photo' : ''}" style="--rl-hue:${rlHue(opts.name)}" aria-hidden="true">${esc(rlInitials(opts.name))}`
      + (opts.photo && /^data:image\//i.test(opts.photo)
        ? `<img src="${esc(opts.photo)}" alt="" loading="lazy" decoding="async" onerror="this.parentNode.classList.remove('has-photo');this.remove()">`
        : '')
      + `</div>`;
  const open = opts.onOpen
    ? ` role="button" tabindex="0" onclick="if(!event.target.closest('a,button'))${opts.onOpen}" onkeydown="if(event.key==='Enter'&&!event.target.closest('a,button')){event.preventDefault();${opts.onOpen}}"`
    : '';
  return `<div class="row rl-row is-${tone}${opts.onOpen ? ' is-open' : ''}"${open}>`
    + avatar
    + `<div class="rl-main"><div class="rl-name-line"><span class="rl-name">${esc(opts.name || '')}</span>${badges}</div>`
    + (details ? `<div class="rl-details">${details}</div>` : '')
    + `</div>`
    + `<div class="rl-end"><div class="rl-amt">${opts.amount == null ? '' : opts.amount}</div>`
    + (opts.tag ? `<div class="rl-tag">${esc(opts.tag)}</div>` : '')
    + `</div></div>`;
}

export function rlEmptyHtml(title, hint) {
  return `<div class="rl-empty"><div class="rl-empty-title">${esc(title)}</div>${hint ? `<div class="rl-empty-hint">${esc(hint)}</div>` : ''}</div>`;
}

export function rlDetailDate(label, text) {
  return text && text !== '-' ? `<span class="rl-muted">${esc(label)} ${esc(text)}</span>` : '';
}
