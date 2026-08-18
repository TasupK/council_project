var fs = require('fs');
var assert = require('assert');
function read(path) { return fs.readFileSync(path, 'utf8'); }
var helperPath = 'src/000_server/030_auth/auth_page_access.gs';
var deniedPath = 'src/100_common/Access_Denied.html';
assert.ok(fs.existsSync(helperPath), 'auth page access helper missing');
var helper = fs.existsSync(helperPath) ? read(helperPath) : '';
var code = read('src/000_server/Code.js');
var api = read('src/000_server/030_auth/auth_api.gs');
assert.ok(helper.includes('function resolvePageDomain_'), 'resolvePageDomain_ missing');
assert.ok(helper.includes('function buildDomainAccess_'), 'buildDomainAccess_ missing');
assert.ok(helper.includes('function canAccessPage_'), 'canAccessPage_ missing');
assert.ok(code.includes("settings_departments: '300_settings/340_departments/Settings_Departments'"), 'settings_departments route missing');
assert.ok(code.includes('canAccessPage_(page, login)'), 'router access guard missing');
assert.ok(code.includes("file = '100_common/Access_Denied'"), 'access denied route missing');
assert.ok(api.includes('domainAccess:'), 'auth API domainAccess missing');
assert.ok(fs.existsSync(deniedPath), 'Access_Denied view missing');
console.log('IAM route access contract passed.');
