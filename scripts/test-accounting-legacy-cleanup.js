const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const legacyRoot = path.join(root, 'src/400_accounting');
const widgetRoot = path.join(root, 'src/frontend/widgets/accounting_shell');

assert.ok(!fs.existsSync(legacyRoot), 'legacy src/400_accounting must be removed after Accounting FSD migration');
assert.ok(fs.existsSync(path.join(widgetRoot, 'Accounting_Styles.html')), 'Accounting shell styles must live in frontend/widgets/accounting_shell');
assert.ok(fs.existsSync(path.join(widgetRoot, 'accounting_common_js.html')), 'Accounting shell helpers must live in frontend/widgets/accounting_shell');
assert.ok(!fs.existsSync(path.join(root, 'src/400_accounting/common/accounting_client_js.html')), 'legacy aggregate accountingClient must be removed');

console.log('Accounting legacy cleanup contract: PASS');
