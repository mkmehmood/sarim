# Plan: one file per screen (HTML + CSS + JS), loaded when first opened

Status: **Phases 0–1 done; Phase 2 done where it is a pure move; Phase 3a done; Phase 3b/3c under way. 10 screens are lazy** (daily-ledger, batch-mix, batch-fix, app-accounts, backup-restore, db-structure, recycle-bin, stock-transfer, payment-transfer, store-manager). Progress log at the end.
Everything below is measured from the repo at `3168d72`, not estimated.

## 1. What exists today

| Area | Size | Notes |
|---|---|---|
| `index.html` | 217 KB | 6 tabs + 24 standalone screens = **~150 KB (69%)**; the rest is shell, splash, nav, dialogs |
| `app.css` | 249 KB, 2,417 rules | single global file |
| `modules/*.js` | 72 files, ~44.7k lines | all statically imported by `main.js`, except `factory.js` and `rep-sales.js` (already lazy) |
| Inline handlers | 216 `onclick=` in HTML, 191 distinct calls | all resolve through `window.*` |
| `window.*` assignments | 907 | this is the real public surface between screens |
| Tests | 68 files read `index.html`, `app.css` or `modules/*.js` as text | will break on any move unless fixed first |

### Screens (33 roots found)
Tabs: `tab-prod` 7 KB, `tab-sales` 11 KB, `tab-calc` 14 KB, `tab-factory` 7 KB, `tab-payments` 14 KB, `tab-rep` 9 KB.
Standalone (24): settings, store-manager, backup-restore, recycle-bin, stock-transfer, payment-transfer, daily-ledger, raw-material, formula-store, formula-store-edit, batch-mix, batch-fix, app-accounts, approvals, feedback, close-financial-year, db-structure, entity-details, add-entity, expense-details, customer-management, customer-edit, rep-customer-management, rep-customer-edit.

### The two facts that shape the whole plan

1. **CSS is mostly shared.** Of 236 KB of rule bytes only **24 KB (~10%)** belong exclusively to one screen (a rule counts as exclusive only if every selector uses an id/class that appears in that one screen and nowhere else in HTML or JS). The other ~90% is design system, themes, components and overrides. Most screens will end up with *small* CSS in their file; the shared base stays in a `core.css`.
   Largest exclusive CSS: payments 6.4 KB, calc 2.5 KB, prod 2.4 KB, factory 1.8 KB, raw-material 1.4 KB, formula-store 1.3 KB, daily-ledger 1.1 KB.
2. **JS is concentrated in five multi-screen monoliths**: `utilities-payments.js` (7.3k lines), `utilities-sales.js` (6.9k), `utilities-core.js` (4.5k), `sync.js` (4.5k), `admin-data.js` (2.8k) = **26k of 44.7k lines**. They reference several tabs at once (e.g. `utilities-sales.js` touches `tab-calc`, the sales tab, rep inputs, expense search…). Splitting these is the only hard part; everything else is mechanical.

Cleanly single-screen modules (safe first movers): `daily-ledger.js` (501 lines, 1 importer), `batch-fix.js`, `batch-mix.js`, `accounts.js`, `approvals.js`, `formula-store.js`, `cm-ledger.js` (shared by 3 customer screens). Core modules that look screen-specific but are not: `feedback.js` is the global tap/haptic engine used by `native.js` and `dialog.js`.

## 2. Target design

One file per screen: `screens/<name>.screen.html`

```html
<template>   …the screen's markup, verbatim…   </template>
<style>      …rules used only by this screen…    </style>
<script type="module"> …this screen's logic…   </script>
```

- **Build**: an esbuild step compiles each file to one JS chunk exporting `{ html, css, mount }`. Content-hashed like today's chunks. `scripts/serve.js` (dev) parses the same file at runtime so no build is needed while developing.
- **Runtime ("runs once when called")**: `openScreen(id)` memoises one `import()` per screen. First call: inject CSS, insert markup, run the module once, then show. Later calls just show. A screen's listeners are attached once, at mount.
- **Compatibility layer** (generated from the manifest): for every `window.X` a screen owns, a stub `window.X = (...a) => load().then(() => window.X(...a))` is installed at startup. This keeps the 191 inline handlers and the cross-screen `typeof window.fn === 'function'` calls working before the screen has loaded.
- **Core stays core**: shell, nav, dialogs, sync, storage, design-system CSS (`core.css`), shared helpers.

