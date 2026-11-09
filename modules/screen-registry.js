import { registerScreens, registerLazyModules } from './screen-loader.js';

registerScreens({
  'daily-ledger-screen': {
    load: () => import('../screens/compiled/daily-ledger.screen.js'),
    globals: ['dailyLedgerCancelEdit', 'dailyLedgerCopyVoucher', 'dailyLedgerDelete', 'dailyLedgerEdit', 'dailyLedgerExportPdf', 'dailyLedgerOnPick', 'dailyLedgerOpenMode', 'dailyLedgerSave', 'dailyLedgerSearchItems', 'dailyLedgerSetParty', 'dailyLedgerSetQuery', 'dailyLedgerSetType', 'forgetLedgerParty', 'prepareDailyLedgerScreen', 'refreshDailyLedger', 'restoreLedgerEntry'],
  },
  'batch-mix-screen': {
    load: () => import('../screens/compiled/batch-mix.screen.js'),
    globals: ['cancelBatchMixEdit', 'deleteBatchMixSaved', 'editBatchMixSaved', 'openBatchMix', 'openBatchMixFormulaPicker', 'openBatchMixIngredientPicker', 'recomputeBatchMix', 'saveBatchMix', 'setBatchMixMode', 'setBatchMixUnit'],
  },
  'batch-fix-screen': {
    load: () => import('../screens/compiled/batch-fix.screen.js'),
    globals: ['cancelBatchFixEdit', 'deleteBatchFixSaved', 'editBatchFixSaved', 'openBatchFix', 'openBatchFixFormulaPicker', 'recomputeBatchFix', 'resetBatchFixManual', 'saveBatchFix', 'setBatchFixAdd', 'setBatchFixTotal', 'setBatchFixUnit'],
  },
  'app-accounts-screen': {
    load: () => import('../screens/compiled/app-accounts.screen.js'),
    globals: ['_accountsIndexRef', '_readAccountsIndex', '_writeAccountsIndex', 'adminAddAccount', 'adminRemoveAccount', 'adminSetAccountRole', 'adminToggleApproval', 'loadAccountsList', 'resetAccountForm', 'toggleNewAccountRole'],
  },
  'backup-restore-screen': {
    load: () => import('../screens/compiled/backup-restore.screen.js'),
    globals: ['triggerLocalBackup'],
  },
  'db-structure-screen': {
    load: () => import('../screens/compiled/db-structure.screen.js'),
    globals: ['loadDbStructureScreen'],
  },
  'recycle-bin-screen': {
    load: () => import('../screens/compiled/recycle-bin.screen.js'),
    globals: ['_findPairedTransferTombstone', 'attemptHardDeleteRecord', 'attemptRecoverRecord', 'emptyRecycleBin', 'hardDeleteRecord', 'openRecycleBin', 'recoverRecord', 'renderRecycleBin'],
  },
  'stock-transfer-screen': {
    load: () => import('../screens/compiled/stock-transfer.screen.js'),
    globals: ['applyStockTransferFilter', 'deleteStockTransfer', 'prepareStockTransferScreen', 'renderStockTransferHistory', 'saveStockTransfer', 'startEditStockTransfer', 'updateStockTransferAvailability'],
  },
  'payment-transfer-screen': {
    load: () => import('../screens/compiled/payment-transfer.screen.js'),
    globals: ['_applyPaymentTransferPendingPhoto', 'applyPaymentTransferFilter', 'handlePaymentTransferPhotoFile', 'openPaymentTransferPhotoCapture', 'prepareEntityTransferScreen', 'renderPaymentTransferHistory', 'saveEntityTransfer', 'startEditPaymentTransfer'],
  },
  'store-manager-screen': {
    load: () => import('../screens/compiled/store-manager.screen.js'),
    globals: ['deleteStore', 'editStore', 'openStoreManagerScreen', 'renderStoreList', 'resetStoreForm', 'saveStoreFromForm'],
  },
});

