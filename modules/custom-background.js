export const BG_IMAGE_KEY = 'sarim_bg_image';
export const BG_DIM_KEY = 'sarim_bg_dim';
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 6;
export const MAX_OUT_WIDTH = 1080;

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function normalizeDim(v) {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(Math.round(n), 0, 80) : 35;
}

export function coverScale(iw, ih, vw, vh) {
  return Math.max(vw / iw, vh / ih);
}

export function clampPan(tx, ty, iw, ih, vw, vh, zoom) {
  const s = coverScale(iw, ih, vw, vh) * zoom;
  const mx = Math.max(0, (iw * s - vw) / 2);
  const my = Math.max(0, (ih * s - vh) / 2);
  return { tx: clamp(tx, -mx, mx), ty: clamp(ty, -my, my) };
}

export function zoomAt(view, nextZoom, fx, fy, iw, ih, vw, vh) {
  const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const ratio = z / view.zoom;
  const cx = vw / 2;
  const cy = vh / 2;
  const tx = fx - cx - (fx - cx - view.tx) * ratio;
  const ty = fy - cy - (fy - cy - view.ty) * ratio;
  return { zoom: z, ...clampPan(tx, ty, iw, ih, vw, vh, z) };
}

export function overlayCss(dim) {
  const d = normalizeDim(dim);
  const tint = 'color-mix(in srgb, var(--bg) ' + d + '%, transparent)';
  return 'linear-gradient(' + tint + ', ' + tint + ')';
}

export function backgroundValue(dataUrl, dim) {
  return overlayCss(dim) + ', url("' + dataUrl + '") center / cover no-repeat';
}

export function readStoredBackground() {
  try {
    const img = localStorage.getItem(BG_IMAGE_KEY);
    if (!img || img.indexOf('data:image/') !== 0) return null;
    return { image: img, dim: normalizeDim(localStorage.getItem(BG_DIM_KEY) ?? 35) };
  } catch (_) {
    return null;
  }
}

export function applyBackground(bg) {
  const root = document.documentElement;
  if (bg && bg.image) {
    root.style.setProperty('--bg-gradient', backgroundValue(bg.image, bg.dim));
    root.setAttribute('data-custom-bg', '1');
  } else {
    root.style.removeProperty('--bg-gradient');
    root.removeAttribute('data-custom-bg');
  }
  paintBackgroundLabel();
}

export function paintBackgroundLabel() {
  const label = document.getElementById('bg-mode-label');
  if (label) label.textContent = 'Background: ' + (readStoredBackground() ? 'Custom' : 'Default');
}

export function saveBackground(image, dim) {
  try {
    localStorage.setItem(BG_IMAGE_KEY, image);
    localStorage.setItem(BG_DIM_KEY, String(normalizeDim(dim)));
  } catch (_) {
    return false;
  }
  applyBackground(readStoredBackground());
  return true;
}

export function clearBackground() {
  try {
    localStorage.removeItem(BG_IMAGE_KEY);
    localStorage.removeItem(BG_DIM_KEY);
  } catch (_) {}
  applyBackground(null);
}

const toast = (msg, type) => {
  if (typeof window.showToast === 'function') window.showToast(msg, type || 'info', 2400);
};

const ed = {
  img: null,
  iw: 0,
  ih: 0,
  url: '',
  view: { zoom: 1, tx: 0, ty: 0 },
  pointers: new Map(),
  pinch: null,
  drag: null,
  dim: 35,
  mode: 'current',
  lastTap: 0,
  bound: false
};

const $ = (id) => document.getElementById(id);

function viewport() {
  const stage = $('bg-stage');
  const r = stage ? stage.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
  return { vw: r.width || window.innerWidth, vh: r.height || window.innerHeight };
}

function paintStage() {
  const el = $('bg-edit-img');
  const tint = $('bg-stage-tint');
  const hint = $('bg-hint');
  if (tint) tint.style.setProperty('--bg-tint', ed.dim + '%');
  const slider = $('bg-dim');
  if (slider) slider.value = String(ed.dim);
  const val = $('bg-dim-val');
  if (val) val.textContent = ed.dim + '%';
  if (!el || ed.mode !== 'edit' || !ed.img) return;
  const { vw, vh } = viewport();
  const s = coverScale(ed.iw, ed.ih, vw, vh);
  el.classList.remove('d-none');
  el.style.width = ed.iw * s + 'px';
  el.style.height = ed.ih * s + 'px';
  el.style.transform = 'translate(-50%, -50%) translate(' + ed.view.tx + 'px,' + ed.view.ty + 'px) scale(' + ed.view.zoom + ')';
  if (hint) hint.classList.toggle('d-none', ed.mode !== 'edit');
}

