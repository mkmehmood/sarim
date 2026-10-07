import { esc, fmtAmt, fmtNum, sqliteStore, ensureArray } from './business.js';

const getStoreLabel = (s) => (typeof window.getStoreLabel === 'function' ? window.getStoreLabel(s) : s);

const MAX_PHOTOS = 6;
const _thumbCache = new Map();
let _picker = [];
const _selected = new Set();

function _toast(msg, type = 'info', ms = 3000) {
  if (window.showToast) window.showToast(msg, type, ms);
}

function _readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

async function _compress(dataUrl, maxDim = 1280, quality = 0.75) {
  if (typeof window._compressPhoto === 'function') return window._compressPhoto(dataUrl, maxDim, quality);
  return dataUrl;
}

async function _photoStore() {
  const stored = await sqliteStore.get('person_photos');
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

async function _writePhotoKeys(setMap, deleteKeys) {
  const photos = await _photoStore();
  const ts = (await sqliteStore.get('person_photos_timestamps')) || {};
  const dirty = (await sqliteStore.get('person_photos_dirty_keys')) || [];
  const now = Date.now();
  for (const [k, v] of Object.entries(setMap)) {
    photos[k] = v;
    ts[k] = now;
    if (!dirty.includes(k)) dirty.push(k);
    _thumbCache.set(k, v);
  }
  for (const k of deleteKeys) {
    delete photos[k];
    delete ts[k];
    if (!dirty.includes(k)) dirty.push(k);
    _thumbCache.delete(k);
  }
  await sqliteStore.set('person_photos', photos);
  await sqliteStore.set('person_photos_timestamps', ts);
  await sqliteStore.set('person_photos_dirty_keys', dirty);
  await sqliteStore.set('person_photos_timestamp', now);
  if (typeof window.triggerAutoSync === 'function') { try { window.triggerAutoSync(); } catch (_) {} }
}

function _renderPicker() {
  const dot = document.getElementById('prod-photo-dot');
  const btn = document.getElementById('prod-photo-btn');
  const clr = document.getElementById('prod-photo-clear');
  const sec = document.getElementById('prod-photo-preview-section');
  const grid = document.getElementById('prod-photo-thumbs-grid');
  const countEl = document.getElementById('prod-photo-count');
  const n = _picker.length;

  if (dot) {
    dot.style.display = n ? '' : 'none';
    dot.textContent = n > 1 ? String(n) : '';
    dot.classList.toggle('pp-dot-count', n > 1);
  }
  if (btn) {
    btn.style.borderColor = n ? 'var(--accent)' : 'var(--glass-border)';
    btn.title = n ? `${n} photo${n === 1 ? '' : 's'} attached — tap to add another` : 'Attach photo';
  }
  if (clr) clr.style.display = n ? '' : 'none';

  if (sec) sec.style.display = n ? 'block' : 'none';
  if (countEl) countEl.textContent = String(n);

  if (grid) {
    grid.innerHTML = '';
    _picker.forEach((p, idx) => {
      const card = document.createElement('div');
      card.className = 'pp-thumb-card';

      const img = document.createElement('img');
      img.src = p.dataUrl;
      img.alt = `Photo ${idx + 1}`;
      img.className = 'pp-thumb-img';
      img.title = 'Click to view enlarged';
      img.addEventListener('click', () => {
        if (typeof window.openPhotoLightbox === 'function') window.openPhotoLightbox(p.dataUrl);
      });
      card.appendChild(img);

      const num = document.createElement('span');
      num.className = 'pp-thumb-num';
      num.textContent = `#${idx + 1}`;
      card.appendChild(num);

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'pp-thumb-del';
      del.title = 'Remove this photo';
      del.setAttribute('aria-label', `Remove photo ${idx + 1}`);
      del.innerHTML = '&times;';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        removeProdPhoto(idx);
      });
      card.appendChild(del);

      grid.appendChild(card);
    });

    if (n < MAX_PHOTOS) {
      const addCard = document.createElement('button');
      addCard.type = 'button';
      addCard.className = 'pp-thumb-add-card';
      addCard.title = 'Add another photo';
      addCard.setAttribute('aria-label', 'Add another photo');
      addCard.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>Add</span>
      `;
      addCard.addEventListener('click', () => openProdPhotoCapture());
      grid.appendChild(addCard);
    }
  }
}

export function openProdPhotoPreview(index) {
  const item = _picker[index];
  if (item && item.dataUrl && typeof window.openPhotoLightbox === 'function') {
    window.openPhotoLightbox(item.dataUrl);
  }
}

export function clearProdPhotos() {
  _picker = [];
  _renderPicker();
  _toast('Photos removed from this entry', 'info', 1800);
}

export async function addProdPhotos(fileList) {
  const files = Array.from(fileList || []).filter(f => f && /^image\//.test(f.type));
  if (!files.length) return;
  const room = MAX_PHOTOS - _picker.length;
  if (room <= 0) { _toast(`You can attach up to ${MAX_PHOTOS} photos per entry.`, 'warning'); return; }
  const use = files.slice(0, room);
  if (files.length > room) _toast(`Only ${room} more photo${room === 1 ? '' : 's'} allowed — extra files skipped.`, 'warning');
  for (const f of use) {
    try {
      const raw = await _readFile(f);
      const small = await _compress(raw, 1400, 0.82);
      _picker.push({ key: null, dataUrl: small, isNew: true });
    } catch (e) {
      console.warn('[prod photo] read failed', e);
    }
  }
  _renderPicker();
}

export async function addProdPhotoDataUrl(dataUrl) {
  if (_picker.length >= MAX_PHOTOS) { _toast(`You can attach up to ${MAX_PHOTOS} photos per entry.`, 'warning'); return; }
  const small = await _compress(dataUrl, 1280, 0.75);
  _picker.push({ key: null, dataUrl: small, isNew: true });
  _renderPicker();
}

export function openProdPhotoCapture() {
  if (_picker.length >= MAX_PHOTOS) { _toast(`You can attach up to ${MAX_PHOTOS} photos per entry.`, 'warning'); return; }
  if (typeof window.openPhotoCapture === 'function') window.openPhotoCapture('prod');
}

export function removeProdPhoto(i) {
  _picker.splice(i, 1);
  _renderPicker();
}

export function resetProdPhotos() {
  _picker = [];
  _renderPicker();
}

export async function loadProdPhotosForEdit(rec) {
  _picker = [];
  const keys = Array.isArray(rec && rec.photoKeys) ? rec.photoKeys : [];
  const photos = await _photoStore();
  keys.forEach(k => { if (photos[k]) _picker.push({ key: k, dataUrl: photos[k], isNew: false }); });
  _renderPicker();
}

export function getProdPhotoKeys(prodId) {
  const keep = [];
  const stamp = Date.now();
  _picker.forEach((p, i) => {
    if (!p.key) p.key = `prod:${prodId}:${stamp.toString(36)}${i}`;
    keep.push(p.key);
  });
  return keep;
}

export async function persistProdPhotos(prodId, previousKeys = []) {
  const setMap = {};
  _picker.forEach(p => { if (p.isNew && p.key) setMap[p.key] = p.dataUrl; });
  const keepSet = new Set(_picker.map(p => p.key));
  const del = (previousKeys || []).filter(k => !keepSet.has(k));
  if (Object.keys(setMap).length || del.length) await _writePhotoKeys(setMap, del);
  resetProdPhotos();
}

export async function deleteProdPhotos(rec) {
  const keys = Array.isArray(rec && rec.photoKeys) ? rec.photoKeys : [];
  if (keys.length) await _writePhotoKeys({}, keys);
}

const VIEW_SVG = '<svg width="11" height="11" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><rect x="3" y="7" width="30" height="22" rx="3" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="18" cy="18" r="6" stroke="currentColor" stroke-width="1.6" fill="none"/><circle cx="18" cy="18" r="2.5" fill="currentColor"/><rect x="22" y="4" width="8" height="5" rx="1.5" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>';
const LONG_PRESS_MS = 3000;
const BOX_SVG = '<svg class="pp-box-ring" viewBox="0 0 28 28" aria-hidden="true"><rect class="pp-box-track" x="2" y="2" width="24" height="24" rx="7"/><rect class="pp-box-fill" x="2" y="2" width="24" height="24" rx="7" pathLength="100"/><path class="pp-box-check" d="M8.5 14.5l3.8 3.8 7.2-7.6" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export async function toggleProdPhotoPanel(btn, id, singleKey) {
  if (singleKey) { await openProdPhoto(singleKey); return; }
  const panel = document.getElementById('pp-panel-' + id);
  if (!panel) return;
  const open = panel.style.display === 'none' || !panel.style.display;
  panel.style.display = open ? 'block' : 'none';
  if (open) hydrateProdPhotoThumbs(panel);
}

export function prodPhotoStripHtml(item) {
  const keys = Array.isArray(item.photoKeys) ? item.photoKeys : [];
  if (!keys.length || item.isReturn || item.isTransfer) return '';
  const id = String(item.id).replace(/[^a-z0-9_-]/gi, '');
  const thumbs = keys.map(k => `<img class="pp-strip-img" data-photo-key="${esc(k)}" alt="Product photo" onclick="openProdPhoto('${esc(k)}')">`).join('');
  const checked = _selected.has(item.id);
  const waIcon = '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="display:inline-block;vertical-align:middle;margin-right:2px;"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981z"/></svg>';
  return `<div class="pp-actions"><button type="button" class="pp-badge" title="View photos" onclick="toggleProdPhotoPanel(this,'${id}'${keys.length === 1 ? `,'${esc(keys[0])}'` : ''})">${VIEW_SVG}Photo${keys.length > 1 ? ' \u00d7' + keys.length : ''}</button><div style="display:flex;align-items:center;gap:6px;"><button type="button" class="pp-share-quick-btn" title="Share photos on WhatsApp" onclick="shareProdPhotos(['${esc(item.id)}'])">${waIcon}Share</button><button type="button" class="pp-box${checked ? ' on' : ''}" data-pp-box="${esc(item.id)}" aria-pressed="${checked ? 'true' : 'false'}" title="Tap to select for multi-share" aria-label="Mark or share">${BOX_SVG}</button></div></div><div class="pp-strip" id="pp-panel-${id}" style="display:none;">${thumbs}</div>`;
}

export async function hydrateProdPhotoThumbs(root = document) {
  const imgs = Array.from(root.querySelectorAll('img[data-photo-key]:not([src])'));
  if (!imgs.length) return;
  const photos = await _photoStore();
  imgs.forEach(img => {
    const k = img.getAttribute('data-photo-key');
    const v = _thumbCache.get(k) || photos[k];
    if (v) { img.src = v; _thumbCache.set(k, v); } else { img.classList.add('pp-missing'); }
  });
}

export async function openProdPhoto(key) {
  const photos = await _photoStore();
  const v = photos[key];
  if (v && typeof window.openPhotoLightbox === 'function') window.openPhotoLightbox(v);
}

function _updateShareBar() {
  let bar = document.getElementById('pp-sharebar');
  if (_selected.size === 0) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'pp-sharebar';
    bar.className = 'pp-sharebar';
    document.body.appendChild(bar);
  }
  bar.innerHTML = `<span><b>${_selected.size}</b> entr${_selected.size === 1 ? 'y' : 'ies'} selected</span><div><button type="button" class="pp-bar-clear" onclick="clearProdPhotoSelection()">Clear</button><button type="button" class="pp-bar-share" onclick="shareProdPhotos()">Share on WhatsApp</button></div>`;
}

export function toggleProdPhotoSelect(id, on) {
  if (on) _selected.add(id); else _selected.delete(id);
  document.querySelectorAll('[data-pp-box]').forEach(b => {
    if (b.getAttribute('data-pp-box') === id) { b.classList.toggle('on', !!on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  });
  _updateShareBar();
}

let _hold = null;
function _endHold(box, fired) {
  if (!_hold) return;
  clearTimeout(_hold.timer);
  const h = _hold;
  _hold = null;
  h.box.classList.remove('holding');
  if (!fired && h.box === box && !h.fired) toggleProdPhotoSelect(h.id, !_selected.has(h.id));
}

function _installBoxGestures() {
  if (window.__ppBoxGestures) return;
  window.__ppBoxGestures = true;
  document.addEventListener('pointerdown', (e) => {
    const box = e.target.closest && e.target.closest('[data-pp-box]');
    if (!box || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const id = box.getAttribute('data-pp-box');
    box.classList.add('holding');
    _hold = { id, box, fired: false, timer: setTimeout(() => {
      if (!_hold) return;
      _hold.fired = true;
      box.classList.remove('holding');
      try { if (navigator.vibrate) navigator.vibrate(40); } catch (_) {}
      try { const H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics; if (H) H.impact({ style: 'MEDIUM' }); } catch (_) {}
      shareProdPhotos([id]);
    }, LONG_PRESS_MS) };
  });
  const up = (e) => {
    if (!_hold) return;
    const box = e.target.closest ? e.target.closest('[data-pp-box]') : null;
    const fired = _hold.fired;
    _endHold(fired ? _hold.box : box, fired);
  };
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', () => { if (_hold) { clearTimeout(_hold.timer); _hold.box.classList.remove('holding'); _hold = null; } });
  document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('[data-pp-box]')) e.preventDefault(); });
}
_installBoxGestures();

export function clearProdPhotoSelection() {
  _selected.clear();
  document.querySelectorAll('[data-pp-box]').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); });
  _updateShareBar();
}

function _wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w;
    if (ctx.measureText(t).width > maxWidth && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

async function _captionedBlob(dataUrl, captionLines) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const W = Math.min(1280, img.width);
  const H = Math.round(img.height * (W / img.width));
  const pad = Math.round(W * 0.03);
  const fs = Math.max(20, Math.round(W * 0.034));
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `600 ${fs}px sans-serif`;
  const lines = captionLines.flatMap(l => _wrapText(measure, l, W - pad * 2));
  const bandH = pad * 2 + lines.length * Math.round(fs * 1.3);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H + bandH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, H, W, bandH);
  ctx.fillStyle = '#f8fafc';
  ctx.font = `600 ${fs}px sans-serif`;
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => {
    if (i > 0) ctx.font = `500 ${Math.round(fs * 0.9)}px sans-serif`;
    ctx.fillText(l, pad, H + pad + i * Math.round(fs * 1.3));
  });
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

export async function shareProdPhotos(ids) {
  const wanted = (ids && ids.length ? ids : Array.from(_selected));
  if (!wanted.length) { _toast('Select at least one entry with photos.', 'warning'); return; }
  _toast('Preparing photos…', 'info', 1500);
  const db = ensureArray(await sqliteStore.get('mfg_pro_pkr'));
  const photos = await _photoStore();
  const files = [];
  const textLines = [];
  for (const id of wanted) {
    const rec = db.find(r => r && r.id === id);
    if (!rec) continue;
    const keys = (rec.photoKeys || []).filter(k => photos[k]);
    if (!keys.length) continue;
    const store = getStoreLabel(rec.store) || rec.store || '';
    const capLines = [
      `Date: ${rec.date || ''}`,
      `Gross Weight: ${fmtNum(rec.grossWt || 0)} kg`,
      `Container: ${fmtNum(rec.contWt || 0)} kg`,
      `Net Weight: ${fmtNum(rec.net || 0)} kg`,
      `Total Value: ${fmtAmt(rec.totalSale || 0)}`
    ];
    textLines.push(capLines.join('\n'));
    for (let i = 0; i < keys.length; i++) {
      try {
        const blob = await _captionedBlob(photos[keys[i]], capLines);
        files.push(new File([blob], `production-${rec.date || 'entry'}-${store.replace(/\W+/g, '')}-${files.length + 1}.jpg`, { type: 'image/jpeg' }));
      } catch (e) { console.warn('[prod photo] caption failed', e); }
    }
  }
  if (!files.length) { _toast('No photos found for the selected entries.', 'warning'); return; }
  const text = textLines.join('\n\n');
  const plural = files.length === 1 ? '' : 's';
  const isAbort = (err) => !!err && (err.name === 'AbortError' || /cancel/i.test(String(err.message || err)));

  const tryShare = async (withText) => {
    const data = withText ? { files, title: 'Production photos', text } : { files, title: 'Production photos' };
    if (typeof window.nativeShareFiles === 'function' && window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
      await window.nativeShareFiles(files, data);
    } else {
      await navigator.share(data);
    }
  };

  const canShareFiles = !!(navigator.canShare && navigator.canShare({ files }));
  if (canShareFiles) {
    try {
      await tryShare(true);
      _toast(`Shared ${files.length} photo${plural}`, 'success');
      clearProdPhotoSelection();
      return;
    } catch (err) {
      if (isAbort(err)) { _toast('Share cancelled', 'info'); return; }
      console.warn('[prod photo] share failed:', err && (err.name + ': ' + err.message));
      if (err && err.name === 'NotAllowedError' && typeof window.showGlassConfirm === 'function') {
        const go = await window.showGlassConfirm(`${files.length} photo${plural} ready to share.`, { title: 'Share Photos', confirmText: 'Share', cancelText: 'Cancel' });
        if (!go) return;
        try {
          await tryShare(true);
          _toast(`Shared ${files.length} photo${plural}`, 'success');
          clearProdPhotoSelection();
          return;
        } catch (err2) {
          if (isAbort(err2)) { _toast('Share cancelled', 'info'); return; }
          console.warn('[prod photo] retry failed:', err2 && (err2.name + ': ' + err2.message));
        }
      }
      try {
        await tryShare(false);
        _toast(`Shared ${files.length} photo${plural}`, 'success');
        clearProdPhotoSelection();
        return;
      } catch (err3) {
        if (isAbort(err3)) { _toast('Share cancelled', 'info'); return; }
        console.warn('[prod photo] share without text failed:', err3 && (err3.name + ': ' + err3.message));
        _toast('Could not open the share sheet: ' + ((err3 && err3.message) || 'unknown error'), 'error', 5000);
        return;
      }
    }
  }

  files.forEach((f, i) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    setTimeout(() => { a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, i * 250);
  });
  _toast(`Sharing isn't supported here \u2014 saved ${files.length} photo${plural}. Opening WhatsApp\u2026`, 'info', 4000);
  setTimeout(() => window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'), files.length * 250 + 500);
  clearProdPhotoSelection();
}

Object.assign(window, {
  addProdPhotos, clearProdPhotos, addProdPhotoDataUrl, openProdPhotoCapture, toggleProdPhotoPanel, removeProdPhoto, openProdPhoto, toggleProdPhotoSelect, clearProdPhotoSelection, shareProdPhotos, resetProdPhotos
});
