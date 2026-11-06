import { registerScreens } from './screen-loader.js';

registerScreens({
  'daily-ledger-screen': {
    load: () => import('./daily-ledger.screen.js'),
    globals: ['dailyLedgerCancelEdit', 'dailyLedgerCopyVoucher', 'dailyLedgerDelete', 'dailyLedgerEdit', 'dailyLedgerExportPdf', 'dailyLedgerOnPick', 'dailyLedgerOpenMode', 'dailyLedgerSave', 'dailyLedgerSearchItems', 'dailyLedgerSetParty', 'dailyLedgerSetQuery', 'dailyLedgerSetType', 'forgetLedgerParty', 'prepareDailyLedgerScreen', 'refreshDailyLedger', 'restoreLedgerEntry'],
  },
  'batch-mix-screen': {
    load: () => import('./batch-mix.screen.js'),
    globals: ['cancelBatchMixEdit', 'deleteBatchMixSaved', 'editBatchMixSaved', 'openBatchMix', 'openBatchMixFormulaPicker', 'openBatchMixIngredientPicker', 'recomputeBatchMix', 'saveBatchMix', 'setBatchMixMode', 'setBatchMixUnit'],
  },
  'batch-fix-screen': {
    load: () => import('./batch-fix.screen.js'),
    globals: ['cancelBatchFixEdit', 'deleteBatchFixSaved', 'editBatchFixSaved', 'openBatchFix', 'openBatchFixFormulaPicker', 'recomputeBatchFix', 'resetBatchFixManual', 'saveBatchFix', 'setBatchFixAdd', 'setBatchFixTotal', 'setBatchFixUnit'],
  },
  'app-accounts-screen': {
    load: () => import('./app-accounts.screen.js'),
    globals: ['_accountsIndexRef', '_readAccountsIndex', '_writeAccountsIndex', 'adminAddAccount', 'adminRemoveAccount', 'adminSetAccountRole', 'adminToggleApproval', 'loadAccountsList', 'resetAccountForm', 'toggleNewAccountRole'],
  },
  'backup-restore-screen': {
    load: () => import('./backup-restore.screen.js'),
    globals: ['triggerLocalBackup'],
  },
  'db-structure-screen': {
    load: () => import('./db-structure.screen.js'),
    globals: ['loadDbStructureScreen'],
  },
});
