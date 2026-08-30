var fs = require('fs');
var assert = require('assert');
function read(path) { return fs.readFileSync(path, 'utf8'); }

var page = 'src/frontend/pages/accounting_ledger/Accounting_Ledger.html';
var view = 'src/frontend/pages/accounting_ledger/Accounting_Ledger_View.html';
var registerModal = 'src/frontend/pages/accounting_ledger/modals/Accounting_Ledger_Register_Modal.html';
var detailModal = 'src/frontend/pages/accounting_ledger/modals/Accounting_Ledger_Detail_Modal.html';
var controller = 'src/frontend/pages/accounting_ledger/accounting_ledger_controller_js.html';
var listFeature = 'src/frontend/features/accounting_ledger_manage/accounting_ledger_list_js.html';
var formFeature = 'src/frontend/features/accounting_ledger_manage/accounting_ledger_form_js.html';
var detailFeature = 'src/frontend/features/accounting_ledger_manage/accounting_ledger_detail_js.html';
var manageFeature = 'src/frontend/features/accounting_ledger_manage/accounting_ledger_manage_js.html';
var ledgerClient = 'src/frontend/entities/ledger/api/ledger_client_js.html';

[page, view, registerModal, detailModal, controller, listFeature, formFeature, detailFeature, manageFeature, ledgerClient].forEach(function (path) {
  assert.ok(fs.existsSync(path), 'missing Accounting Ledger FSD file: ' + path);
});

var pageSource = read(page);
var controllerSource = read(controller);
var featureSource = [read(listFeature), read(formFeature), read(detailFeature), read(manageFeature)].join('\n');
var ledgerClientSource = read(ledgerClient);
var router = read('src/backend/app/routing/Code.js');

assert.ok(pageSource.includes("include('frontend/shared/styles/App_Styles')"), 'Ledger page must use migrated App_Styles');
assert.ok(pageSource.includes("include('frontend/app/styles/App_Shell_Styles')"), 'Ledger page must use migrated shell styles');
assert.ok(pageSource.includes("include('frontend/shared/api/rpc/app_api_runner_js')"), 'Ledger page must use migrated API runner');
assert.ok(pageSource.includes("include('frontend/entities/ledger/api/ledger_client_js')"), 'Ledger page must include ledger entity client');
assert.ok(pageSource.includes("include('frontend/features/accounting_ledger_manage/accounting_ledger_manage_js')"), 'Ledger page must include manage feature');
assert.ok(pageSource.includes("include('frontend/pages/accounting_ledger/accounting_ledger_controller_js')"), 'Ledger page must include page controller');
assert.ok(controllerSource.includes('initAccountingLedgerManage'), 'Ledger page controller must compose feature');
assert.ok(!/runAppApi|google\.script\.run/.test(featureSource), 'Ledger features must not own transport');
assert.ok(!featureSource.includes('accountingClient.'), 'Ledger features must not depend on legacy accounting client');

['getLedgerEntries','getLedgerSummary','getLedgerEventOptions','getLedgerEntry','getLedgerEvidenceFileContent','createLedgerEntry','createLedgerDraft','updateLedgerEntry','processLedgerEntry','removeLedgerEntry','getLedgerDatabaseInfo'].forEach(function (method) {
  assert.ok(featureSource.includes('ledgerClient.' + method), 'Ledger features missing semantic client call: ' + method);
});
['api_getLedgerEntries','api_getLedgerSummary','api_getLedgerEventOptions','api_getLedgerEntry','api_getLedgerEvidenceFileContent','api_createLedgerEntry','api_createLedgerDraft','api_updateLedgerEntry','api_processLedgerEntry','api_deleteLedgerEntry','api_getLedgerDatabaseInfo'].forEach(function (api) {
  assert.ok(ledgerClientSource.includes(api), 'Ledger entity client missing API mapping: ' + api);
});

assert.ok(router.includes("accounting_ledger: 'frontend/pages/accounting_ledger/Accounting_Ledger'"), 'Ledger route must point to FSD page');
assert.ok(!fs.existsSync('src/400_accounting/410_ledger'), 'legacy Accounting Ledger directory must be removed');
console.log('Accounting Ledger FSD migration contract: PASS');