registerLazyModules({
  'rep-sales': {
    load: () => import('./rep-sales.js'),
    globals: ['_selectRepCustomerBase', 'adminSwitchRepProfile', 'autoUpdateCustomerLocation', 'calculateRepCustomerStats', 'calculateRepCustomerStatsForDisplay', 'closeRepCustomerEditModal', 'closeRepCustomerManagement', 'deg2rad', 'deleteCurrentRepCustomer', 'exportRepCustomerToPDF', 'fetchRepDeviceLocation', 'getDistanceFromLatLonInMeters', 'initRepMap', 'openRepCustomerEditModal', 'openRepCustomerManagement', 'saveRepCustomerDetails', 'saveRepTransaction', 'selectRepCustomer', 'setRepAnalyticsMode', 'setRepMode', 'updateRepCollectionPreview'],
    hooks: ['calculateRepAnalytics', 'refreshRepUI', 'renderRepCustomerTable', 'renderRepCustomerTransactions', 'renderRepHistory', 'updateRepLiveMap', 'calculateRepSalePreview'],
  },
  'factory': {
    load: () => import('./factory.js'),
    globals: ['calcNet', 'calculateFactoryInventoryValue', 'clearFactoryInventoryForm', 'createSupplierFromMaterial', 'deleteFactoryEntry', 'deleteFactoryPurchase', 'deleteProdEntry', 'editFactoryInventoryItem', 'editFactoryPurchase', 'getStorePricing', 'hideFactoryMaterialResults', 'linkMaterialToSupplier', 'loadExistingSuppliers', 'openFactoryInventoryModal', 'pickFactoryMaterial', 'pickNewFactoryMaterial', 'refreshFactoryFormulaFilter', 'saveFactoryInventoryItem', 'saveFactoryProductionEntry', 'searchFactoryMaterials', 'selectFactoryFormula', 'setFactoryAvailableStore', 'setFactorySummaryMode', 'setFactorySupplierType', 'showSupplierUnlinkOption', 'sortFactoryInventory', 'toggleSupplierFields', 'unlinkFactoryOpeningSupplier', 'unlinkSupplierConfirmation', 'unlinkSupplierFromMaterialById', 'updateFactoryKgCalculation'],
    hooks: ['renderFactoryInventory', 'renderFactoryHistory', 'updateFactoryInventoryDisplay', 'closeFactoryInventoryModal'],
  },
  'formula-store-edit-screen': {
    load: () => import('../screens/compiled/formula-store-edit.screen.js'),
    globals: ['addFormulaIngredientRow', 'deleteFormulaStoreEntry', 'openFormulaStoreEditor', 'saveFormulaStoreEntry', 'updateFormulaStoreSummary'],
  },
  'admin-data': {
    load: () => import('./admin-data.js'),
    globals: ['_buildMergedBase', '_markRowSyncWarning', '_runUnifiedCleanup', '_showCloseFinancialYearDialog', '_showDeltaSyncDetails', '_storeCodeToLabel', 'closeCloseYearDialog', 'createMergeBackup', 'dbvShowTab', 'deduplicateAllData', 'executeCloseFinancialYear', 'extractTimestampValue', 'generateCloseYearSummary', 'mergeCalculatorData', 'mergeExpensesData', 'mergeFactoryData', 'mergePaymentData', 'mergeProductionData', 'mergeRepSalesData', 'mergeSalesData', 'mergeStockReturnsData', 'restoreFromBackup', 'runUnifiedCleanup', 'showCloseFinancialYearDialog', 'showDeltaSyncDetails', 'updateCloseYearProgress', 'updateDeltaSyncStatsDisplay', 'validateCloseYearInput', 'verifyAndExecuteCloseYear', 'verifyCompleteTimestampConsistency', 'verifyMergeConsistency', 'verifyTimestampConsistency'],
    hooks: [],
  },
  'calc-tab': {
    load: () => import('./calc-tab.js'),
    globals: ['filterCalculatorHistory', 'handleExpiredQtyInput', 'handleReturnQtyInput', 'handleTripleTap', 'markRepSalesEntriesAsUsed', 'saveTransaction', 'setIndChartMetric', 'setIndChartMode', 'startEditCalc', 'updateCompositionChart'],
    hooks: ['calculateSales', 'updateIndChart'],
  },
});
