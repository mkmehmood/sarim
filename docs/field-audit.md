# Field audit: every tab and sub-screen

Method: the real app modules and the real SQLite engine were driven headlessly (jsdom). Every input field was filled with valid and invalid values and each save was checked against the stored data and the cash figures. Confirm dialogs were skipped by the harness, so findings that a real dialog may cover are marked.

## Fixed

| Area | Flaw | Fix |
|---|---|---|
| Sales, Rep, Entity, Supplier | Phone numbers were never validated | `phoneIssue` (7 to 15 digits, optional +) |
| All save forms | No future-date or invalid-date check | `dateIssue` on sales, collections, rep, payments, purchases, factory units, production, both transfers and the ledger |
| Sales, Rep | Customer name casing split one customer into several debtors | `canonicalName` reuses the stored spelling |
| Sales, Rep, Payments, Transfers | Amounts not rounded to 2 decimals (1022.0000000000001) | `round2` / `roundMoney` |
| Purchases | Blank new supplier or no existing supplier picked saved with no supplier and no payable | Now blocked with a message |
| Purchases | Conversion factor 0 silently became 1 | Blocked |
| Factory units | 2.7 units silently became 2 | Whole numbers only |
| Ledger | "12abc" saved as 12, "1.2.3" as 1.2, no upper limit | Strict amount, max 10,000,000,000 |
| Ledger | Invalid dates stored as typed | Rejected |
| Ledger | No length limits | party 120, note 500, reference 60 |
| Ledger | Transfer with no destination became "Bank Transfer" | Destination required |
| Sales, Rep search | Typed text inserted as HTML | Escaped |
| Production delete | Message said the whole batch "was already sold" | Now states the shortfall |

## Not a flaw (corrected)

- Over-collection: the app already asks for confirmation ("Proceed only if this is an advance payment"). The harness had skipped the dialog.

## Open, needs an owner decision

1. Cash in hand adds the production sale value (unsold stock) and then each cash sale on top.
2. Expired stock counted in a collection is treated as cash received.
3. Overview "Net cash" counts a credit purchase (supplier payable) as money in.
4. Calculator expected cash uses only the default store's price and the supplied quantity, not what the rep recorded.
5. Rep tab has no stock limit. Rep cash sales are never marked as reconciled, so a limit cannot be computed without changing the model.
6. Payments tab creates a new entity from an unknown name.
7. Money transfer between entities has no balance check.
8. "New supplier" with an existing name reuses that entity and ignores the phone typed.

## Verified working

Deleting production, factory units, purchases, credit sales and collections is blocked or reversed correctly. Stock checks hold for direct sales, rep returns, factory units, production and stock transfers. Cash moved by exactly the entered amount for sales, collections, payments, expenses and the calculator.
