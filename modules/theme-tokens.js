function declared(token) {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

function toRgb(value) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value);
  return fn ? [Math.round(fn[1]), Math.round(fn[2]), Math.round(fn[3])] : null;
}

export function themeColor(token, percent) {
  if (typeof document === 'undefined' || !document.documentElement) return `var(${token})`;
  const value = declared(token);
  const rgb = toRgb(value);
  if (!rgb) return value || `var(${token})`;
  if (percent == null || percent >= 100) return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${percent / 100})`;
}

export function themeVar(token, percent) {
  if (percent == null || percent >= 100) return `var(${token})`;
  return `color-mix(in srgb, var(${token}) ${percent}%, transparent)`;
}
