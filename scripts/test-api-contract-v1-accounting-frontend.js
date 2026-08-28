var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
function read_(relativePath) { return fs.readFileSync(path.join(ROOT, relativePath), 'utf8'); }

var ledgerClient = read_('src/frontend/entities/ledger/api/ledger_client_js.html');
assert.ok(ledgerClient.indexOf('runAppApi') !== -1, 'ledger entity client must use shared runner');
assert.ok(ledgerClient.indexOf('google.script.run') === -1, 'ledger entity client must not own GAS transport');
assert.doesNotMatch(ledgerClient, /runAppApi\(\s*['"]api_getLedgerEntry['"]\s*,\s*id\b/, 'ledger detail must not send a scalar id');
assert.match(ledgerClient, /getLedgerEntry:\s*function\s*\(request\)[\s\S]*?runAppApi\(['"]api_getLedgerEntry['"],\s*request\s*\|\|\s*\{\}\)/, 'ledger detail client must accept an object request');

var reconciliationClient = read_('src/frontend/entities/reconciliation/api/reconciliation_client_js.html');
assert.ok(reconciliationClient.indexOf('runAppApi') !== -1, 'reconciliation entity client must use shared runner');
assert.ok(reconciliationClient.indexOf('google.script.run') === -1, 'reconciliation entity client must not own GAS transport');
assert.doesNotMatch(reconciliationClient, /runAppApi\(\s*['"]api_getReconciliation['"]\s*,\s*id\b/, 'reconciliation detail must not send a scalar id');
assert.match(reconciliationClient, /getReconciliation:\s*function\s*\(request\)[\s\S]*?runAppApi\(['"]api_getReconciliation['"],\s*request\s*\|\|\s*\{\}\)/, 'reconciliation detail client must accept an object request');

var settlementClient = read_('src/frontend/entities/settlement/api/settlement_client_js.html');
assert.ok(settlementClient.indexOf('runAppApi') !== -1, 'settlement entity client must use shared runner');
assert.ok(settlementClient.indexOf('google.script.run') === -1, 'settlement entity client must not own GAS transport');
assert.doesNotMatch(settlementClient, /runAppApi\(\s*['"]api_getSettlementReport['"]\s*,\s*id\b/, 'settlement detail must not send a scalar id');
assert.match(settlementClient, /getSettlementReport:\s*function\s*\(request\)[\s\S]*?runAppApi\(['"]api_getSettlementReport['"],\s*request\s*\|\|\s*\{\}\)/, 'settlement detail client must accept an object request');

var ledgerApi = read_('src/backend/domains/accounting/controllers/ledger_controller.gs');
var reconciliationApi = read_('src/backend/domains/accounting/controllers/reconciliation_controller.gs');
var settlementApi = read_('src/backend/domains/accounting/controllers/settlement_controller.gs');
assert.match(ledgerApi, /function\s+api_getLedgerEntry\s*\(request\)/, 'ledger detail API must accept request object');
assert.match(ledgerApi, /getLedgerDetailData_\(input\.id\)/, 'ledger detail API must unwrap id at the public boundary');
assert.match(reconciliationApi, /function\s+api_getReconciliation\s*\(request\)/, 'reconciliation API must accept request object');
assert.match(reconciliationApi, /getReconciliationDetailData_\(input\.id\)/, 'reconciliation API must unwrap id at the public boundary');
assert.match(settlementApi, /function\s+api_getSettlementReport\s*\(request\)/, 'settlement API must accept request object');
assert.match(settlementApi, /getSettlementReportData_\(input\.id\)/, 'settlement API must unwrap id at the public boundary');

var common = read_('src/frontend/widgets/accounting_shell/accounting_common_js.html');
assert.ok(common.indexOf('function callServer') === -1, 'legacy Accounting wrapper must be removed');
[
  'src/frontend/features/accounting_ledger_manage/accounting_ledger_list_js.html',
  'src/frontend/features/accounting_ledger_manage/accounting_ledger_form_js.html',
  'src/frontend/features/accounting_ledger_manage/accounting_ledger_detail_js.html',
  'src/frontend/features/accounting_ledger_manage/accounting_ledger_manage_js.html',
  'src/frontend/features/accounting_reconciliation_manage/accounting_reconciliation_manage_js.html',
  'src/frontend/features/accounting_reconciliation_manage/accounting_reconciliation_actions_js.html',
  'src/frontend/features/accounting_reconciliation_manage/accounting_reconciliation_render_js.html',
  'src/frontend/features/accounting_settlement_manage/accounting_settlement_manage_js.html'
].forEach(function (relativePath) {
  var source = read_(relativePath);
  assert.ok(source.indexOf('callServer(') === -1, relativePath + ' must use semantic client boundaries');
  assert.ok(source.indexOf('google.script.run') === -1, relativePath + ' must not call GAS directly');
});
console.log('API Contract v1 Accounting frontend: PASS');
