const IMG_KEY = 'sarim_custom_bg';
const CFG_KEY = 'sarim_custom_bg_cfg';
const MAX_SCALE_FACTOR = 8;
const DEFAULT_DIM = 45;

function toast(msg, type) {
  if (typeof window.showToast === 'function') window.showToast(msg, type || 'info', 2200);
}

function readImage() {
  try { return localStorage.getItem(IMG_KEY) || ''; } catch (_) { return ''; }
}

function readDim() {
  try {
    const cfg = JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
    const d = Number(cfg.dim);
    return Number.isFinite(d) ? Math.min(80, Math.max(0, d)) : DEFAULT_DIM;
  } catch (_) { return DEFAULT_DIM; }
}

function layers() {
  let img = document.getElementById('app-bg-image');
  if (!img) {
    img = document.createElement('div');
    img.id = 'app-bg-image';
    img.setAttribute('aria-hidden', 'true');
    const dim = document.createElement('div');
    dim.className = 'app-bg-dim';
    img.appendChild(dim);
    document.body.appendChild(img);
  }
  return img;
}

function paintDim(dim) {
  document.documentElement.style.setProperty('--custom-bg-dim', dim + '%');
}

export function applyCustomBackground() {
  const src = readImage();
  const html = document.documentElement;
  if (!src) {
    html.removeAttribute('data-custom-bg');
    html.style.removeProperty('--custom-bg-image');
    const el = document.getElementById('app-bg-image');
    if (el) el.remove();
    syncCustomBgButtons();
    return false;
  }
  layers();
  document.documentElement.style.setProperty('--custom-bg-image', 'url("' + src + '")');
  paintDim(readDim());
  html.setAttribute('data-custom-bg', '1');
  syncCustomBgButtons();
  return true;
}

export function resetCustomBackground() {
  try { localStorage.removeItem(IMG_KEY); localStorage.removeItem(CFG_KEY); } catch (_) {}
  applyCustomBackground();
  toast('Background reset', 'info');
}

export function syncCustomBgButtons() {
  const has = !!readImage();
  const reset = document.getElementById('sidebar-btn-bg-reset');
  if (reset) reset.classList.toggle('d-none', !has);
  const label = document.getElementById('custom-bg-label');
  if (label) label.textContent = has ? 'Change Background Picture' : 'Background Picture';
}

function save(dataUrl, dim) {
  try {
    localStorage.setItem(IMG_KEY, dataUrl);
    localStorage.setItem(CFG_KEY, JSON.stringify({ dim }));
    return true;
  } catch (_) { return false; }
}

function openEditor(file) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onerror = () => { URL.revokeObjectURL(url); toast('Could not open that picture', 'error'); };
  img.onload = () => buildEditor(img, url);
  img.src = url;
}

