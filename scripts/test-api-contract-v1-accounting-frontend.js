var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
function read_(relativePath) { return fs.readFileSync(path.join(ROOT, relativePath), 'utf8'); }
var clientPath = path.join(ROOT, 'src/400_accounting/common/accounting_client_js.html');
assert.ok(fs.existsSync(clientPath), 'accounting client must exist');
var client = fs.readFileSync(clientPath, 'utf8');
assert.ok(client.indexOf('runAppApi') !== -1, 'accounting client must use shared runner');
assert.ok(client.indexOf('google.script.run') === -1, 'accounting client must not own GAS transport');
assert.doesNotMatch(client, /runAppApi\(\s*['"][^'"]+['"]\s*\)/, 'Accounting client must always send an object request');
assert.doesNotMatch(client, /runAppApi\(\s*['"]api_getReconciliation['"]\s*,\s*id\b/, 'reconciliation detail must not send a scalar id');
assert.doesNotMatch(client, /runAppApi\(\s*['"]api_getSettlementReport['"]\s*,\s*id\b/, 'settlement detail must not send a scalar id');
assert.match(client, /getReconciliation:\s*function\s*\(request\)[\s\S]*?runAppApi\(['"]api_getReconciliation['"],\s*request\s*\|\|\s*\{\}\)/, 'reconciliation detail client must accept an object request');
assert.match(client, /getSettlementReport:\s*function\s*\(request\)[\s\S]*?runAppApi\(['"]api_getSettlementReport['"],\s*request\s*\|\|\s*\{\}\)/, 'settlement detail client must accept an object request');
var ledgerApi = read_('src/000_server/060_accounting/061_ledger/ledger_api.gs');
var reconciliationApi = read_('src/000_server/060_accounting/063_reconciliation/reconciliation_api.gs');
var settlementApi = read_('src/000_server/060_accounting/064_settlement/settlement_api.gs');
assert.match(ledgerApi, /function\s+api_getLedgerEntry\s*\(request\)/, 'ledger detail API must accept request object');
assert.match(ledgerApi, /getLedgerDetailData_\(input\.id\)/, 'ledger detail API must unwrap id at the public boundary');
assert.match(reconciliationApi, /function\s+api_getReconciliation\s*\(request\)/, 'reconciliation API must accept request object');
assert.match(reconciliationApi, /getReconciliationDetailData_\(input\.id\)/, 'reconciliation API must unwrap id at the public boundary');
assert.match(settlementApi, /function\s+api_getSettlementReport\s*\(request\)/, 'settlement API must accept request object');
assert.match(settlementApi, /getSettlementReportData_\(input\.id\)/, 'settlement API must unwrap id at the public boundary');
var common = read_('src/400_accounting/common/accounting_common_js.html');
assert.ok(common.indexOf('function callServer') === -1, 'legacy Accounting wrapper must be removed');
[
  'src/400_accounting/410_ledger/accounting_ledger_js.html',
  'src/400_accounting/420_reconciliation/accounting_reconciliation_js.html',
  'src/400_accounting/430_settlement/accounting_settlement_js.html'
].forEach(function (relativePath) {
  var source = read_(relativePath);
  assert.ok(source.indexOf('callServer(') === -1, relativePath + ' must use accounting client');
  assert.ok(source.indexOf('google.script.run') === -1, relativePath + ' must not call GAS directly');
});
console.log('API Contract v1 Accounting frontend: PASS');