## 3. Phases (each ends with all checks green and its own commit)

**Phase 1 – Loader and safety net** (no screen moved yet)
- `screens/` format, esbuild plugin, dev-server support, `openScreen`, stub generator.
- `sw.js` `ASSETS_TO_CACHE` and `scripts/verify.js` must list/validate screen chunks. **Offline-first matters here:** a screen not in the precache would fail to open offline on first use.
- Add `tests/helpers/source.js` (`readAppSource()` = `index.html` + all screen templates/styles/scripts) and switch the 68 source-reading tests to it, so tests assert on the app, not on one file.
- Capacitor/Android: confirm chunks are inside `dist/` before `cap sync`.

**Phase 2 – Standalone screens that already own their module**
daily-ledger, batch-mix, batch-fix, approvals, accounts, formula-store + edit, store-manager, db-structure, close-financial-year, backup-restore, recycle-bin, stock-transfer, payment-transfer, raw-material. HTML + exclusive CSS + the module go into one file each.

**Phase 3 – Screens whose logic lives in monoliths**
customer-management / customer-edit / entity-details / rep-customer-* / add-entity / expense-details / settings. Move their functions out of the monoliths using the `window.*` manifest as the ownership map. `cm-ledger.js` becomes shared code imported by three screen files.

**Phase 4 – The six tabs**
Highest risk: `showTab` sets state on several tabs, edit flows (e.g. `startEditSale`, `startEditRepReturn`) require the sales tab DOM to exist, and `utilities-payments.js` holds a screen registry (`closeFn`/`contentSel`). Tabs mount lazily except `tab-prod` (default) — and any tab another flow targets must `await openScreen()` first.

## 4. Known hazards to design for
- Code that reads or writes another screen's DOM before it has mounted (sync updates, notification deep-links via `notify-target.js` `prepare:` hooks, `showTab` toggling all six tabs).
- Modules that do `getElementById(...)` / attach listeners at import time.
- `money-privacy.js` `RESTRICTED_SCREENS` and role gating (`isScreenAllowed`) use screen ids – must apply before a screen mounts.
- Load order of CSS: screen CSS is injected after `core.css`; only rules that are *exclusive* move, so cascade order cannot change for shared rules.
- Circular imports when carving the monoliths – resolve by moving shared helpers to a core module first.

## 5. How "nothing lost" is verified

`node scripts/split-manifest.mjs check` compares the tree to `docs/screen-split/baseline.json` (taken before any change) and fails if any of these disappear or change:
- every HTML element id (700) and inline handler call (191)
- the whitespace-normalised markup of every screen root (53 blocks)
- every CSS rule/at-rule, counted as a multiset (2,417) – moving a rule between files passes, dropping or editing one fails
- every top-level JS declaration (2,102), export (1,480) and `window.*` assignment (976, including `Object.assign(window, {...})`)

Self-tested: a pure move into `screens/` passes; a dropped CSS rule, a renamed id, a removed export and a removed `window.*` assignment each fail.

Per-phase gate: `npm run lint && npm test && npm run build && npm run verify -- dist && npm run split:check`.

## 6. What this cannot prove (needs a person or a browser)
The checker proves no code was lost; it cannot prove a lazily loaded screen *behaves* the same. Each phase needs a manual pass on a device or emulator: open each moved screen online and offline, first open vs. second open, and the flows that cross screens (edit from ledger, notification deep-link, role-restricted login). A headless-browser smoke test would be worth adding in Phase 1.

## 7. Progress log

