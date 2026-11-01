const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (ch) => ENTITIES[ch]);

function dayParts(dkey) {
  const d = new Date(`${dkey}T00:00:00`);
  if (isNaN(d.getTime())) return { num: '', wk: '' };
  return { num: d.getDate(), wk: d.toLocaleDateString('en-US', { weekday: 'short' }) };
}

function rowHtml(r, first) {
  const { num, wk } = dayParts(r.dkey);
  return `<button type="button" class="row cm-row cm-${r.rKind}" data-id="${esc(r.id)}" onclick="openApprovalSheet(this.dataset.id)">` +
    `<span class="cm-date">${first ? `<b>${num}</b><span>${wk}</span>` : ''}</span>` +
    `<span class="cm-main"><span class="cm-title"><i class="cm-dot"></i>${esc(r.title)}${r.tag ? ' ' + r.tag : ''}</span><span class="cm-sub">${esc(r.sub)}</span></span>` +
    `<span class="cm-amt"><b class="${r.rIn ? 'is-in' : ''}">${r.rIn ? '+ ' : ''}${esc(r.amount)}</b><span>${esc(r.byline)}</span></span></button>`;
}

export function ledgerListHtml(rows) {
  const days = new Map();
  rows.slice().sort((a, b) => b.dkey.localeCompare(a.dkey) || b.ms - a.ms).forEach((r) => {
    if (!days.has(r.dkey)) days.set(r.dkey, []);
    days.get(r.dkey).push(r);
  });
  return [...days.entries()].map(([key, items]) => {
    const people = [...new Set(items.map((i) => i.submitter))].join(', ');
    return `<div class="card cm-day" data-day="${esc(key)}">${items.map((r, i) => rowHtml(r, i === 0)).join('')}` +
      `<div class="cm-day-foot"><span>${items.length} waiting \u00b7 ${esc(people)}</span>` +
      `<span class="cm-day-acts"><button type="button" class="btn cm-share cm-day-discard" data-day="${esc(key)}" onclick="discardDayPending(this.dataset.day)" title="Discard this day"><span>Discard</span></button>` +
      `<button type="button" class="btn cm-share cm-day-approve" data-day="${esc(key)}" onclick="approveDayPending(this.dataset.day)" title="Approve this day"><span>Approve</span></button></span></div></div>`;
  }).join('');
}

export function ledgerSheetHtml(m, actions) {
  const lines = m.lines.map((l) => `<div class="u-fs-sm2 u-text-muted">${esc(l)}</div>`).join('');
  const typeLine = m.typeLine ? `<div class="u-5d1cf22 text-xs">${esc(m.typeLine)}</div>` : '';
  const sect = m.sectionLines && m.sectionLines.length
    ? `<div class="u-5d1cf22 text-xs">${esc(m.sectionTitle)}</div>${m.sectionLines.map((l) => `<div class="u-fs-sm2 u-text-muted">${esc(l)}</div>`).join('')}`
    : '';
  const strip = `<div class="txn-balance-after txn-balance-neutral"><span>${esc(m.stripLabel)}</span><b>${esc(m.stripText)}</b></div>`;
  return '<div class="cm-sheet-grab" aria-hidden="true"></div>' +
    `<div class="cm-sheet-head"><div class="title title-md cm-sheet-title">${esc(m.title)}</div><div class="cm-sheet-amt${m.rIn ? ' is-in' : ''}">${m.rIn ? '+ ' : ''}${esc(m.amtText || '')}</div></div>` +
    `<div class="cm-sheet-body"><div class="cust-history-info">${lines}${typeLine}${sect}</div><div class="u-fs-sm2 u-text-muted">${esc(m.note)}</div></div>` +
    `${strip}<div class="cm-sheet-actions">${actions}</div>`;
}
