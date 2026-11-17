import { txDeviceCompare } from './tx-date.js';

const EPS = 0.0001;
const num = v => Number(v) || 0;

const cents = v => Math.round(num(v) * 100);
const MAX_EXACT = 24;

function findExactCover(sorted, ret, exp) {
  if (!sorted.length || sorted.length > MAX_EXACT) return null;
  const tr = cents(ret), te = cents(exp);
  const r = sorted.map(x => cents(x.returnedQty)), e = sorted.map(x => cents(x.expiredQty));
  const sufR = new Array(sorted.length + 1).fill(0), sufE = new Array(sorted.length + 1).fill(0);
  for (let i = sorted.length - 1; i >= 0; i--) { sufR[i] = sufR[i + 1] + r[i]; sufE[i] = sufE[i + 1] + e[i]; }
  const pick = [];
  let steps = 0;
  const go = (i, needR, needE) => {
    if (needR === 0 && needE === 0) return true;
    if (i >= sorted.length || ++steps > 200000) return false;
    if (needR > sufR[i] || needE > sufE[i]) return false;
    if (r[i] <= needR && e[i] <= needE && (r[i] > 0 || e[i] > 0)) {
      pick.push(i);
      if (go(i + 1, needR - r[i], needE - e[i])) return true;
      pick.pop();
    }
    return go(i + 1, needR, needE);
  };
  return go(0, tr, te) ? pick.map(i => sorted[i]) : null;
}

export function pickReturnsCovered(pending, ret, exp) {
  const sorted = [...(pending || [])].sort(txDeviceCompare);
  const exact = findExactCover(sorted, ret, exp);
  if (exact) return exact;
  let usedRet = 0, usedExp = 0;
  const picked = [];
  for (const r of sorted) {
    const nr = usedRet + num(r.returnedQty), ne = usedExp + num(r.expiredQty);
    if (nr > num(ret) + EPS || ne > num(exp) + EPS) continue;
    usedRet = nr; usedExp = ne;
    picked.push(r);
  }
  return picked;
}
