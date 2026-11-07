import { registerScreens, registerLazyModules } from './screen-loader.js';

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
  'recycle-bin-screen': {
    load: () => import('./recycle-bin.screen.js'),
    globals: ['_findPairedTransferTombstone', 'attemptHardDeleteRecord', 'attemptRecoverRecord', 'emptyRecycleBin', 'hardDeleteRecord', 'openRecycleBin', 'recoverRecord', 'renderRecycleBin'],
  },
  'stock-transfer-screen': {
    load: () => import('./stock-transfer.screen.js'),
    globals: ['applyStockTransferFilter', 'deleteStockTransfer', 'prepareStockTransferScreen', 'renderStockTransferHistory', 'saveStockTransfer', 'startEditStockTransfer', 'updateStockTransferAvailability'],
  },
  'payment-transfer-screen': {
    load: () => import('./payment-transfer.screen.js'),
    globals: ['_applyPaymentTransferPendingPhoto', 'applyPaymentTransferFilter', 'handlePaymentTransferPhotoFile', 'openPaymentTransferPhotoCapture', 'prepareEntityTransferScreen', 'renderPaymentTransferHistory', 'saveEntityTransfer', 'startEditPaymentTransfer'],
  },
  'store-manager-screen': {
    load: () => import('./store-manager.screen.js'),
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
});
