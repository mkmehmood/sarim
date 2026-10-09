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
  const n = _picker.length;
  if (dot) { dot.style.display = n ? '' : 'none'; dot.textContent = n > 1 ? String(n) : ''; dot.classList.toggle('pp-dot-count', n > 1); }
  if (btn) {
    btn.style.borderColor = n ? 'var(--accent)' : 'var(--glass-border)';
    btn.title = n ? `${n} photo${n === 1 ? '' : 's'} attached — tap to add another` : 'Attach photo';
  }
  if (clr) clr.style.display = n ? '' : 'none';
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

const VIEW_SVG = '<svg width="11" height="11" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0;"><path d="M4 13A3.2 3.2 0 0 1 7.2 9.8H10.4L12.6 6.5H23.4L25.6 9.8H28.8A3.2 3.2 0 0 1 32 13V27A3.2 3.2 0 0 1 28.8 30.2H7.2A3.2 3.2 0 0 1 4 27Z" fill="currentColor" fill-opacity="0.13" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round"/><circle cx="18" cy="19.5" r="5.8" fill="currentColor" fill-opacity="0.28" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="19.5" r="2" fill="currentColor"/><circle cx="27.5" cy="14" r="1.3" fill="currentColor"/></svg>';
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
  return `<div class="pp-actions"><button type="button" class="pp-badge" title="View photos" onclick="toggleProdPhotoPanel(this,'${id}'${keys.length === 1 ? `,'${esc(keys[0])}'` : ''})">${VIEW_SVG}Photo${keys.length > 1 ? ' \u00d7' + keys.length : ''}</button><button type="button" class="pp-box${checked ? ' on' : ''}" data-pp-box="${esc(item.id)}" aria-pressed="${checked ? 'true' : 'false'}" title="Tap to mark \u2022 hold 3 seconds to share" aria-label="Mark or share">${BOX_SVG}</button></div><div class="pp-strip" id="pp-panel-${id}" style="display:none;">${thumbs}</div>`;
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

  const copyText = async () => {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
  };

  const tryShare = async () => {
    const data = { files, title: 'Production photos' };
    if (typeof window.nativeShareFiles === 'function' && window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) {
      await window.nativeShareFiles(files, data);
    } else {
      await navigator.share(data);
    }
  };

  const canShareFiles = !!(navigator.canShare && navigator.canShare({ files }));
  if (canShareFiles) {
    const done = async () => {
      const copied = await copyText();
      _toast(`Shared ${files.length} photo${plural}` + (copied ? ' \u2014 details copied, paste if needed' : ''), 'success');
      clearProdPhotoSelection();
    };
    try {
      await tryShare();
      await done();
      return;
    } catch (err) {
      if (isAbort(err)) { _toast('Share cancelled', 'info'); return; }
      console.warn('[prod photo] share failed:', err && (err.name + ': ' + err.message));
      if (err && err.name === 'NotAllowedError' && typeof window.showGlassConfirm === 'function') {
        const go = await window.showGlassConfirm(`${files.length} photo${plural} ready to share.`, { title: 'Share Photos', confirmText: 'Share', cancelText: 'Cancel' });
        if (!go) return;
        try {
          await tryShare();
          await done();
          return;
        } catch (err2) {
          if (isAbort(err2)) { _toast('Share cancelled', 'info'); return; }
          console.warn('[prod photo] retry failed:', err2 && (err2.name + ': ' + err2.message));
          _toast('Could not open the share sheet: ' + ((err2 && err2.message) || 'unknown error'), 'error', 5000);
          return;
        }
      }
      _toast('Could not open the share sheet: ' + ((err && err.message) || 'unknown error'), 'error', 5000);
      return;
    }
  }

  files.forEach((f, i) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a);
    setTimeout(() => { a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }, i * 250);
  });
  let imageCopied = false;
  try {
    if (navigator.clipboard && navigator.clipboard.write && typeof ClipboardItem !== 'undefined') {
      const bmp = await createImageBitmap(files[0]);
      const c = document.createElement('canvas');
      c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d').drawImage(bmp, 0, 0);
      const png = await new Promise(r => c.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({
        'image/png': png,
        'text/plain': new Blob([text], { type: 'text/plain' })
      })]);
      imageCopied = true;
    }
  } catch (e) { console.warn('[prod photo] image clipboard failed', e); }
  const copied = imageCopied || await copyText();
  _toast(`Saved ${files.length} photo${plural}` + (imageCopied ? '. Photo copied \u2014 press Ctrl+V in WhatsApp' : (copied ? ', details copied. Attach the photos in WhatsApp' : '. Attach the photos in WhatsApp')), 'info', 6000);
  setTimeout(() => window.open('https://wa.me/', '_blank'), files.length * 250 + 500);
  clearProdPhotoSelection();
}

Object.assign(window, {
  addProdPhotos, clearProdPhotos, addProdPhotoDataUrl, openProdPhotoCapture, toggleProdPhotoPanel, removeProdPhoto, openProdPhoto, toggleProdPhotoSelect, clearProdPhotoSelection, shareProdPhotos, resetProdPhotos
});
