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

## Left as is by decision

4. Calculator expected cash price and quantity basis.
5. Rep tab stock limit.
6. Payments creating an entity from an unknown name.

## Verified working

Deleting production, factory units, purchases, credit sales and collections is blocked or reversed correctly. Stock checks hold for direct sales, rep returns, factory units, production and stock transfers. Cash moved by exactly the entered amount for sales, collections, payments, expenses and the calculator.
