const XHTML = 'http://www.w3.org/1999/xhtml';
const SVG_NS = 'http://www.w3.org/2000/svg';

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function inlineFontFace(cssText) {
  const m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(cssText);
  if (!m || m[1].startsWith('data:')) return cssText;
  try {
    const res = await fetch(m[1]);
    if (!res.ok) return cssText;
    return cssText.replace(m[0], `url("${await readAsDataUrl(await res.blob())}")`);
  } catch (_) {
    return cssText;
  }
}

let cssCache = null;

async function collectCss(root) {
  if (cssCache) return cssCache;
  const families = new Set();
  root.querySelectorAll('*').forEach((el) => {
    getComputedStyle(el).fontFamily.split(',').forEach((f) => families.add(f.trim().replace(/^["']|["']$/g, '').toLowerCase()));
  });
  const rules = [];
  const faces = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let list;
    try { list = Array.from(sheet.cssRules); } catch (_) { continue; }
    for (const rule of list) {
      if (typeof CSSFontFaceRule !== 'undefined' && rule instanceof CSSFontFaceRule) {
        const fam = String(rule.style.getPropertyValue('font-family')).trim().replace(/^["']|["']$/g, '').toLowerCase();
        if (families.has(fam)) faces.push(inlineFontFace(rule.cssText));
      } else if (!/^@import/i.test(rule.cssText)) {
        rules.push(rule.cssText);
      }
    }
  }
  cssCache = `${(await Promise.all(faces)).join('\n')}\n${rules.join('\n')}`;
  return cssCache;
}

export async function renderMarkupImage(markup, { width = 420, scale = 3 } = {}) {
  const host = document.createElement('div');
  host.setAttribute('data-theme', 'light');
  host.className = 'invp-capture-host';
  const box = document.createElement('div');
  box.style.setProperty('width', `${width}px`);
  box.innerHTML = markup;
  host.appendChild(box);
  document.body.appendChild(host);
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await new Promise((r) => requestAnimationFrame(() => r()));
    const W = Math.ceil(box.offsetWidth);
    const H = Math.ceil(box.offsetHeight);
    const bodyStyle = getComputedStyle(document.body);
    const css = await collectCss(box);
    const svgEl = document.createElementNS(SVG_NS, 'svg');
    svgEl.setAttribute('width', String(W));
    svgEl.setAttribute('height', String(H));
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svgEl.setAttribute('data-theme', 'light');
    const sheet = document.createElementNS(SVG_NS, 'style');
    sheet.textContent = css;
    const fo = document.createElementNS(SVG_NS, 'foreignObject');
    fo.setAttribute('width', String(W));
    fo.setAttribute('height', String(H));
    const wrap = document.createElementNS(XHTML, 'div');
    wrap.setAttribute('data-theme', 'light');
    [['width', `${W}px`], ['height', `${H}px`], ['margin', '0'], ['font-family', bodyStyle.fontFamily], ['font-size', bodyStyle.fontSize], ['color', bodyStyle.color]].forEach(([k, v]) => wrap.style.setProperty(k, v));
    wrap.appendChild(box.cloneNode(true));
    fo.appendChild(wrap);
    svgEl.append(sheet, fo);
    const svg = new XMLSerializer().serializeToString(svgEl);
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Could not render the image.'));
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = W * scale;
    canvas.height = H * scale;
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed.'))), 'image/png'));
  } finally {
    host.remove();
  }
}

export async function warmMarkupImage(markup, opts) {
  try { await renderMarkupImage(markup, { width: 420, scale: 1, ...(opts || {}) }); } catch (_) { }
}