### Phase 1 – done
- `screens/<name>.screen.html`: `<template>` + `<style>` + `<script type="module">`. The script keeps imports relative to `modules/`.
- `scripts/screen-compile.mjs` compiles a screen to one JS module. The same code is used by the esbuild plugin (`build.js` now uses the esbuild API), the dev server (`scripts/serve.js` serves `modules/<name>.screen.js` from the screen file) and `scripts/screens-lint.mjs`.
- `modules/screen-loader.js`: loads a screen once, injects its style once, swaps the `data-lazy-screen` placeholder for the real markup, then calls the screen's `onMount()` if it has one. It also wraps `window.openStandaloneScreen` so a lazy screen is mounted before it is shown, and installs `window.*` stubs that load the screen and then call the real function.
- `modules/screen-registry.js`: one entry per screen (literal `import()` so each gets its own chunk, plus its `globals`). `tests/screen-registry.test.js` fails if the registry, the screen file, the placeholder in `index.html`, the service-worker list or the published `window.*` names drift apart.
- Offline: the build lists every screen chunk in the service worker's precache automatically, and `npm run verify -- dist` checks each one exists.
- Tests: `tests/helpers/source.js` reads the app as one document again (placeholders re-expanded, screen styles appended to `app.css`, folded modules found by marker). `tests/_extract.js` now goes through it, and 13 scanning tests use `moduleFiles()` so a moved module is still scanned by every rule it was before.

### Rules that changed on purpose
- "All CSS lives in app.css" (`tests/no-inline-css.test.js`) now allows exactly two exceptions: one `<style>` per `screens/*.screen.html`, and the single `createElement('style')` in `modules/screen-loader.js`. The CSP already allows this (`style-src 'self' 'unsafe-inline'`).
- The "no comments" and "no repeated blank lines" rules still apply, and now cover code that lives in screen files.

### CSS is moved conservatively
A rule moves into a screen file only if (a) every selector uses an id or class that exists only in that screen, (b) it has no `!important`, and (c) no rule that stays in `app.css`, appears later and has the **same specificity** sets any of the same property families, because injecting the screen style after `app.css` would flip that winner. Anything else stays in `app.css`. Result so far: daily-ledger moved 4 rules and kept 11 for cascade safety; batch-mix and batch-fix moved none. Expect screen files to carry little CSS until the shared rules are untangled in a later pass.

### Phase 2 – moved so far
daily-ledger, batch-mix, batch-fix. Main entry chunk went from 52.3 KB to 36.5 KB; the three screens load on first open (31.5 KB, 8.4 KB, 10.5 KB).

Not yet moved, and why (see Phase 3 below for the rest): `approvals` and `accounts` are also imported by `sync.js` (it must reach them through the registry first); `formula-store`, `batch-saved`, `batch-common` are imported by several modules (shared code, stays in core); `cm-ledger` is shared by three screens. The remaining standalone screens (settings, store-manager, backup-restore, recycle-bin, stock-transfer, payment-transfer, raw-material, db-structure, close-financial-year, feedback) keep their logic inside the large modules and belong to Phase 3.

### Splitting a module before moving it
`node scripts/module-split.mjs <module.js> <new-core.js> <name> ...` moves named top-level declarations (and the `window.X = name` lines that publish them) into a new core module, recomputes both files' imports, and re-points other modules that imported those names. It refuses if the moved code depends on something that stays behind, so it cannot create an import cycle.

Used for `accounts.js`: the five session functions that `sync.js` calls at sign-in (`syncAccountSession`, `applyAccountSession`, `applyCachedAccountSession`, `accountInfoFromDoc`, `SESSION_FETCH_TIMEOUT_MS`) became `modules/account-session.js` and stay in core; the 366-line admin UI became the lazy `app-accounts` screen (14.3 KB chunk). Main entry chunk is now 36.8 KB.

