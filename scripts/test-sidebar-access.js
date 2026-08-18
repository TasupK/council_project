var fs = require('fs');
var assert = require('assert');
function read(path) { return fs.readFileSync(path, 'utf8'); }
var sidebar = read('src/100_common/App_Sidebar.html');
var shell = read('src/100_common/app_shell_js.html');
assert.ok(sidebar.includes('id="appNavMain"') && sidebar.includes('id="appNavAccounting"'), 'core sidebar hooks missing');
assert.ok(sidebar.includes('id="appNavStudentFeeGroup"'), 'student fee group hook missing');
assert.ok(/id="appNavMain"[^>]*hidden/.test(sidebar), 'main should be hidden by default');
assert.ok(/id="appNavAccounting"[^>]*hidden/.test(sidebar), 'accounting should be hidden by default');
assert.ok(/id="appNavStudentFeeGroup"[^>]*hidden/.test(sidebar), 'student fee should be hidden by default');
assert.ok(/id="appNavEvent"[^>]*hidden/.test(sidebar), 'event should be hidden by default');
assert.ok(/id="appNavSettings"[^>]*hidden/.test(sidebar), 'settings should be hidden by default');
assert.ok(shell.includes('function loadAppNavigationAccess_'), 'navigation access loader missing');
assert.ok(shell.includes('api_getCurrentUser'), 'sidebar must read current auth domain access');
assert.ok(shell.includes('domainAccess'), 'sidebar domainAccess handling missing');
assert.ok(shell.includes("setAppDomainVisible_('settings'"), 'settings visibility must be permission based');
console.log('Sidebar access contract passed.');