function paintControls() {
  const edit = ed.mode === 'edit';
  const has = !!readStoredBackground();
  const show = (id, on) => { const e = $(id); if (e) e.classList.toggle('d-none', !on); };
  show('bg-btn-save', edit);
  show('bg-btn-reset', edit);
  show('bg-btn-remove', !edit && has);
  show('bg-hint', edit);
  const title = $('bg-edit-title');
  if (title) title.textContent = edit ? 'Move & Zoom' : 'Background';
  const empty = $('bg-empty');
  if (empty) empty.classList.toggle('d-none', edit || has);
}

function releaseUrl() {
  if (ed.url) { try { URL.revokeObjectURL(ed.url); } catch (_) {} }
  ed.url = '';
}

function loadFile(file) {
  if (!file || !/^image\//.test(file.type)) {
    toast('Please choose an image file', 'error');
    return;
  }
  releaseUrl();
  ed.url = URL.createObjectURL(file);
  const img = $('bg-edit-img');
  img.onload = () => {
    img.classList.remove('bg-cover');
    ed.img = img;
    ed.iw = img.naturalWidth;
    ed.ih = img.naturalHeight;
    ed.view = { zoom: 1, tx: 0, ty: 0 };
    ed.mode = 'edit';
    paintControls();
    paintStage();
  };
  img.onerror = () => {
    toast('Could not open that picture', 'error');
    ed.img = null;
  };
  img.src = ed.url;
}

export function renderCroppedImage() {
  if (!ed.img) return null;
  const { vw, vh } = viewport();
  const outW = Math.min(MAX_OUT_WIDTH, Math.round(vw * (window.devicePixelRatio || 1)));
  const k = outW / vw;
  const outH = Math.round(vh * k);
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  const s = coverScale(ed.iw, ed.ih, vw, vh) * ed.view.zoom * k;
  const dw = ed.iw * s;
  const dh = ed.ih * s;
  const cx = outW / 2 + ed.view.tx * k;
  const cy = outH / 2 + ed.view.ty * k;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(ed.img, cx - dw / 2, cy - dh / 2, dw, dh);
  return canvas.toDataURL('image/jpeg', 0.85);
}

function onSave() {
  const data = renderCroppedImage();
  if (!data) return;
  if (!saveBackground(data, ed.dim)) {
    toast('Picture is too large to store on this device', 'error');
    return;
  }
  toast('Background updated', 'success');
  closeBackgroundScreen();
}

function onReset() {
  ed.view = { zoom: 1, tx: 0, ty: 0 };
  paintStage();
}

function onRemove() {
  clearBackground();
  ed.mode = 'current';
  const el = $('bg-edit-img');
  if (el) { el.removeAttribute('src'); el.classList.add('d-none'); }
  paintControls();
  toast('Background removed', 'info');
}

function setView(next) {
  const { vw, vh } = viewport();
  ed.view = { zoom: next.zoom, ...clampPan(next.tx, next.ty, ed.iw, ed.ih, vw, vh, next.zoom) };
  paintStage();
}

