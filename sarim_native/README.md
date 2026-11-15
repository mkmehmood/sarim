# Sarim - native Flutter app (in progress)

A real Dart/Flutter rewrite (no WebView), built in phases. The business rules live in a pure-Dart
package that is tested against the web app's own JavaScript, so balances match to the paisa.

```
sarim_native/
  packages/sarim_core/   pure Dart: finance rules, customer ledger, Money Out, record ids, offline queue,
                         Firebase sign-in + Firestore sync (REST). Runs and is tested with plain `dart`.
  app/                   Flutter UI: login, customers, ledger, add customer, Money Out, delete, sync.
```

## Phase status
| Phase | Scope | Status |
|---|---|---|
| 1 | Local store, record model, Firebase login, offline queue + two-way sync (sales, customers, deletions) | done, tested |
| 2 | Customers list, customer ledger (running balance, totals), add customer, Money Out, delete entry | done, tested |
| 3 | Sales entry, collections with allocation, payments, partial payments | not started |
| 4 | Factory, reps, stock, expenses | not started |
| 5 | Approvals / staff roles, reports, PDF statements, backup/restore | not started |

Until phase 5 is finished the WebView app on the `flutter-app` branch is the complete one.

## What is verified
`cd packages/sarim_core && dart run test/parity_test.dart && dart run test/ledger_test.dart && dart run test/repository_test.dart`

* `parity_test` / `ledger_test`: 400 random ledgers (credit/cash sales, old debt, opening balances, Money Out,
  rep returns, collections with allocations, expired credit) are run through the web app's `modules/finance.js`
  and `modules/tx-date.js`; the Dart port must give identical deltas, debit/credit splits, received totals,
  quantities, row order and running balances (about 34,000 checks).
  Regenerate fixtures with `node packages/sarim_core/tool/gen_fixtures.mjs` from the repo root.
* `repository_test`: Money Out maths, validation, add customer, delete guards, offline queue, two-device sync,
  tombstones, Firestore codec, atomic file store, id format.

The Flutter UI (`app/`) is covered by `flutter test` (CI) but could not be compiled in the authoring sandbox.

## Run
```bash
cd sarim_native/app
bash tools/setup_android.sh        # flutter create + config + icons
flutter pub get && flutter test && flutter run
```

## Known limits (phase 1-2)
* Owner accounts only: staff accounts that read a workspace owner's data and approval-gated writes are phase 5.
* Sales, collections and payment entry are not in the app yet; the ledger shows them and syncs them.
* Deleting a sale that has payments applied, or a payment applied to sales, is blocked (use the web app).
* Customers created here have no opening balance; add old debt in the web app for now.
* Session tokens are kept in the app's private storage (not the Android keystore).
