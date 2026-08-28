var fs = require('fs');
var assert = require('assert');
var vm = require('vm');
function read(file) { return fs.readFileSync(file, 'utf8'); }

var pageAccessPath = 'src/backend/app/routing/page_access.gs';
var domainAccessPath = 'src/backend/domains/iam/application/domain_access.gs';
var deniedPath = 'src/frontend/pages/access_denied/Access_Denied.html';
assert.ok(fs.existsSync(pageAccessPath), 'routing page access helper missing');
assert.ok(fs.existsSync(domainAccessPath), 'IAM domain access helper missing');
var pageAccess = read(pageAccessPath);
var domainAccess = read(domainAccessPath);
var code = read('src/backend/app/routing/Code.js');
var api = read('src/backend/domains/iam/controllers/auth_controller.gs');

assert.ok(pageAccess.includes('function resolvePageDomain_'), 'resolvePageDomain_ missing from routing');
assert.ok(pageAccess.includes('function canAccessPage_'), 'canAccessPage_ missing from routing');
assert.ok(!pageAccess.includes('function buildDomainAccess_'), 'routing must not build IAM domain access');
assert.ok(domainAccess.includes('function buildDomainAccess_'), 'buildDomainAccess_ missing from IAM application');
assert.ok(!domainAccess.includes('function canAccessPage_'), 'IAM application must not own page routing guard');
assert.ok(code.includes("settings_departments: 'frontend/pages/settings_departments/Settings_Departments'"), 'settings_departments route missing');
assert.ok(!code.includes("accounting: '400_accounting/400_home/Accounting_Home'"), 'accounting overview route must be removed');
assert.ok(code.includes("accounting_ledger: '400_accounting/410_ledger/Accounting_Ledger'"), 'accounting_ledger route missing');
assert.ok(code.includes("accounting_reconciliation: 'frontend/pages/accounting_reconciliation/Accounting_Reconciliation'"), 'accounting_reconciliation route missing');
assert.ok(code.includes("accounting_settlement: 'frontend/pages/accounting_settlement/Accounting_Settlement'"), 'accounting_settlement route missing');
assert.ok(code.includes('canAccessPage_(page, login)'), 'router access guard missing');
assert.ok(code.includes("file = 'frontend/pages/access_denied/Access_Denied'"), 'access denied route missing');
assert.ok(api.includes('domainAccess:'), 'auth API domainAccess missing');
assert.ok(fs.existsSync(deniedPath), 'Access_Denied view missing');

var context = vm.createContext({ String: String, Object: Object, Array: Array });
vm.runInContext(domainAccess + '\n' + pageAccess, context, { filename: 'route_access_contract.gs' });
var eventOnly = context.buildDomainAccess_({ menus: [{ id: 'area_행사', name: '행사', group: '행사' }] }, false);
assert.strictEqual(eventOnly.event, true);
assert.strictEqual(eventOnly.accounting, false);
assert.strictEqual(context.canAccessPage_('event', { ok: true, isAdmin: false, domainAccess: eventOnly }), true);
assert.strictEqual(context.canAccessPage_('accounting', { ok: true, isAdmin: false, domainAccess: eventOnly }), false);
assert.strictEqual(context.canAccessPage_('mypage', { ok: true, isAdmin: false, domainAccess: {} }), true);
assert.strictEqual(context.canAccessPage_('event', { ok: false }), false);
var admin = context.buildDomainAccess_({}, true);
assert.strictEqual(admin.main && admin.accounting && admin.student_fee && admin.event && admin.settings, true);
console.log('IAM route access contract passed.');
