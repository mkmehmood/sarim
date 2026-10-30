(function () {
  'use strict';
  if (window.__floatingListsInstalled) return;
  window.__floatingListsInstalled = true;

  var LIST_SEL = '.u-327750f, .u-search-dropdown, [id^="_pop_"]';
  var GAP = 4;
  var EDGE = 8;
  var MIN_H = 96;
  var MAX_H = 260;
  var open = new Set();
  var raf = 0;

  function isPopover(el) { return /^_pop_/.test(el.id || ''); }

  function isShown(el) {
    if (el.classList.contains('hidden') || el.classList.contains('d-none')) return false;
    return !!el.firstElementChild || isPopover(el) || el.textContent.trim() !== '';
  }

  function findAnchor(el) {
    var home = el._flHome && el._flHome.parentElement;
    if (!home) return null;
    if (isPopover(el)) return home;
    var n = el._flHome.previousElementSibling;
    while (n) {
      if (n.matches && (n.matches('input, textarea') || n.querySelector('input, textarea'))) {
        return n.matches('input, textarea') ? (n.closest('.pf-control') || n) : n;
      }
      n = n.previousElementSibling;
    }
    var input = home.querySelector('input[type="text"], input:not([type]), textarea');
    return input ? (input.closest('.pf-control') || input) : home;
  }

  function visibleBottom() {
    var vv = window.visualViewport;
    var b = window.innerHeight;
    if (vv) b = Math.min(b, vv.offsetTop + vv.height);
    return b;
  }

  function visibleTop() {
    var vv = window.visualViewport;
    return vv ? vv.offsetTop : 0;
  }

  function place(el) {
    var anchor = findAnchor(el);
    if (!anchor || !anchor.isConnected) return;
    var r = anchor.getBoundingClientRect();
    var vw = document.documentElement.clientWidth || window.innerWidth;
    var below = visibleBottom() - r.bottom - GAP - EDGE;
    var above = r.top - visibleTop() - GAP - EDGE;
    var want = Math.min(MAX_H, el.scrollHeight || MAX_H);
    var useAbove = below < Math.min(want, 160) && above > below;
    var room = Math.max(MIN_H, Math.min(MAX_H, useAbove ? above : below));
    var w = r.width;
    var left = r.left;
    if (isPopover(el) && !el.classList.contains('fl-full')) {
      w = Math.max(140, el.offsetWidth || 140);
      left = r.right - w;
    }
    left = Math.max(EDGE, Math.min(left, vw - w - EDGE));
    var h = Math.min(room, want);
    var top = useAbove ? Math.max(visibleTop() + EDGE, r.top - GAP - h) : r.bottom + GAP;
    var s = el.style;
    s.setProperty('--fl-top', Math.round(top) + 'px');
    s.setProperty('--fl-left', Math.round(left) + 'px');
    s.setProperty('--fl-w', Math.round(w) + 'px');
    s.setProperty('--fl-mh', Math.round(room) + 'px');
  }

  function float(el) {
    if (!el._flHome) {
      var mark = document.createComment('fl');
      el.parentNode.insertBefore(mark, el);
      el._flHome = mark;
    }
    if (el.parentNode !== document.body) {
      if (isPopover(el) && el.classList.contains('u-f59246f') && !el.classList.contains('fl-full')) el.classList.add('fl-full');
      document.body.appendChild(el);
    }
    if (!el.classList.contains('fl-list')) el.classList.add('fl-list');
    open.add(el);
    place(el);
  }

  function dock(el) {
    open.delete(el);
    if (el.classList.contains('fl-list')) el.classList.remove('fl-list');
    var mark = el._flHome;
    if (mark && mark.parentNode) {
      mark.parentNode.insertBefore(el, mark);
    } else if (!mark || !mark.parentNode) {
      if (el.parentNode === document.body) el.remove();
    }
  }

  function sync(el) {
    if (!el || !el.matches) return;
    if (isShown(el)) float(el);
    else if (el.classList.contains('fl-list')) dock(el);
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(function () {
      raf = 0;
      open.forEach(function (el) {
        if (!el.isConnected || !isShown(el)) { dock(el); return; }
        place(el);
      });
    });
  }

  var mo = new MutationObserver(function (list) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      var t = m.target;
      if (m.type === 'attributes') {
        if (t.matches && t.matches(LIST_SEL)) sync(t);
      } else if (m.type === 'childList') {
        if (t.matches && t.matches(LIST_SEL)) sync(t);
        for (var j = 0; j < m.addedNodes.length; j++) {
          var a = m.addedNodes[j];
          if (a.nodeType !== 1) continue;
          if (a.matches(LIST_SEL)) sync(a);
          else if (a.querySelectorAll) a.querySelectorAll(LIST_SEL).forEach(sync);
        }
      }
    }
    schedule();
  });

  function start() {
    mo.observe(document.body, {
      subtree: true, childList: true, attributes: true, attributeFilter: ['class']
    });
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', schedule);
      window.visualViewport.addEventListener('scroll', schedule);
    }
    document.addEventListener('focusin', function () { setTimeout(schedule, 120); setTimeout(schedule, 350); });
  }

  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);
})();
