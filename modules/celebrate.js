const KEY = 'sarim_party_fx';
const COLORS = ['#F87171', '#FBBF24', '#34D399', '#60A5FA', '#A78BFA', '#F472B6', '#FB923C', '#2DD4BF'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
let layer = null;
let lastAt = 0;
let cleanTimer = null;
export function partyEnabled() {
  try { if (localStorage.getItem(KEY) === 'off') return false; } catch (_) {}
  try { if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch (_) {}
  return true;
}
export function setPartyEffects(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (_) {}
}
export function celebrate({ size = 'small' } = {}) {
  if (typeof document === 'undefined' || document.hidden || !partyEnabled()) return false;
  const now = Date.now();
  if (now - lastAt < 2500) return false;
  lastAt = now;
  const big = size === 'big';
  const ribbons = big ? 30 : 14;
  const balloons = big ? 7 : 3;
  if (layer && layer.isConnected) layer.remove();
  clearTimeout(cleanTimer);
  layer = document.createElement('div');
  layer.className = 'pf-layer';
  layer.setAttribute('aria-hidden', 'true');
  const lo = big ? 3 : 20, hi = big ? 97 : 80;
  for (let n = 0; n < ribbons; n++) {
    const r = document.createElement('span');
    r.className = 'pf-r';
    r.style.cssText = `left:${rnd(lo, hi).toFixed(1)}%;--dx:${Math.round(rnd(-70, 70))}px;--fall:${rnd(2.4, 3.8).toFixed(2)}s;--dl:${rnd(0, 0.55).toFixed(2)}s`;
    const i = document.createElement('i');
    i.style.cssText = `width:${Math.round(rnd(5, 8))}px;height:${Math.round(rnd(14, 28))}px;background:${pick(COLORS)};--rot:${Math.round(rnd(25, 80))}deg;--fl:${rnd(0.45, 0.95).toFixed(2)}s`;
    r.appendChild(i);
    layer.appendChild(r);
  }
  for (let n = 0; n < balloons; n++) {
    const b = document.createElement('span');
    b.className = 'pf-b';
    b.style.cssText = `left:${rnd(big ? 6 : 15, big ? 90 : 82).toFixed(1)}%;--dx:${Math.round(rnd(-40, 40))}px;--rise:${rnd(3.0, 4.2).toFixed(2)}s;--dl:${rnd(0.05, 0.7).toFixed(2)}s`;
    const i = document.createElement('i');
    i.className = 'pf-bb';
    i.style.cssText = `--c:${pick(COLORS)};--sw:${rnd(1.2, 2).toFixed(2)}s`;
    b.appendChild(i);
    layer.appendChild(b);
  }
  document.body.appendChild(layer);
  cleanTimer = setTimeout(() => { if (layer) layer.remove(); layer = null; }, 5200);
  return true;
}
if (typeof window !== 'undefined') {
  window.celebrate = celebrate;
  window.setPartyEffects = setPartyEffects;
}