function pinchState() {
  const pts = [...ed.pointers.values()];
  const a = pts[0];
  const b = pts[1];
  return { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}

function localPoint(e) {
  const r = $('bg-stage').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function onDown(e) {
  if (ed.mode !== 'edit' || !ed.img) return;
  const stage = $('bg-stage');
  try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  ed.pointers.set(e.pointerId, localPoint(e));
  if (ed.pointers.size === 2) {
    const p = pinchState();
    ed.pinch = { dist: p.dist, mx: p.mx, my: p.my, view: { ...ed.view } };
    ed.drag = null;
  } else if (ed.pointers.size === 1) {
    const pt = ed.pointers.get(e.pointerId);
    ed.drag = { x: pt.x, y: pt.y, view: { ...ed.view } };
    const now = Date.now();
    if (now - ed.lastTap < 300) { ed.lastTap = 0; onDoubleTap(pt); } else ed.lastTap = now;
  }
  e.preventDefault();
}

function onDoubleTap(pt) {
  const { vw, vh } = viewport();
  const target = ed.view.zoom > 1.05 ? 1 : 2.5;
  const next = zoomAt(ed.view, target, pt.x, pt.y, ed.iw, ed.ih, vw, vh);
  setView(next);
}

function onMove(e) {
  if (!ed.pointers.has(e.pointerId)) return;
  ed.pointers.set(e.pointerId, localPoint(e));
  const { vw, vh } = viewport();
  if (ed.pointers.size >= 2 && ed.pinch) {
    const p = pinchState();
    const base = ed.pinch.view;
    const zoomed = zoomAt(base, base.zoom * (p.dist / ed.pinch.dist), ed.pinch.mx, ed.pinch.my, ed.iw, ed.ih, vw, vh);
    setView({ zoom: zoomed.zoom, tx: zoomed.tx + (p.mx - ed.pinch.mx), ty: zoomed.ty + (p.my - ed.pinch.my) });
  } else if (ed.drag) {
    const pt = ed.pointers.get(e.pointerId);
    setView({ zoom: ed.drag.view.zoom, tx: ed.drag.view.tx + (pt.x - ed.drag.x), ty: ed.drag.view.ty + (pt.y - ed.drag.y) });
  }
  e.preventDefault();
}

function onUp(e) {
  if (!ed.pointers.has(e.pointerId)) return;
  ed.pointers.delete(e.pointerId);
  ed.pinch = null;
  if (ed.pointers.size === 1) {
    const [pt] = [...ed.pointers.values()];
    ed.drag = { x: pt.x, y: pt.y, view: { ...ed.view } };
  } else {
    ed.drag = null;
  }
}

function onWheel(e) {
  if (ed.mode !== 'edit' || !ed.img) return;
  e.preventDefault();
  const { vw, vh } = viewport();
  const pt = localPoint(e);
  const factor = Math.exp(-e.deltaY * 0.0015);
  setView(zoomAt(ed.view, ed.view.zoom * factor, pt.x, pt.y, ed.iw, ed.ih, vw, vh));
}

function bindOnce() {
  if (ed.bound) return;
  const stage = $('bg-stage');
  if (!stage) return;
  ed.bound = true;
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  stage.addEventListener('wheel', onWheel, { passive: false });
  const file = $('bg-file');
  if (file) file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (f) loadFile(f);
  });
  const slider = $('bg-dim');
  if (slider) slider.addEventListener('input', () => {
    ed.dim = normalizeDim(slider.value);
    paintStage();
    if (ed.mode !== 'edit' && readStoredBackground()) saveDimOnly();
  });
  window.addEventListener('resize', () => { if (ed.img) setView(ed.view); });
}

function saveDimOnly() {
  const cur = readStoredBackground();
  if (cur) saveBackground(cur.image, ed.dim);
}

export function openBackgroundScreen() {
  const cur = readStoredBackground();
  ed.dim = cur ? cur.dim : 35;
  ed.mode = 'current';
  ed.img = null;
  ed.pointers.clear();
  window.openStandaloneScreen('background-screen');
  bindOnce();
  const el = $('bg-edit-img');
  if (el && cur) {
    ed.iw = 0;
    el.onload = null;
    el.src = cur.image;
    el.classList.remove('d-none');
    el.classList.add('bg-cover');
    el.style.width = '';
    el.style.height = '';
    el.style.transform = '';
  } else if (el) {
    el.removeAttribute('src');
    el.classList.add('d-none');
  }
  paintControls();
  paintStage();
}

export function chooseBackgroundPicture() {
  const file = $('bg-file');
  if (file) file.click();
}

export function closeBackgroundScreen() {
  releaseUrl();
  ed.img = null;
  ed.pointers.clear();
  const el = $('bg-edit-img');
  if (el) { el.removeAttribute('src'); el.classList.remove('bg-cover'); }
  if (typeof window.closeStandaloneScreen === 'function') window.closeStandaloneScreen('background-screen');
}

export function initCustomBackground() {
  applyBackground(readStoredBackground());
}

if (typeof window !== 'undefined') {
  window.openBackgroundScreen = openBackgroundScreen;
  window.chooseBackgroundPicture = chooseBackgroundPicture;
  window.closeBackgroundScreen = closeBackgroundScreen;
  window.saveBackgroundEdit = onSave;
  window.resetBackgroundEdit = onReset;
  window.removeCustomBackground = onRemove;
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCustomBackground);
  else initCustomBackground();
}
