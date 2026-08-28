var fs = require('fs');
var assert = require('assert');
function read(path) { return fs.readFileSync(path, 'utf8'); }

var page = 'src/frontend/pages/accounting_reconciliation/Accounting_Reconciliation.html';
var view = 'src/frontend/pages/accounting_reconciliation/Accounting_Reconciliation_View.html';
var controller = 'src/frontend/pages/accounting_reconciliation/accounting_reconciliation_controller_js.html';
var feature = 'src/frontend/features/accounting_reconciliation_manage/accounting_reconciliation_manage_js.html';
var reconciliationClient = 'src/frontend/entities/reconciliation/api/reconciliation_client_js.html';
var ledgerClient = 'src/frontend/entities/ledger/api/ledger_client_js.html';
[page, view, controller, feature, reconciliationClient, ledgerClient].forEach(function (path) {
  assert.ok(fs.existsSync(path), 'missing Accounting Reconciliation FSD file: ' + path);
});

var pageSource = read(page);
var controllerSource = read(controller);
var featureSource = read(feature);
var reconciliationClientSource = read(reconciliationClient);
var ledgerClientSource = read(ledgerClient);
var router = read('src/backend/app/routing/Code.js');

assert.ok(pageSource.includes("include('frontend/shared/styles/App_Styles')"), 'Reconciliation page must use migrated App_Styles');
assert.ok(pageSource.includes("include('frontend/app/styles/App_Shell_Styles')"), 'Reconciliation page must use migrated shell styles');
assert.ok(pageSource.includes("include('frontend/shared/api/app_api_runner_js')"), 'Reconciliation page must use migrated API runner');
assert.ok(pageSource.includes("include('frontend/entities/reconciliation/api/reconciliation_client_js')"), 'Reconciliation page must include reconciliation entity client');
assert.ok(pageSource.includes("include('frontend/entities/ledger/api/ledger_client_js')"), 'Reconciliation page must include ledger entity client');
assert.ok(pageSource.includes("include('frontend/features/accounting_reconciliation_manage/accounting_reconciliation_manage_js')"), 'Reconciliation page must include feature');
assert.ok(pageSource.includes("include('frontend/pages/accounting_reconciliation/accounting_reconciliation_controller_js')"), 'Reconciliation page must include page controller');
assert.ok(controllerSource.includes('initAccountingReconciliationManage'), 'Reconciliation page controller must compose feature');
assert.ok(!/runAppApi|google\.script\.run/.test(featureSource), 'Reconciliation feature must not own transport');
assert.ok(!featureSource.includes('accountingClient.'), 'Reconciliation feature must not depend on legacy accounting client');
['processBankTransactionUpload', 'processReconciliation', 'getReconciliationCandidates', 'applyReconciliationLink', 'createLedgerEntryFromReconciliation'].forEach(function (method) {
  assert.ok(featureSource.includes('reconciliationClient.' + method), 'Reconciliation feature missing semantic client call: ' + method);
});
['getLedgerEntry', 'getLedgerEvidenceFileContent'].forEach(function (method) {
  assert.ok(featureSource.includes('ledgerClient.' + method), 'Reconciliation feature missing ledger client call: ' + method);
});
['api_processBankTransactionUpload', 'api_processReconciliation', 'api_getReconciliationCandidates', 'api_applyReconciliationLink', 'api_createLedgerEntryFromReconciliation'].forEach(function (api) {
  assert.ok(reconciliationClientSource.includes(api), 'Reconciliation entity client missing API mapping: ' + api);
});
['api_getLedgerEntry', 'api_getLedgerEvidenceFileContent'].forEach(function (api) {
  assert.ok(ledgerClientSource.includes(api), 'Ledger entity client missing API mapping: ' + api);
});
assert.ok(router.includes("accounting_reconciliation: 'frontend/pages/accounting_reconciliation/Accounting_Reconciliation'"), 'Reconciliation route must point to FSD page');
assert.ok(!fs.existsSync('src/400_accounting/420_reconciliation'), 'legacy Accounting Reconciliation directory must be removed');
console.log('Accounting Reconciliation FSD migration contract: PASS');
