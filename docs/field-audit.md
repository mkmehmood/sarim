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

## Decided with the owner and fixed

| # | Decision | Change |
|---|---|---|
| 1 | Unsold production is assumed to be a cash sale. Profit and cash come from unsold stock + sold + reconciled in the Calculator. | Cash in hand, the cash tracker and the balance sheet now use production value minus sold stock plus returned stock, so a sale no longer counts the same stock twice. A cash sale moves stock into cash (no change), a credit sale moves it to receivables, rep supply moves it out until the Calculator receives the cash, and rep returns put it back. |
| 2 | Expired stock reduces the customer's credit but is not cash. | The expired part of a collection is taken out of cash everywhere. |
| 3 | A credit purchase is not cash. | Overview net cash ignores supplier payable IN rows (shown as "Credit purchase"). |
| 7 | Transfers between entities need a balance check. | The sending entity needs at least that balance (IN minus OUT). Editing a transfer adds its own amount back first. |
| 8 | New supplier with an existing name. | Blocked with a message to use "Existing supplier". |

Found while verifying #1: customer **Money Out** and **Collection** rows are saved with `creditReceived: true`, so the cash formulas counted them as sales. Money Out therefore raised cash instead of lowering it. All three formulas now classify those rows by type first.

## Second pass: limits and unvalidated fields (fixed)

Re-ran every form against the current code. The remaining gaps were missing range limits and a few fields with no check at all.

| Area | Change |
|---|---|
| Shared limits | `LIMITS`, `numberIssue`, `nameIssue`, `quantityIssue`, `unitCostIssue` and `duplicateName` in `input-guards.js`. Numbers must be plain (no `1e12`, no spaces inside, no repeated dots). |
| Raw material purchase | Quantity 0.001 to 1,000,000, cost 0.01 to 100,000,000, conversion factor 0.001 to 100,000, name 80 and unit 30 characters, supplier name 80, unit name required when the conversion factor is not 1. |
| Production | Gross weight required (0.001 to 1,000,000), container weight 0 or more, formula units above 0, all plain numbers. A negative container weight can no longer make net larger than gross. |
| Sales and rep sales | Customer name at most 80 characters, quantity 0.001 to 1,000,000. The rep stock limit stays as decided. |
| Calculator | Commission per unit at most 100,000, cash and expense fields at most 10,000,000,000, settlement date cannot be in the future. A settlement whose cash differs from the expected cash now asks "Cash is short / over by X. Save anyway?". The confirm box is titled Settlement, not Sale. |
| Formula editor | Additional cost 0 to 100,000,000, cost factor above 0 and at most 100 (a factor of 0 could divide by zero), ingredient quantity 0.001 to 1,000,000, duplicate names (ignoring case and spaces) refused. |
| Store manager | A sale price must be a plain number of at least 0.01 and at most 100,000,000. Negative values used to be saved silently as 0. |
| Stock transfer, expense, entity | Quantity range, and name, description and wallet length limits. |

## Left as is by decision

4. Calculator expected cash price and quantity basis.
5. Rep tab stock limit.
6. Payments creating an entity from an unknown name.

## Verified working

Deleting production, factory units, purchases, credit sales and collections is blocked or reversed correctly. Stock checks hold for direct sales, rep returns, factory units, production and stock transfers. Cash moved by exactly the entered amount for sales, collections, payments, expenses and the calculator.

## Second pass: areas not covered before

Method as before. Cloud features (backups, approvals, manager sessions) need a signed-in account, so those were reviewed from the code. Phone layout and touch were checked from the HTML and CSS, not on a device.

### Batch Mix and Batch Fix
- Numbers reproduce exactly (a saved correction with 10 kg of one ingredient gives 15.881 kg, with 9.9 kg gives 15.722 kg). 3,000 random formulas: present amounts always add to the remaining batch, and remaining + additions always equals the required total.
- Saving a correction and editing it restores the saved values exactly. Unit toggling g to kg and back does not drift. The 40-saved-calculation limit holds.
- Display only: each row rounds present, add and target to 3 decimals on its own, so a row can look 0.001 kg off (8.871 + 1.414 shows 10.286, not 10.285). "Weight per unit" shows 3.002 kg while the true value is 3.0015.
- A batch weight of 1e12 kg is accepted with no upper limit.

### Editing existing records
- Sale, collection, production, factory batch, payment, expense, transfer, rep sale, rep return, Calculator and stock transfer edits all keep cash, stock and linked records consistent.
- Protected correctly: editing a credit sale that was paid through a collection, a factory batch already used by production, a production entry below what was sold, and a payment that settled a supplier payable.
- Known and left by decision: a rep sale can be edited above the rep's supply (200 kg against 30 kg).
- Renaming a payment or an operating expense to an unknown name creates a new entity (item 6, left by decision).

### Deleting entities and the recycle bin
- Deleting an entity removes its transactions, unlinks its materials and restores payables. Recovering it brings everything back with new ids and the links repointed, and cash returns to the same figure.
- Recovering a deleted sale whose stock has since been resold is refused, so stock cannot go negative.

### Backup and restore (code review)
- The encrypted backup covers every collection. The sales rep list (`reps`) is not in it, so a restore without the cloud team document falls back to the hard-coded default names "NORAN SHAH" and "NOMAN SHAH".
- A fresh install is seeded with those same two default rep names.

### Formula and store editors
- Formula editor silently drops any ingredient row with no material picked or a quantity of 0, then reports "saved with N ingredients". Duplicate formula names and duplicate materials in one formula are not blocked. A cost factor of 0 silently becomes 1.
- Deleting a formula checks stores and links only, not past production and factory entries.
- **Store delete has no guard.** A store with production and sales was deleted with no warning, leaving its remaining stock unreachable.
- A negative or non-numeric sale price on a store silently becomes 0. A price of 1e12 is accepted.

### Approvals and manager mode (code review)
- Gating, money hiding and recycle scope are covered by existing tests and the code is consistent. Cash-shortage messages are redacted for restricted roles.
- Leak: the Rep tab loss message ("This sale would result in a loss of X") shows the margin to money-restricted users.

### Phone layout and touch
- The viewport tag has `user-scalable=no, maximum-scale=1.0`, which blocks pinch zoom.
- Form controls use 0.85rem (13.6 px) text, which makes iPhone Safari zoom in when a field is focused.
- `.btn-sm` (Edit, Delete, Copy Voucher) is 30 px high, under the usual 44 px touch target, and sits beside other buttons.
- 26 of 32 number fields have no `inputmode`. 24 fields (mostly search boxes) have no label or aria-label.