function buildEditor(img, url) {
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  if (!natW || !natH) { URL.revokeObjectURL(url); toast('Could not open that picture', 'error'); return; }

  const root = document.createElement('div');
  root.className = 'bg-editor';
  root.innerHTML =
    '<div class="bg-editor-stage"><img class="bg-editor-img" alt="" draggable="false"><div class="bg-editor-dim"></div></div>' +
    '<div class="bg-editor-hint">Pinch to zoom, drag to move</div>' +
    '<div class="bg-editor-bar">' +
      '<label class="bg-editor-dimrow"><span>Dim</span><input type="range" min="0" max="80" step="1" class="bg-editor-range" aria-label="Background dimming"></label>' +
      '<div class="bg-editor-actions">' +
        '<button type="button" class="btn btn-theme" data-act="cancel">Cancel</button>' +
        '<button type="button" class="btn btn-main" data-act="save">Set Background</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(root);

  const stage = root.querySelector('.bg-editor-stage');
  const view = root.querySelector('.bg-editor-img');
  const dimEl = root.querySelector('.bg-editor-dim');
  const range = root.querySelector('.bg-editor-range');
  const hint = root.querySelector('.bg-editor-hint');
  view.src = url;
  view.width = natW;
  view.height = natH;

  let fw = stage.clientWidth || window.innerWidth;
  let fh = stage.clientHeight || window.innerHeight;
  let minS = Math.max(fw / natW, fh / natH);
  let s = minS;
  let x = (fw - natW * s) / 2;
  let y = (fh - natH * s) / 2;
  let dim = readImage() ? readDim() : DEFAULT_DIM;
  range.value = String(dim);

  function clamp() {
    s = Math.min(minS * MAX_SCALE_FACTOR, Math.max(minS, s));
    x = Math.min(0, Math.max(fw - natW * s, x));
    y = Math.min(0, Math.max(fh - natH * s, y));
  }
  function draw() {
    clamp();
    view.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
  }
  function paintEditorDim() {
    dimEl.style.setProperty('--bg-editor-dim', dim + '%');
  }
  function zoomAt(k, cx, cy) {
    const ns = Math.min(minS * MAX_SCALE_FACTOR, Math.max(minS, s * k));
    const real = ns / s;
    x = cx - (cx - x) * real;
    y = cy - (cy - y) * real;
    s = ns;
  }
  function hideHint() { hint.classList.add('is-hidden'); }

  draw();
  paintEditorDim();
  setTimeout(hideHint, 3500);

  const pts = new Map();
  let lastDist = 0;
  let lastMid = null;

  function stats() {
    const a = Array.from(pts.values());
    if (a.length < 2) return null;
    return { dist: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), mx: (a[0].x + a[1].x) / 2, my: (a[0].y + a[1].y) / 2 };
  }
  stage.addEventListener('pointerdown', (e) => {
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const st = stats();
    lastDist = st ? st.dist : 0;
    lastMid = st ? { x: st.mx, y: st.my } : null;
    hideHint();
  });
  stage.addEventListener('pointermove', (e) => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const px = p.x;
    const py = p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pts.size === 1) {
      x += e.clientX - px;
      y += e.clientY - py;
    } else if (pts.size >= 2) {
      const st = stats();
      if (st && lastDist > 0 && lastMid) {
        x += st.mx - lastMid.x;
        y += st.my - lastMid.y;
        zoomAt(st.dist / lastDist, st.mx, st.my);
      }
      if (st) { lastDist = st.dist; lastMid = { x: st.mx, y: st.my }; }
    }
    draw();
  });
  function up(e) {
    pts.delete(e.pointerId);
    const st = stats();
    lastDist = st ? st.dist : 0;
    lastMid = st ? { x: st.mx, y: st.my } : null;
  }
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    draw();
    hideHint();
  }, { passive: false });
  stage.addEventListener('dblclick', (e) => {
    zoomAt(s > minS * 1.05 ? minS / s : 2, e.clientX, e.clientY);
    draw();
  });

  range.addEventListener('input', () => {
    dim = Number(range.value) || 0;
    paintEditorDim();
  });

  function onResize() {
    const nw = stage.clientWidth || window.innerWidth;
    const nh = stage.clientHeight || window.innerHeight;
    const ratio = (s / minS) || 1;
    fw = nw; fh = nh;
    minS = Math.max(fw / natW, fh / natH);
    s = minS * ratio;
    draw();
  }
  window.addEventListener('resize', onResize);

  function close() {
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey);
    root.remove();
    URL.revokeObjectURL(url);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);

  function commit() {
    const outW = Math.min(1440, Math.round(fw * Math.min(window.devicePixelRatio || 1, 2)));
    const outH = Math.round(outW * fh / fw);
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) { toast('Could not save the picture', 'error'); return; }
    const r = outW / fw;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, x * r, y * r, natW * s * r, natH * s * r);
    let ok = false;
    for (const q of [0.85, 0.7, 0.55]) {
      if (save(canvas.toDataURL('image/jpeg', q), dim)) { ok = true; break; }
    }
    if (!ok) { toast('Picture is too large to store on this device', 'error'); return; }
    close();
    applyCustomBackground();
    toast('Background updated', 'success');
  }

  root.querySelector('[data-act="cancel"]').addEventListener('click', close);
  root.querySelector('[data-act="save"]').addEventListener('click', commit);
}

export function pickCustomBackground() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    input.remove();
    if (!f) return;
    if (!/^image\//.test(f.type)) { toast('Please choose an image', 'error'); return; }
    openEditor(f);
  });
  document.body.appendChild(input);
  input.click();
}

window.pickCustomBackground = pickCustomBackground;
window.resetCustomBackground = resetCustomBackground;
window.syncCustomBgButtons = syncCustomBgButtons;
window.applyCustomBackground = applyCustomBackground;

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyCustomBackground);
else applyCustomBackground();