### `approvals` is not a pure move (needs a design decision)
`sync.js` needs two groups from it. The **submit side** (`gates`, `isGatedSession`, `submitPending`, `submitPendingBatch`, `pendingWrite`, `revertLocal`, `watchOwnPending`) is self-contained and could go to core with `module-split`. The **admin watcher** is the problem: `watchPendingApprovals` runs for every admin at sign-in and, on each snapshot, updates the badge, calls `renderApprovals()` (UI), resolves a notification deep link via `openApprovalSheet()` (UI) and may open the screen. The UI and watcher also share mutable state (`_pending`, `_loaded`, `_filter`, `_wantedId`). Moving the UI therefore needs:
1. a small `approvals-state.js` holding that shared state, imported by both halves;
2. the watcher calling the UI only when it is mounted (`isScreenMounted('approvals-screen')`), and `openApprovalFromPush` / `_showApprovalsScreen` going through `loadScreen`;
3. a decision on whether a push deep link may wait for the screen chunk to download (offline it would fail after the first precache).
Those change behaviour, so this should be reviewed rather than done mechanically. Estimated size: about 60 lines of glue, 3 tests.

### Phase 3 – what the analysis found
`node scripts/screen-carve.mjs <screen-id> <name> [--dry]` works out which top-level statements (across every module) belong only to one screen: a statement is owned when it touches the screen's element ids or is called only from the screen's inline handlers, **and every place that uses it is itself owned** (greatest fixed point, so shared helpers stay and are imported back). Without `--dry` it moves them into `modules/<name>.js`, publishes their globals from there, trims only the imports the move made unused (syntax-tree based, so strings never count), and records the origin in `docs/screen-split/carved.json` so tests can still find the code under its old file name. It refuses if a variable is assigned from both sides of the boundary.

Its most useful output is the **LAZY-SAFE** verdict. A screen is safe to mount lazily only if no code left behind reads or writes its elements, because that code would run against an empty placeholder. Result for the 20 remaining standalone screens: **1 safe (backup-restore, now moved)**, 19 not.

Why the 19 are blocked (the same two causes keep recurring):
1. **Core functions that stay behind write into the screen.** The opener and the render function are shared: `openRecycleBin`/`renderRecycleBin`, `prepareStockTransferScreen`/`applyStockTransferFilter`, `applyPaymentTransferFilter`/`selectFromUniversalSearch`, `renderFormulaStoreList`, `renderApprovals`, `openCustomerManagement`/`renderCustomerTransactions` (and the rep equivalent), `openOperatingExpenseOverlay`, `openEntityDetailsOverlay`, `syncFeedbackSettings`, `updateCloseYearProgress`, and so on. These are called from other modules and from refresh hooks, often right after `openStandaloneScreen(...)`.
2. **Code that lives in `index.html` inline `<script>` blocks (711 lines of classic script).** `store-manager` (8 ids), `raw-material` (6), `add-entity` (5) and `db-structure` (1) are driven from there, and the first version of this analysis missed it. That produced two false "safe" verdicts, which is why the check now reads inline scripts too.

Size of what is *owned* but not yet movable (so the prize is real): settings 1,729 lines, raw-material 346, expense-details 295, add-entity 272, customer-edit 231 and rep-customer-edit 231, plus smaller ones.

### Phase 3a – done: the inline scripts
`index.html` had nine inline scripts. Eight are tiny early-boot scripts (theme, splash, update dialog) and stay inline so they run before first paint. The ninth (388 lines) held three things: the navigation core, screen code, and a `DOMContentLoaded` block. It is now 155 lines: navigation core (`openSidebar`, `openStandaloneScreen`, `popstate`, `sidebarNav`) plus the `DOMContentLoaded` block, which must exist before modules load. Everything else moved, verbatim, into modules imported **first** in `main.js` so they still run before the rest of the app:
- `store-manager.js` (open/render/reset/edit/delete/save), `add-entity.js` (`prepareAddEntityScreen`), `raw-material.js` (`prepareRawMaterialScreen`), `db-structure.js` (`loadDbStructureScreen`, since folded into the lazy `db-structure` screen).
- Names the old inline code reached through the global scope are now written `window.NAME`, which is the same lookup.

**Load order mattered, and one thing was deleted.** Inline scripts run before the deferred modules, so any `window.X = …` that a module also assigns was already being overwritten. Moving those into a module would have changed which version wins, so they were not moved. Nine inline definitions were provably dead and were removed: `openDataMenu`, `closeDataMenu`, `openRecycleBin`, `closeRecycleBin`, `openEntityManagement`, `closeEntityManagement`, `openFactoryInventoryModal`, `closeFactoryInventoryModal` (each is published by a module, and for the last two by `factory.js`, which is the only place that can open the raw-material screen) and `_origOpenFactoryInventoryModal` (always assigned `undefined`; nothing reads it). `tests/inline-script-split.test.js` pins this: every one of those names must still be published by a module and must not be assigned inline, the moved code must be gone from the inline script, and the navigation core must stay inline.

