import 'package:sarim_core/sarim_core.dart';

String money(num v) => 'Rs ${fmtNum(v)}';

/// Balance as the web ledger shows it: credit balances end in "CR".
String balanceText(double bal) => bal < -0.005 ? '${money(-bal)} CR' : money(bal > 0 ? bal : 0);

String entryTitle(EntryKind k) {
  switch (k) {
    case EntryKind.sale:
      return 'Cash sale';
    case EntryKind.creditSale:
      return 'Credit sale';
    case EntryKind.collection:
      return 'Collection';
    case EntryKind.partialPayment:
      return 'Partial payment';
    case EntryKind.moneyOut:
      return 'Money out';
    case EntryKind.oldDebt:
      return 'Old debt';
    case EntryKind.openingBalance:
      return 'Opening balance';
    case EntryKind.repReturn:
      return 'Rep return';
  }
}
