const num = (v, d = 0) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

export function fmtNum(value, maxDecimals = 2) {
  const n = num(value, 0);
  if (!isFinite(n)) return '0';
  const p = Math.pow(10, maxDecimals);
  const rounded = Math.round((Math.abs(n) + Number.EPSILON) * p) / p;
  const [intPart, fracRaw = ''] = rounded.toFixed(maxDecimals).split('.');
  const frac = fracRaw.replace(/0+$/, '');
  let grouped = intPart;
  if (intPart.length > 3) {
    grouped = intPart.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + intPart.slice(-3);
  }
  const body = frac ? grouped + '.' + frac : grouped;
  return n < 0 && rounded !== 0 ? '-' + body : body;
}

export function round2(v) {
  const n = Number(v);
  return isFinite(n) ? Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100 : 0;
}

export function lockedUnitPrice(t) {
  if (!t) return 0;
  const up = num(t.unitPrice, 0);
  if (up > 0) return up;
  const qty = num(t.quantity, 0);
  const tv = num(t.totalValue, 0);
  return qty > 0 && tv > 0 ? tv / qty : 0;
}

export function lockedSaleValue(t) {
  if (!t) return null;
  const qty = num(t.quantity, 0);
  if (qty <= 0) return num(t.totalValue, 0);
  const up = num(t.unitPrice, 0);
  if (up > 0) return round2(qty * up);
  const tv = num(t.totalValue, 0);
  return tv > 0 ? round2(tv) : null;
}

export function debtNeedsGross(t) {
  if (!t || t.creditReceived) return false;
  if (t.transactionType === 'OLD_DEBT') return true;
  return t.paymentType === 'CREDIT' && !(t.isMerged && typeof t.creditValue === 'number');
}

export function collectionExpiredLeft(t) {
  if (!t) return 0;
  return round2(Math.max(0, num(t.expiredValue, 0) - Math.max(0, num(t.expiredAllocated, 0))));
}

export function debtDelta(t, grossValue, opts) {
  if (!t) return 0;
  const partial = num(t.partialPaymentReceived, 0);
  const gross = num(grossValue, 0);
  if (t.isRepReturn === true || t.paymentType === 'REP_RETURN') {
    const v = round2(Math.max(0, num(t.returnValue, 0)));
    if (v <= 0) return 0;
    const done = opts && opts.reconciledReturnIds;
    if (done && typeof done.has === 'function' && done.has(t.id)) return 0;
    return -v;
  }
  if (t.transactionType === 'OLD_DEBT') {
    return t.creditReceived ? 0 : round2(Math.max(0, gross - partial));
  }
  if (t.paymentType === 'CREDIT' && !t.creditReceived) {
    if (t.isMerged && typeof t.creditValue === 'number') return round2(Math.max(0, t.creditValue));
    return round2(Math.max(0, gross - partial));
  }
  if (t.paymentType === 'COLLECTION' || t.paymentType === 'PARTIAL_PAYMENT') {
    return round2(-(Math.max(0, num(t.totalValue, 0)) + collectionExpiredLeft(t)));
  }
  return 0;
}

export function rowReceived(t, value) {
  const z = { sale: 0, collection: 0, returns: 0, cash: 0, paid: 0, received: 0 };
  if (!t || t.isMerged || t.transactionType === 'OLD_DEBT') return z;
  if (t.isRepReturn === true || t.paymentType === 'REP_RETURN') {
    z.returns = Math.max(0, num(t.returnValue, 0));
  } else if (t.paymentType === 'COLLECTION' || t.paymentType === 'PARTIAL_PAYMENT') {
    const collected = t.collectedAmount != null ? num(t.collectedAmount, 0) : num(t.totalValue, 0);
    z.collection = Math.max(0, collected) + Math.max(0, num(t.expiredValue, 0));
  } else {
    const v = Math.max(0, num(value, 0));
    z.sale = v;
    if (t.paymentType === 'CASH') z.cash = v;
    else if (t.paymentType === 'CREDIT' && t.creditReceived && !(Array.isArray(t.collectionAllocs) && t.collectionAllocs.length)) z.paid = v;
  }
  z.received = z.collection + z.returns + z.cash + z.paid;
  return z;
}

export function periodTotals(rows) {
  let sale = 0;
  let collection = 0;
  let returns = 0;
  let cashSales = 0;
  let paidSales = 0;
  for (const row of rows || []) {
    const r = rowReceived(row && row.t, row && row.value);
    sale += r.sale; collection += r.collection; returns += r.returns; cashSales += r.cash; paidSales += r.paid;
  }
  return { totalSale: round2(sale), collection: round2(collection), returns: round2(returns), totalCollection: round2(collection + returns), cashSales: round2(cashSales), paidSales: round2(paidSales), totalReceived: round2(collection + returns + cashSales + paidSales) };
}

export function periodLine(kg, sold, received) {
  const parts = [];
  if (num(kg, 0) > 0) parts.push(`${fmtNum(round2(kg))} kg sold`);
  parts.push(`Sold: ${fmtNum(round2(sold))}`);
  parts.push(`Received: ${fmtNum(round2(received))}`);
  return parts.join(' | ');
}
export function soldQuantity(t) {
  if (!t || t.isMerged || t.transactionType === 'OLD_DEBT') return 0;
  if (t.isRepReturn === true || t.paymentType === 'REP_RETURN' || t.paymentType === 'COLLECTION' || t.paymentType === 'PARTIAL_PAYMENT') return 0;
  return Math.max(0, num(t.quantity, 0));
}
export function periodQuantity(rows) {
  let qty = 0;
  for (const row of rows || []) qty += soldQuantity(row && row.t);
  return round2(qty);
}
export function localDateStr(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
