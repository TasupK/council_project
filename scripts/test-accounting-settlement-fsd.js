var fs = require('fs');
var assert = require('assert');
function read(path) { return fs.readFileSync(path, 'utf8'); }

var page = 'src/frontend/pages/accounting_settlement/Accounting_Settlement.html';
var view = 'src/frontend/pages/accounting_settlement/Accounting_Settlement_View.html';
var controller = 'src/frontend/pages/accounting_settlement/accounting_settlement_controller_js.html';
var feature = 'src/frontend/features/accounting_settlement_manage/accounting_settlement_manage_js.html';
var client = 'src/frontend/entities/settlement/api/settlement_client_js.html';
[page, view, controller, feature, client].forEach(function (path) {
  assert.ok(fs.existsSync(path), 'missing Accounting Settlement FSD file: ' + path);
});

var pageSource = read(page);
var controllerSource = read(controller);
var featureSource = read(feature);
var clientSource = read(client);
var router = read('src/backend/app/routing/Code.js');

assert.ok(pageSource.includes("include('frontend/shared/styles/App_Styles')"), 'Settlement page must use migrated App_Styles');
assert.ok(pageSource.includes("include('frontend/app/styles/App_Shell_Styles')"), 'Settlement page must use migrated shell styles');
assert.ok(pageSource.includes("include('frontend/shared/api/app_api_runner_js')"), 'Settlement page must use migrated API runner');
assert.ok(pageSource.includes("include('frontend/entities/user/api/app_client_js')"), 'Settlement page must use migrated app client');
assert.ok(pageSource.includes("include('frontend/entities/settlement/api/settlement_client_js')"), 'Settlement page must include settlement entity client');
assert.ok(pageSource.includes("include('frontend/features/accounting_settlement_manage/accounting_settlement_manage_js')"), 'Settlement page must include settlement feature');
assert.ok(pageSource.includes("include('frontend/pages/accounting_settlement/accounting_settlement_controller_js')"), 'Settlement page must include page controller');
assert.ok(controllerSource.includes('initAccountingSettlementManage'), 'Settlement page controller must compose settlement feature');
assert.ok(!/runAppApi|google\.script\.run/.test(featureSource), 'Settlement feature must not own transport');
['getSettlementSummary', 'getSettlementReports', 'getSettlementReport', 'createSettlementReport', 'exportSettlementReport'].forEach(function (method) {
  assert.ok(featureSource.includes('settlementClient.' + method), 'Settlement feature missing semantic client call: ' + method);
});
['api_getSettlementSummary', 'api_getSettlementReports', 'api_getSettlementReport', 'api_createSettlementReport', 'api_exportSettlementReport'].forEach(function (api) {
  assert.ok(clientSource.includes(api), 'Settlement entity client missing API mapping: ' + api);
});
assert.ok(!clientSource.includes('google.script.run'), 'Settlement entity client must use shared runner');
assert.ok(router.includes("accounting_settlement: 'frontend/pages/accounting_settlement/Accounting_Settlement'"), 'Settlement route must point to FSD page');
assert.ok(!fs.existsSync('src/400_accounting/430_settlement'), 'legacy Accounting Settlement directory must be removed');
console.log('Accounting Settlement FSD migration contract: PASS');