Other things that changed: the split checker now also looks for inline `on*="…"` handlers inside JS strings (the store list builds `editStore(…)`/`deleteStore(…)` buttons that way); the `cssText` policy test now looks in the new module/screen for the single allowed `!important` rule.

Effect: main entry chunk 44.4 KB (36.9 KB before 3a; the moved code is now countable, and 5.7 KB of it is the lazy `db-structure` chunk). The remaining blockers for `store-manager`, `raw-material` and `add-entity` are the shared-opener problem below, not inline code.

### Phase 3b/3c – recycle-bin (first screen done this way)
`openRecycleBin`, `renderRecycleBin` and the recover / hard-delete / empty-bin code (1,007 lines, 25 statements) moved out of `utilities-payments.js` into the lazy `recycle-bin` screen (36.5 KB chunk). No per-opener rewrite was needed: the opener itself moved, so its `window` stub loads and mounts the screen first and then runs the real function, which renders the first content. The sidebar button, the notification deep link (`type: 'call'`) and the filter popover all reach it through `window`, which the stub covers (`tests/screen-registry.test.js` now checks that every function a notification target names is either published eagerly or stubbed).

What the analysis taught us, now built into `screen-carve`:
- **Function names inside strings are not code uses.** `fn: 'openRecycleBin'` or `onclick="attemptRecoverRecord(...)"` in a template string are looked up through `window`, so they no longer pin a function in core. Uses are now read from the syntax tree, not by scanning text. Use `--also a,b` for functions that are only referenced from button HTML (here `attemptRecoverRecord`, `attemptHardDeleteRecord`, `hardDeleteRecord`).
- **Never move shared integrity code just because the screen is its only caller today.** Without a limit, the closure reached 1,780 lines of `link-graph.js`, `link-guards.js` and `money-privacy.js`, which `sync` and many tests depend on. `--within utilities-payments.js` confines a carve to the screen's own file; the helpers stay in core and are imported back (the tool exports them).
- **Data globals must not get function stubs.** The `RECYCLE_*` tables are published on `window` as data. The registry now stubs only published *functions* (`scripts/screen-globals.mjs`); data globals are still published when the screen loads, which is only acceptable when nothing reads them earlier (verified: no outside consumers).
- Two bugs found and fixed in the tool: duplicate keys in the generated `Object.assign(window, …)` when a name was published twice, and moved statements being joined without blank lines.
- Tests: `readModule(name)` returns a module plus anything carved out of it (imports stripped so it still parses); `readSource` stays exact so the scanning tests do not count moved code twice. Five tests that inspected recycle-bin code were pointed at `modules/recycle-bin.js`.

Next candidates for the same treatment: `store-manager`, `raw-material` and `add-entity` (their code is now in modules after 3a), then `formula-store`, `formula-store-edit`, `expense-details`, `entity-details` and the customer screens. Each still needs a first-open test on a device.

