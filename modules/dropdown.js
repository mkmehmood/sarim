(function () {
  'use strict';
  if (window.Dropdown) return;

  const GAP = 6;
  const EDGE = 8;
  const MIN_H = 96;
  const MAX_H = 280;
  const SUGGEST_SEL = '.u-327750f, .u-search-dropdown';
  const open = new Map();
  let layer = null;
  let frame = 0;

  function getLayer() {
    if (layer && layer.isConnected) return layer;
    layer = document.createElement('div');
    layer.className = 'dd-layer';
    document.body.appendChild(layer);
    return layer;
  }

  function viewTop() {
    return window.visualViewport ? window.visualViewport.offsetTop : 0;
  }

  function viewBottom() {
    const vv = window.visualViewport;
    return vv ? Math.min(window.innerHeight, vv.offsetTop + vv.height) : window.innerHeight;
  }

  function findAnchor(home) {
    const parent = home.parentElement;
    if (!parent) return null;
    let n = home.previousElementSibling;
    while (n) {
      const input = n.matches('input, textarea') ? n : n.querySelector('input, textarea');
      if (input) return n.matches('input, textarea') ? (n.closest('.pf-control') || n) : n;
      n = n.previousElementSibling;
    }
    const field = parent.querySelector('input[type="text"], input:not([type]), textarea');
    return field ? (field.closest('.pf-control') || field) : parent;
  }

  function place(rec) {
    const { el, anchor, align } = rec;
    if (!anchor.isConnected) return false;
    const r = anchor.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const below = viewBottom() - r.bottom - GAP - EDGE;
    const above = r.top - viewTop() - GAP - EDGE;
    const want = Math.min(MAX_H, el.scrollHeight || MAX_H);
    const flip = below < Math.min(want, 180) && above > below;
    const room = Math.max(MIN_H, Math.min(MAX_H, flip ? above : below));
    const h = Math.min(room, want);
    let w = r.width;
    let left = r.left;
    if (align === 'end') {
      w = Math.max(168, el.offsetWidth || 168);
      left = r.right - w;
    }
    left = Math.max(EDGE, Math.min(left, vw - w - EDGE));
    const top = flip ? Math.max(viewTop() + EDGE, r.top - GAP - h) : r.bottom + GAP;
    const s = el.style;
    s.setProperty('--dd-top', Math.round(top) + 'px');
    s.setProperty('--dd-left', Math.round(left) + 'px');
    s.setProperty('--dd-w', Math.round(w) + 'px');
    s.setProperty('--dd-mh', Math.round(room) + 'px');
    el.classList.toggle('is-flipped', flip);
    return true;
  }

  function reposition() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      open.forEach((rec, el) => {
        if (!el.isConnected || !place(rec)) hide(el);
      });
    });
  }

  function show(el, anchor, options) {
    if (!el) return;
    const opts = options || {};
    let rec = open.get(el);
    if (!rec) {
      const home = document.createComment('dd');
      if (el.parentNode) el.parentNode.insertBefore(home, el);
      const a = anchor || (el._ddAnchor) || findAnchor(home);
      if (!a) return;
      rec = { el, anchor: a, home, align: opts.align || 'start', onClose: opts.onClose || null };
      open.set(el, rec);
      el._ddAnchor = a;
    } else {
      if (anchor) rec.anchor = anchor;
      if (opts.align) rec.align = opts.align;
    }
    el.classList.remove('hidden', 'd-none');
    if (el.parentNode !== getLayer()) getLayer().appendChild(el);
    el.classList.add('dd-open');
    place(rec);
    requestAnimationFrame(() => {
      if (open.has(el)) {
        place(rec);
        el.classList.add('is-in');
      }
    });
  }

  function hide(el) {
    if (!el) return;
    const rec = open.get(el);
    el.classList.remove('is-in', 'dd-open');
    el.classList.add('hidden');
    if (!rec) return;
    open.delete(el);
    if (rec.home.parentNode) rec.home.parentNode.insertBefore(el, rec.home);
    else if (el.parentNode === layer) el.remove();
    if (rec.onClose) rec.onClose();
  }

  function hideAll(except) {
    Array.from(open.keys()).forEach((el) => { if (el !== except) hide(el); });
  }

  function menu(cfg) {
    const { id, anchor, items, onSelect } = cfg;
    const wide = !!cfg.wide;
    let el = document.getElementById(id);
    if (el && open.has(el)) { hide(el); return el; }
    hideAll();
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.setAttribute('role', 'listbox');
      el.className = 'dd-menu' + (wide ? ' dd-wide' : '');
      (anchor || document.body).appendChild(el);
    }
    el.textContent = '';
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'dd-item';
      row.setAttribute('role', 'option');
      row.dataset.val = String(item.value);
      const body = document.createElement('div');
      body.className = 'dd-body';
      const title = document.createElement('div');
      title.className = 'dd-title';
      title.textContent = item.label;
      body.appendChild(title);
      if (item.desc) {
        const desc = document.createElement('div');
        desc.className = 'dd-desc';
        desc.textContent = item.desc;
        body.appendChild(desc);
      }
      const tick = document.createElement('span');
      tick.className = 'dd-tick';
      tick.textContent = '\u2713';
      row.append(body, tick);
      if (cfg.selected !== undefined && String(cfg.selected) === String(item.value)) {
        row.classList.add('is-selected');
        row.setAttribute('aria-selected', 'true');
      }
      row.addEventListener('click', () => {
        const btn = anchor && anchor.querySelector('button');
        const label = btn && btn.querySelector('span');
        if (label) label.textContent = item.label;
        el.querySelectorAll('.dd-item').forEach((n) => {
          const on = n === row;
          n.classList.toggle('is-selected', on);
          n.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        if (onSelect) onSelect(item.value, item.label, row);
        hide(el);
      });
      el.appendChild(row);
    });
    show(el, anchor, { align: wide ? 'start' : 'end' });
    const sel = el.querySelector('.is-selected');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
    return el;
  }

  function activeItem(el) {
    return el.querySelector('.is-active');
  }

  function itemsOf(el) {
    return Array.from(el.querySelectorAll('.dd-item, [onmousedown]'));
  }

  function choose(item) {
    ['mousedown', 'click'].forEach((type) => {
      item.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
    });
  }

  function onKey(e) {
    if (!open.size) return;
    const el = Array.from(open.keys()).pop();
    if (e.key === 'Escape') { hide(el); return; }
    const list = itemsOf(el);
    if (!list.length) return;
    const cur = activeItem(el);
    let i = cur ? list.indexOf(cur) : -1;
    if (e.key === 'ArrowDown') i = (i + 1) % list.length;
    else if (e.key === 'ArrowUp') i = i <= 0 ? list.length - 1 : i - 1;
    else if (e.key === 'Enter' && cur) { e.preventDefault(); choose(cur); return; }
    else return;
    e.preventDefault();
    if (cur) cur.classList.remove('is-active');
    list[i].classList.add('is-active');
    list[i].scrollIntoView({ block: 'nearest' });
  }

  function onPointer(e) {
    open.forEach((rec, el) => {
      if (el.contains(e.target) || rec.anchor.contains(e.target)) return;
      hide(el);
    });
  }

  function adapt(el) {
    if (!el.matches || !el.matches(SUGGEST_SEL)) return;
    const shown = !el.classList.contains('hidden') && (el.firstElementChild || el.textContent.trim() !== '');
    if (shown && !open.has(el)) show(el);
    else if (!shown && open.has(el)) hide(el);
  }

  function start() {
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', reposition);
      window.visualViewport.addEventListener('scroll', reposition);
    }
    document.addEventListener('focusin', () => {
      setTimeout(reposition, 120);
      setTimeout(reposition, 350);
    });
    new MutationObserver((list) => {
      list.forEach((m) => {
        if (m.type === 'attributes') adapt(m.target);
        else {
          adapt(m.target);
          m.addedNodes.forEach((n) => {
            if (n.nodeType !== 1) return;
            adapt(n);
            if (n.querySelectorAll) n.querySelectorAll(SUGGEST_SEL).forEach(adapt);
          });
        }
      });
      reposition();
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  }

  window.Dropdown = { show, hide, hideAll, menu, reposition, isOpen: (el) => open.has(el) };
  window._mkPopover = function (anchor, id, items, onSelect, opts) {
    const o = opts || {};
    return menu({ id, anchor, items, onSelect, selected: o.selected, wide: !!o.fullWidth });
  };

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
