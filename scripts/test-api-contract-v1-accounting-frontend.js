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