### Phase 3b/3c – stock-transfer and payment-transfer
Both moved with the same method; their lazy chunks are 13.5 KB and 14.4 KB. The analysis showed what actually pins a screen in core, and `screen-carve` now handles each case explicitly:
- **A core function calls a screen function directly** (`--via-window a,b`). The call is rewritten so it is late-bound: `f(x)` becomes `window.f(x)`, `typeof f` becomes `typeof window.f`, and a function passed *as a value* (for example `registerEditHandler('stocktransfer', startEditStockTransfer, …)`) becomes `((...args) => window.startEditStockTransfer(...args))`, never a bare `window.f`, because that would capture `undefined` if the registry had not run yet. The lazy stub then loads the screen when the call happens. Used for: the edit-mode registrations, `deleteProdEntry` calling `deleteStockTransfer`, camera delivery calling `_applyPaymentTransferPendingPhoto`, universal search calling `applyPaymentTransferFilter`, and `deletePaymentTransfer` calling `renderPaymentTransferHistory`.
- **A shared function only looks owned** (`--keep a,b`). `computeStoreStockSnapshot` (read by `factory.js` and `link-guards.js` through `window`), `routeHistoryMatcher` (shared helper in `business.js`), `openCustomerEditModal`, `openRepCustomerEditModal`, `calculateRepCustomerStatsForDisplay` and `selectFromUniversalSearch` stay in core. `deletePaymentTransfer` also stays: three core delete flows call it, so it is data logic, and only its trailing render call moved behind `window`.
- **Button-only references** (`--also deleteStockTransfer`), and `--why name` to print what pins a function.
- **References are now computed with scope analysis** (`eslint-scope`), not by listing identifiers. A local variable named `n` is no longer mistaken for a top-level `n` in another module (the earlier version exported a single-letter `n` from `inventory-note.js` for this reason; that was caught in review and removed). Imports for moved code resolve in the right order: a declaration in the same module, then that module's own import, then a unique global (this fixed a missed `getStoreLabel`, which is also a local helper name in `prod-photos.js`).

Tests that read these functions now read them from `modules/stock-transfer.js` / `modules/payment-transfer.js`, or use `readModule('utilities-sales.js')` / `readModule('utilities-payments.js')` when they need the origin file plus what was carved out of it.

### store-manager, and what the build says about the real payoff
`store-manager` needed no carve: its module was created in 3a and is single-screen (the tool cannot see functions published as `window.X = async function…`, which is why it reported "not lazy-safe"). The only outside reference is a guarded `typeof window.renderStoreList === 'function' && getDisplay(_el('store-manager-screen')) !== 'none'` in `formula-store.js`, which stays correct with the placeholder (hidden and unmounted means skipped).

**Measured result so far** (gzipped JS that loads at start-up, excluding the lazy screens): 397 KB on `main` → 369 KB here, about 7%. Ten screens (about 148 KB raw) now load on demand. The reason the saving is modest is that one shared chunk is 1.07 MB, and nearly all of it is the five monoliths plus code that is *meant* to be lazy but is pinned by static imports:

| module in the always-loaded chunk | size |
|---|---|
| utilities-sales | 167 KB |
| utilities-payments | 157 KB |
| utilities-core | 130 KB |
| sync | 107 KB |
| admin-data | 98 KB |
| business | 50 KB |
| **rep-sales** (loaded with `import()` in `main.js`, but imported statically elsewhere) | 49 KB |
| **factory** (same) | 46 KB |
| customers, link-graph, link-guards, cm-ledger | 39, 30, 20, 18 KB |

So the biggest remaining payoff is not more small screens. It is (1) breaking the static imports that pin `factory.js` and `rep-sales.js` (about 95 KB raw, and the `raw-material` screen code lives inside `factory.js`), then (2) carving the tab code out of the five monoliths (Phase 4).

### What each blocked screen needs (small, per screen, but behaviour-changing)
- **3a. Move the inline `index.html` scripts into modules.** Done, see above.
- **3b. Make openers wait for the screen.** Add `ensureScreen(id)` (an exported wrapper over `loadScreen`) and have each core opener `await` it before touching the screen's elements; sync openers must become async.
- **3c. First render on mount.** Each screen exports `onMount()` that does the initial render that used to happen at startup, so the first open is not empty.
- **3d. Fix the remaining cross-boundary variables** the tool reports as HAZARDS (formula-store-edit, add-entity, expense-details, customer-edit).
Each of 3b/3c needs a manual first-open test on a device, which is why they are not done mechanically here.

### How to move the next screen
`node scripts/screen-extract.mjs <screen-id> <name> [module.js ...]` (add `--dry` to preview), then:
`npm run lint && npm test && npm run build && npm run verify -- dist && npm run split:check`.
A module may only be folded in if nothing else imports it. A screen's script must not touch its own DOM at top level; put start-up DOM work in `export function onMount() {}`.
