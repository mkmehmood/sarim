import 'dart:math' as math;

import 'js_num.dart';

/// Values typed into the Calculator tab. A blank field is 0, like the web form's `parseFloat(value) || 0`.
class CalcInputs {
  const CalcInputs({
    this.sold = 0,
    this.returned = 0,
    this.expired = 0,
    this.shared = 0,
    this.credit = 0,
    this.prevCreditReceived = 0,
    this.receivedCash = 0,
    this.fieldExpenses = 0,
    this.salePrice = 0,
    this.commissionPerUnit = 0,
    this.commissionPaid = 0,
  });
  final double sold, returned, expired, shared, credit;
  final double prevCreditReceived, receivedCash, fieldExpenses;
  final double salePrice, commissionPerUnit, commissionPaid;
}

enum CashStatus { match, short, over }

class CalcResult {
  const CalcResult({
    required this.netSold,
    required this.expectedCash,
    required this.status,
    required this.amount,
    required this.grossCommission,
    required this.commissionPaid,
    required this.commissionPayable,
  });
  final double netSold; // kg after returns, expired and shared
  final double expectedCash;
  final CashStatus status;
  final double amount; // how much short or over (0 when matched)
  final double grossCommission, commissionPaid, commissionPayable;
}

double _safe(double v) => v.isNaN || v.isInfinite ? 0 : v;

/// The web Calculator's live reconciliation (`calculateSales` in calc-tab.js): expected cash from the
/// cash kg, plus earlier credit received, minus field expenses and commission paid, compared with the cash handed over.
CalcResult calcReconcile(CalcInputs i) {
  final netSold = math.max(0.0, i.sold - i.returned - i.expired - i.shared);
  final cashQty = math.max(0.0, netSold - i.credit);
  final expected = (cashQty * i.salePrice) + i.prevCreditReceived - i.fieldExpenses - i.commissionPaid;
  final diff = i.receivedCash - expected;
  CashStatus status;
  double amount;
  if (diff.abs() < 0.01) {
    status = CashStatus.match;
    amount = 0;
  } else if (diff < -0.01) {
    status = CashStatus.short;
    amount = diff.abs();
  } else {
    status = CashStatus.over;
    amount = diff;
  }
  final gross = i.commissionPerUnit * netSold;
  return CalcResult(
    netSold: round2(netSold),
    expectedCash: _safe(expected),
    status: status,
    amount: _safe(amount),
    grossCommission: _safe(gross),
    commissionPaid: _safe(i.commissionPaid),
    commissionPayable: _safe(math.max(0.0, gross - i.commissionPaid)),
  );
}
