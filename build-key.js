import { createHash } from 'node:crypto';

export function computeBuildKey(entries) {
  const h = createHash('sha256');
  [...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).forEach(([name, content]) => {
    h.update(name);
    h.update('\0');
    h.update(content);
    h.update('\0');
  });
  return h.digest('hex').slice(0, 10);
}

export function replaceOrThrow(text, from, to, label) {
  if (!text.includes(from)) throw new Error(`Build step "${label}" found nothing to replace (${from}). index.html and build.js are out of step.`);
  return text.replace(from, to);
}
