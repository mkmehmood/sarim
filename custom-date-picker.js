/*
 * custom-date-picker.js
 * ----------------------------------------------------------------------
 * Replaces the OS-native <input type="date"> picker (which renders as a
 * wheel on iOS, a Material dialog on Android, a browser widget on
 * desktop — all different) with one hand-built calendar popover that
 * looks and behaves identically everywhere.
 *
 * Design goals:
 *  - Zero changes needed to existing markup or app code. Every
 *    `<input type="date">` already in the DOM (or added later) is
 *    auto-enhanced.
 *  - The original <input> stays in the DOM (hidden) and keeps its id,
 *    so `document.getElementById('sys-date').value`, existing
 *    `onchange="..."` attributes, etc. all keep working exactly as
 *    before.
 *  - Reads/writes of `.value` from anywhere in the codebase (including
 *    `otherInput.value = thisInput.value` patterns already used in the
 *    app) transparently stay in sync with the visible button label,
 *    via a per-element property override — no code elsewhere needs to
 *    know this widget exists.
 * ----------------------------------------------------------------------
 */
(function () {
  'use strict';

  if (window.__customDatePickerInstalled) return;
  window.__customDatePickerInstalled = true;

  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var WEEKDAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  // Capture the browser's real value accessor before we override it
  // per-instance, so our override can still read/write the actual DOM value.
  var nativeValueDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function toISO(y, m, d) { return y + '-' + pad2(m + 1) + '-' + pad2(d); }

  function parseISO(iso) {
    if (!iso || typeof iso !== 'string') return null;
    var parts = iso.split('-');
    if (parts.length !== 3) return null;
    var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1, d = parseInt(parts[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    var dt = new Date(y, m, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m || dt.getDate() !== d) return null;
    return dt;
  }

  function formatDisplay(iso, placeholder) {
    var dt = parseISO(iso);
    if (!dt) return placeholder || 'Select date';
    return dt.getDate() + ' ' + MONTHS_SHORT[dt.getMonth()] + ' ' + dt.getFullYear();
  }

  // Tracks which trigger button (if any) currently owns the open popover.
  // Needed because the popover now lives in document.body (a portal), so
  // `wrap.querySelector('.cdp-popover')` can no longer find it.
  var openPopoverBtn = null;
  // The active reposition handler for the currently-open popover, so we
  // can tear it down (and avoid leaking listeners) whenever it closes.
  var activeReposition = null;

  function closeAllPopovers(except) {
    var open = document.querySelectorAll('.cdp-popover');
    for (var i = 0; i < open.length; i++) {
      if (open[i] !== except) open[i].remove();
    }
    if (!except) {
      openPopoverBtn = null;
      if (activeReposition) {
        window.removeEventListener('scroll', activeReposition, true);
        window.removeEventListener('resize', activeReposition);
        activeReposition = null;
      }
    }
  }

  // Clicking anywhere should close open popovers EXCEPT when the click
  // originated inside the popover itself (nav buttons, day cells, footer
  // actions) or inside the trigger button that owns it — those elements
  // manage their own open/close logic and know the up-to-date state.
  // Letting this document-level listener swallow those clicks was the bug:
  // it ran (capture phase) before the popover's own handlers, closing the
  // calendar out from under month-navigation clicks.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.closest && (t.closest('.cdp-popover') || t.closest('.cdp-btn'))) return;
    closeAllPopovers();
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAllPopovers();
  });

  // Positions a portal'd popover with `position: fixed` coordinates
  // derived from the trigger button's current bounding rect, flipping
  // horizontally/vertically if it would overflow the viewport. Safe to
  // call repeatedly (e.g. after month navigation changes the grid's
  // height, or on scroll/resize) since it always recomputes from scratch.
  function positionPopover(pop, btn) {
    var btnRect = btn.getBoundingClientRect();
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;

    pop.style.left = btnRect.left + 'px';
    pop.style.right = 'auto';
    pop.style.top = (btnRect.bottom + 6) + 'px';
    pop.style.bottom = 'auto';

    var popRect = pop.getBoundingClientRect();

    if (popRect.right > vw - 4) {
      pop.style.left = 'auto';
      pop.style.right = Math.max(4, vw - btnRect.right) + 'px';
    }
    if (popRect.bottom > vh - 4) {
      pop.style.top = 'auto';
      pop.style.bottom = Math.max(4, vh - btnRect.top + 6) + 'px';
    }
    // Re-clamp the left edge in case flipping right still overflows on
    // very narrow screens.
    popRect = pop.getBoundingClientRect();
    if (popRect.left < 4) {
      if (pop.style.left !== 'auto') pop.style.left = '4px';
      else pop.style.right = Math.max(4, vw - btnRect.right - (4 - popRect.left)) + 'px';
    }
  }

  function buildPopover(input, btn, labelEl) {
    closeAllPopovers();

    var selected = parseISO(nativeValueDesc.get.call(input));
    var today = new Date();
    var viewYear = (selected || today).getFullYear();
    var viewMonth = (selected || today).getMonth();
    // Drill-down level, like the native OS picker: start on the day
    // grid; tapping the header title zooms out to months, then years.
    // Picking a year drops back to months; picking a month drops back
    // to days; picking a day commits and closes.
    var view = 'day'; // 'day' | 'month' | 'year'
    var yearRangeStart = null; // set when entering 'year' view

    var minDt = parseISO(input.getAttribute('min'));
    var maxDt = parseISO(input.getAttribute('max'));

    var pop = document.createElement('div');
    pop.className = 'cdp-popover';
    pop.setAttribute('role', 'dialog');

    var header = document.createElement('div');
    header.className = 'cdp-header';

    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'cdp-nav';
    prevBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M7 1.5L3 5L7 8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    var title = document.createElement('button');
    title.type = 'button';
    title.className = 'cdp-title';

    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'cdp-nav';
    nextBtn.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M3 1.5L7 5L3 8.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

    header.appendChild(prevBtn);
    header.appendChild(title);
    header.appendChild(nextBtn);
    pop.appendChild(header);

    // Weekday row (day view only; hidden in month/year views)
    var wdRow = document.createElement('div');
    wdRow.className = 'cdp-weekdays';
    for (var w = 0; w < 7; w++) {
      var wd = document.createElement('span');
      wd.textContent = WEEKDAYS[w];
      wdRow.appendChild(wd);
    }
    pop.appendChild(wdRow);

    var grid = document.createElement('div');
    grid.className = 'cdp-grid';
    pop.appendChild(grid);

    function isDayDisabled(dt) {
      if (minDt && dt < minDt) return true;
      if (maxDt && dt > maxDt) return true;
      return false;
    }
    // A month/year is disabled only if it falls entirely outside the
    // min/max range (matches how native pickers grey out whole units).
    function isMonthDisabled(y, m) {
      var first = new Date(y, m, 1);
      var last = new Date(y, m + 1, 0);
      if (maxDt && first > maxDt) return true;
      if (minDt && last < minDt) return true;
      return false;
    }
    function isYearDisabled(y) {
      var first = new Date(y, 0, 1);
      var last = new Date(y, 11, 31);
      if (maxDt && first > maxDt) return true;
      if (minDt && last < minDt) return true;
      return false;
    }

    function commit(iso) {
      // Route through the (possibly overridden) value setter so the
      // visible label and any other enhanced inputs stay in sync.
      input.value = iso;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      closeAllPopovers();
    }

    function goTo(newView) {
      view = newView;
      render();
      positionPopover(pop, btn);
    }

    function renderDayGrid() {
      title.textContent = MONTHS[viewMonth] + ' ' + viewYear;
      var firstOfMonth = new Date(viewYear, viewMonth, 1);
      var startOffset = firstOfMonth.getDay();
      var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      var totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;

      for (var i = 0; i < totalCells; i++) {
        var dayNum = i - startOffset + 1;
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cdp-day';

        if (dayNum < 1 || dayNum > daysInMonth) {
          cell.classList.add('cdp-day-empty');
          cell.disabled = true;
        } else {
          var cellDt = new Date(viewYear, viewMonth, dayNum);
          cell.textContent = String(dayNum);

          if (selected && cellDt.getFullYear() === selected.getFullYear() &&
              cellDt.getMonth() === selected.getMonth() && cellDt.getDate() === selected.getDate()) {
            cell.classList.add('cdp-day-selected');
          }
          if (cellDt.getFullYear() === today.getFullYear() &&
              cellDt.getMonth() === today.getMonth() && cellDt.getDate() === today.getDate()) {
            cell.classList.add('cdp-day-today');
          }
          if (isDayDisabled(cellDt)) {
            cell.disabled = true;
            cell.classList.add('cdp-day-disabled');
          } else {
            (function (iso) {
              cell.addEventListener('click', function (e) {
                e.stopPropagation();
                commit(iso);
              });
            })(toISO(viewYear, viewMonth, dayNum));
          }
        }
        grid.appendChild(cell);
      }
    }

    function renderMonthGrid() {
      title.textContent = String(viewYear);
      for (var m = 0; m < 12; m++) {
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cdp-cell';
        cell.textContent = MONTHS_SHORT[m];

        if (selected && selected.getFullYear() === viewYear && selected.getMonth() === m) {
          cell.classList.add('cdp-cell-selected');
        }
        if (today.getFullYear() === viewYear && today.getMonth() === m) {
          cell.classList.add('cdp-cell-today');
        }
        if (isMonthDisabled(viewYear, m)) {
          cell.disabled = true;
          cell.classList.add('cdp-cell-disabled');
        } else {
          (function (m) {
            cell.addEventListener('click', function (e) {
              e.stopPropagation();
              viewMonth = m;
              goTo('day');
            });
          })(m);
        }
        grid.appendChild(cell);
      }
    }

    function renderYearGrid() {
      if (yearRangeStart == null) yearRangeStart = viewYear - (viewYear % 12);
      title.textContent = yearRangeStart + ' \u2013 ' + (yearRangeStart + 11);
      for (var i = 0; i < 12; i++) {
        var y = yearRangeStart + i;
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cdp-cell';
        cell.textContent = String(y);

        if (selected && selected.getFullYear() === y) {
          cell.classList.add('cdp-cell-selected');
        }
        if (today.getFullYear() === y) {
          cell.classList.add('cdp-cell-today');
        }
        if (isYearDisabled(y)) {
          cell.disabled = true;
          cell.classList.add('cdp-cell-disabled');
        } else {
          (function (y) {
            cell.addEventListener('click', function (e) {
              e.stopPropagation();
              viewYear = y;
              goTo('month');
            });
          })(y);
        }
        grid.appendChild(cell);
      }
    }

    function render() {
      grid.innerHTML = '';
      if (view === 'day') {
        wdRow.style.display = '';
        grid.className = 'cdp-grid';
        title.classList.add('cdp-title-clickable');
        renderDayGrid();
      } else if (view === 'month') {
        wdRow.style.display = 'none';
        grid.className = 'cdp-grid-months';
        title.classList.add('cdp-title-clickable');
        renderMonthGrid();
      } else {
        wdRow.style.display = 'none';
        grid.className = 'cdp-grid-years';
        title.classList.remove('cdp-title-clickable');
        renderYearGrid();
      }
    }

    prevBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (view === 'day') {
        viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      } else if (view === 'month') {
        viewYear--;
      } else {
        yearRangeStart -= 12;
      }
      render();
      // A 5-week vs 6-week month (or switching views) changes the
      // popover's height, so re-run the flip/clamp logic to keep it
      // pinned correctly.
      positionPopover(pop, btn);
    });
    nextBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (view === 'day') {
        viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      } else if (view === 'month') {
        viewYear++;
      } else {
        yearRangeStart += 12;
      }
      render();
      positionPopover(pop, btn);
    });
    title.addEventListener('click', function (e) {
      e.stopPropagation();
      if (view === 'day') goTo('month');
      else if (view === 'month') { yearRangeStart = viewYear - (viewYear % 12); goTo('year'); }
      // Year view's title is the top level; nothing to zoom out to.
    });
    pop.addEventListener('click', function (e) { e.stopPropagation(); });

    render();

    // Render into document.body rather than btn.parentNode: the trigger
    // lives inside a `.liquid-card`, which sets `overflow: hidden` to
    // clip its own rounded corners/gradient background. Any ancestor
    // with overflow: hidden clips its descendants regardless of z-index,
    // so as long as the popover was a child of that card it could never
    // visually escape it. Portaling to body sidesteps the clip entirely;
    // `position: fixed` + positionPopover() below keeps it visually
    // anchored to the trigger button using viewport coordinates.
    document.body.appendChild(pop);
    positionPopover(pop, btn);

    openPopoverBtn = btn;
    activeReposition = function () { positionPopover(pop, btn); };
    window.addEventListener('scroll', activeReposition, true);
    window.addEventListener('resize', activeReposition);
  }

  function enhanceDateInput(input) {
    if (!input || input.dataset.cdpEnhanced) return;
    if (input.type !== 'date') return;
    input.dataset.cdpEnhanced = '1';

    var placeholder = input.getAttribute('placeholder') || 'Select date';

    var wrap = document.createElement('span');
    wrap.className = 'cdp-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cdp-btn';
    if (input.id) btn.id = input.id + '__cdpBtn';

    var label = document.createElement('span');
    label.className = 'cdp-btn-label';
    label.textContent = formatDisplay(nativeValueDesc.get.call(input), placeholder);
    btn.appendChild(label);

    var icon = document.createElement('span');
    icon.className = 'cdp-btn-icon';
    icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M2 6.5H14" stroke="currentColor" stroke-width="1.3"/><path d="M5 1.5V4M11 1.5V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
    btn.appendChild(icon);

    wrap.appendChild(btn);

    input.style.display = 'none';
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');

    // Per-instance override so any code that sets/reads `.value`
    // directly (including other scripts already in this app) keeps
    // working, and the visible label stays in sync automatically.
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return nativeValueDesc.get.call(input); },
      set: function (v) {
        nativeValueDesc.set.call(input, v);
        label.textContent = formatDisplay(nativeValueDesc.get.call(input), placeholder);
      }
    });

    function syncDisabled() {
      btn.disabled = !!input.disabled;
      btn.classList.toggle('cdp-btn-disabled', !!input.disabled);
    }
    syncDisabled();
    new MutationObserver(syncDisabled).observe(input, { attributes: true, attributeFilter: ['disabled'] });

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (input.disabled) return;
      // The popover now lives in document.body, not under `wrap`, so we
      // can't find it with wrap.querySelector anymore — track ownership
      // via openPopoverBtn instead.
      var alreadyOpenForThis = (openPopoverBtn === btn);
      closeAllPopovers();
      if (!alreadyOpenForThis) buildPopover(input, btn, label);
    });
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    var inputs = root.querySelectorAll('input[type="date"]:not([data-cdp-enhanced])');
    for (var i = 0; i < inputs.length; i++) enhanceDateInput(inputs[i]);
  }

  function init() {
    scan(document);
    var mo = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var added = mutations[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) continue;
          if (node.matches && node.matches('input[type="date"]')) enhanceDateInput(node);
          else scan(node);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
