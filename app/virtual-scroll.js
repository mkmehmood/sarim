
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const esc = escapeHtml; 

// ═══════════════════════════════════════════════════════════════════════════
// GNDVirtualScroll — lightweight virtual-scroll engine for tbody tables
//
// How it works:
//   • The scroll container (overflow-y: auto) gets an IntersectionObserver
//     so the engine wakes up only when the container is visible.
//   • A "phantom" spacer <tr> at the top pads the visible area upward,
//     and another at the bottom extends the total scroll height downward.
//     Both use a single cell with the correct pixel height so the table
//     layout stays intact.
//   • On every scroll event (throttled to one rAF per frame) the engine
//     computes the first and last visible row index from scrollTop and
//     renders only those rows plus an overScan buffer on each side.
//   • Row height is measured once from the first rendered row, then cached.
//     A ResizeObserver on the container triggers a remeasure if the
//     container width changes (responsive layout / orientation change).
//   • GNDVirtualScroll.mount() is idempotent: calling it again with new
//     data tears down the previous instance and mounts fresh.
//   • GNDVirtualScroll.destroy(id) cleanly disconnects observers.
// ═══════════════════════════════════════════════════════════════════════════
const GNDVirtualScroll = (() => {
  const OVERSCAN   = 5;   // extra rows to render beyond viewport edges
  const FALLBACK_H = 44;  // px — used before first measurement

  // Map of scrollerId → instance state
  const _instances = new Map();

  // ── helpers ──────────────────────────────────────────────────────────────

  function _makeSpacerRow(colSpan) {
    const tr = document.createElement('tr');
    tr.setAttribute('aria-hidden', 'true');
    const td = document.createElement('td');
    td.colSpan  = colSpan;
    td.style.cssText = 'height:0px; padding:0; border:none; pointer-events:none;';
    tr.appendChild(td);
    tr.style.cssText = 'height:0px; pointer-events:none;';
    return tr;
  }

  function _setSpacerHeight(spacerRow, px) {
    const h = Math.max(0, Math.round(px)) + 'px';
    spacerRow.style.height = h;
    spacerRow.firstElementChild.style.height = h;
  }

  function _colSpanOf(tbody) {
    // Peek at the first non-spacer row to count columns, fall back to 5.
    const first = Array.from(tbody.rows).find(r => !r.hasAttribute('aria-hidden'));
    if (first) return first.cells.length || 5;
    // Try the thead for column count
    const table = tbody.closest('table');
    if (table) {
      const hRow = table.querySelector('thead tr');
      if (hRow) return hRow.cells.length || 5;
    }
    return 5;
  }

  // ── core render ───────────────────────────────────────────────────────────

  function _render(inst) {
    const { scroller, tbody, items, buildRow, topSpacer, botSpacer } = inst;
    const rowH    = inst.rowHeight || FALLBACK_H;
    const scrollH = scroller.clientHeight;
    const scrollT = scroller.scrollTop;

    if (items.length === 0) return;

    const firstVis = Math.max(0, Math.floor(scrollT / rowH) - OVERSCAN);
    const lastVis  = Math.min(items.length - 1,
                       Math.ceil((scrollT + scrollH) / rowH) + OVERSCAN);

    // Skip re-render if the window hasn't changed
    if (inst.renderedFirst === firstVis && inst.renderedLast === lastVis) return;
    inst.renderedFirst = firstVis;
    inst.renderedLast  = lastVis;

    // Build the visible fragment
    const frag = document.createDocumentFragment();
    for (let i = firstVis; i <= lastVis; i++) {
      const el = buildRow(items[i], i);
      if (el) frag.appendChild(el);
    }

    // Spacer heights
    _setSpacerHeight(topSpacer, firstVis * rowH);
    _setSpacerHeight(botSpacer, (items.length - 1 - lastVis) * rowH);

    // Swap in visible rows between the two spacers (leave spacers in place)
    // Remove all children except spacers, then re-insert
    let child = topSpacer.nextSibling;
    while (child && child !== botSpacer) {
      const next = child.nextSibling;
      tbody.removeChild(child);
      child = next;
    }
    tbody.insertBefore(frag, botSpacer);
  }

  // ── row-height measurement ────────────────────────────────────────────────

  function _measureRowHeight(inst) {
    // Pull the first non-spacer TR, read its offsetHeight
    const first = Array.from(inst.tbody.rows).find(r => !r.hasAttribute('aria-hidden'));
    if (first && first.offsetHeight > 0) {
      inst.rowHeight = first.offsetHeight;
    }
  }

  // ── public API ────────────────────────────────────────────────────────────

  function mount(scrollerId, items, buildRow, tbody) {
    // Tear down any existing instance on this scroller
    destroy(scrollerId);

    const scroller = document.getElementById(scrollerId);
    if (!scroller) {
      // Fallback: render all rows directly (no virtual scroll possible without container)
      tbody.innerHTML = '';
      const frag = document.createDocumentFragment();
      items.forEach((item, i) => {
        const el = buildRow(item, i);
        if (el) frag.appendChild(el);
      });
      tbody.appendChild(frag);
      return;
    }

    if (!items || items.length === 0) {
      tbody.innerHTML = '';
      return;
    }

    const colSpan  = _colSpanOf(tbody) || 5;
    const topSpacer = _makeSpacerRow(colSpan);
    const botSpacer = _makeSpacerRow(colSpan);

    // Seed tbody with spacers + do an initial render
    tbody.innerHTML = '';
    tbody.appendChild(topSpacer);
    tbody.appendChild(botSpacer);

    const inst = {
      scroller, tbody, items, buildRow,
      topSpacer, botSpacer,
      rowHeight: FALLBACK_H,
      renderedFirst: -1,
      renderedLast:  -1,
      rafId: null,
      scrollHandler: null,
      resizeObs: null,
      intersectionObs: null,
    };

    _instances.set(scrollerId, inst);

    // Initial render pass
    _render(inst);
    // Measure real row height after first paint
    requestAnimationFrame(() => {
      _measureRowHeight(inst);
      _render(inst);
    });

    // Scroll handler (throttled to one rAF per frame)
    inst.scrollHandler = () => {
      if (inst.rafId) return;
      inst.rafId = requestAnimationFrame(() => {
        inst.rafId = null;
        _render(inst);
      });
    };
    scroller.addEventListener('scroll', inst.scrollHandler, { passive: true });

    // ResizeObserver — remeasure and re-render on container resize
    if (typeof ResizeObserver !== 'undefined') {
      inst.resizeObs = new ResizeObserver(() => {
        inst.renderedFirst = -1; // force re-render
        inst.renderedLast  = -1;
        _measureRowHeight(inst);
        _render(inst);
      });
      inst.resizeObs.observe(scroller);
    }

    // IntersectionObserver — only render when tab/section becomes visible
    if (typeof IntersectionObserver !== 'undefined') {
      inst.intersectionObs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          inst.renderedFirst = -1;
          inst.renderedLast  = -1;
          _measureRowHeight(inst);
          _render(inst);
        }
      }, { threshold: 0 });
      inst.intersectionObs.observe(scroller);
    }
  }

  function destroy(scrollerId) {
    const inst = _instances.get(scrollerId);
    if (!inst) return;
    if (inst.rafId) cancelAnimationFrame(inst.rafId);
    if (inst.scrollHandler) inst.scroller.removeEventListener('scroll', inst.scrollHandler);
    if (inst.resizeObs)      inst.resizeObs.disconnect();
    if (inst.intersectionObs) inst.intersectionObs.disconnect();
    _instances.delete(scrollerId);
  }

  return { mount, destroy };
})();


if (window.trustedTypes && window.trustedTypes.createPolicy) {
  window._gndHTMLPolicy = window.trustedTypes.createPolicy('gnd-html-policy', {

    

    createHTML: (s) => s
  });

  

  window.setHTML = (el, html) => {
    el.innerHTML = window._gndHTMLPolicy.createHTML(html);
  };
} else {

  window.setHTML = (el, html) => { el.innerHTML = html; };
}

