import { txDeviceCompare } from './tx-date.js';

const EPS = 0.0001;
const num = v => Number(v) || 0;

export function pickReturnsCovered(pending, ret, exp) {
  const sorted = [...(pending || [])].sort(txDeviceCompare);
  let usedRet = 0, usedExp = 0;
  const picked = [];
  for (const r of sorted) {
    const nr = usedRet + num(r.returnedQty), ne = usedExp + num(r.expiredQty);
    if (nr > num(ret) + EPS || ne > num(exp) + EPS) break;
    usedRet = nr; usedExp = ne;
    picked.push(r);
  }
  return picked;
}
