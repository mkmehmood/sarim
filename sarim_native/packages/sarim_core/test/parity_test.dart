import 'dart:convert';
import 'dart:io';

import 'package:sarim_core/sarim_core.dart';

import 'support.dart';

/// Differential test: every number below was produced by the web app's own finance.js
/// (see tool/gen_fixtures.mjs). The Dart port must reproduce it exactly.
Future<void> main() async {
  final data = jsonDecode(File('test/fixtures/finance_cases.json').readAsStringSync()) as Map<String, dynamic>;

  await group('number formatting matches finance.js', () async {
    for (final n in data['numbers'] as List) {
      final m = n as Map<String, dynamic>;
      eq(fmtNum(m['v']), m['fmt'], 'fmtNum(${m['v']})');
      eq(round2(m['v']), m['round2'], 'round2(${m['v']})');
    }
  });

  await group('400 random ledgers: deltas, splits, received, quantities', () async {
    var i = 0;
    for (final c in data['cases'] as List) {
      final cs = c as Map<String, dynamic>;
      final recs = [for (final r in cs['records'] as List) Map<String, dynamic>.from(r as Map)];
      final reconciled = {for (final r in cs['reconciled'] as List) '$r'};
      final honor = allocHonor(recs);
      final opts0 = LedgerOpts(reconciledReturnIds: reconciled);
      final opts = LedgerOpts(reconciledReturnIds: reconciled, honor: honor);
      final per = cs['per'] as List;
      for (var k = 0; k < recs.length; k++) {
        final t = recs[k];
        final e = per[k] as Map<String, dynamic>;
        final tag = 'case $i rec ${t['id']} (${t['paymentType']})';
        final gross = (e['gross'] as num).toDouble();
        eq(debtNeedsGross(t), e['needsGross'], '$tag needsGross');
        eq(debtDelta(t, gross, opts0), e['debt'], '$tag debtDelta');
        eq(ledgerDelta(t, gross, opts), e['ledger'], '$tag ledgerDelta');
        final sp = ledgerSplit(t, gross, opts);
        final es = e['split'] as List;
        eq(sp.debit, es[0], '$tag split.debit');
        eq(sp.credit, es[1], '$tag split.credit');
        eq(sp.delta, es[2], '$tag split.delta');
        final lv = lockedSaleValue(t);
        final value = lv ?? 0.0;
        final rr = rowReceived(t, value);
        final er = e['recv'] as List;
        final got = [rr.sale, rr.collection, rr.returns, rr.cash, rr.paid, rr.received, rr.moneyOut];
        for (var j = 0; j < got.length; j++) { eq(got[j], er[j], '$tag rowReceived[$j]'); }
        eq(soldQuantity(t), e['sold'], '$tag soldQuantity');
        eq(returnedQuantity(t), e['returned'], '$tag returnedQuantity');
        eq(netSoldQuantity(t), e['net'], '$tag netSoldQuantity');
        eq(lv, e['locked'], '$tag lockedSaleValue');
        eq(lockedUnitPrice(t), e['lockedUnit'], '$tag lockedUnitPrice');
        eq(honoredToSale(honor, t), e['honored'], '$tag honoredToSale');
      }
      final tot = periodTotals(recs.map((t) => (t: t, value: lockedSaleValue(t) ?? 0.0)));
      final et = cs['totals'] as Map<String, dynamic>;
      eq(tot.totalSale, et['totalSale'], 'case $i totalSale');
      eq(tot.collection, et['collection'], 'case $i collection');
      eq(tot.returns, et['returns'], 'case $i returns');
      eq(tot.totalCollection, et['totalCollection'], 'case $i totalCollection');
      eq(tot.cashSales, et['cashSales'], 'case $i cashSales');
      eq(tot.paidSales, et['paidSales'], 'case $i paidSales');
      eq(tot.totalReceived, et['totalReceived'], 'case $i totalReceived');
      eq(periodQuantity(recs), cs['periodQty'], 'case $i periodQuantity');
      i++;
    }
  });

  exit(finish());
}
