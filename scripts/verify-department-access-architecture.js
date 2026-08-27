var fs = require('fs');
var assert = require('assert');
function read(path) { return fs.readFileSync(path, 'utf8'); }
function exists(path) { assert.ok(fs.existsSync(path), 'missing ' + path); }

var required = [
  'src/backend/domains/iam/repositories/departments_repository.gs',
  'src/backend/domains/iam/application/departments_query.gs',
  'src/backend/domains/iam/application/settings_users_department.gs',
  'src/backend/domains/iam/controllers/settings_departments_controller.gs',
  'src/backend/domains/iam/application/settings_departments_query.gs',
  'src/backend/core/auth/auth_page_access.gs',
  'src/300_settings/340_departments/Settings_Departments.html',
  'src/300_settings/340_departments/Settings_Departments_View.html',
  'src/300_settings/340_departments/settings_departments_js.html'
];
required.forEach(exists);

var repository = read(required[0]);
var departmentQuery = read(required[1]);
var assignment = read(required[2]);
var chartQuery = read(required[4]);
var authAccess = read(required[5]);
var chartView = read(required[7]);
var sidebar = read('src/100_common/App_Sidebar.html');
var shell = read('src/100_common/app_shell_js.html');

assert.ok(repository.includes("getUserDbTableSchema_('departments')"), 'Department repository must own departments table');
assert.ok(!/getSettings|api_getCurrentUser|updateSheetCrudItemById_|insertSheetCrudItem_/.test(repository + departmentQuery), 'Department IAM read layer must not depend on Settings/Auth or write');
assert.ok(assignment.includes('getAdminSettingsCurrent_'), 'Department assignment must remain admin mutation');
assert.ok(assignment.includes("updateSheetCrudItemById_('user', 'users'"), 'Department assignment must use user Sheet CRUD');
assert.ok(!/updateSheetCrudItemById_|insertSheetCrudItem_|openUserSpreadsheet_|readTableRows_/.test(chartQuery), 'Department chart query must not access Sheet primitives or mutate');
assert.ok(!/executives|국장|차장|회장/.test(chartQuery), 'Phase 1 chart must not encode position hierarchy heuristics');
assert.ok(!/부서 추가|부서 수정|부서 삭제/.test(chartView), 'Department page must remain read-only');
assert.ok(authAccess.includes('function buildDomainAccess_') && authAccess.includes('function canAccessPage_'), 'Route access must be centralized in Auth');
assert.ok(sidebar.includes('hidden') && shell.includes('domainAccess'), 'Sidebar must mirror Auth domain access');

var newSources = required.map(read).join('\n') + read('src/300_settings/310_users/settings_users_js.html');
['apiV1_', 'loadAllData(', 'sessionStorage', 'DB_URL'].forEach(function (legacy) {
  assert.strictEqual(newSources.indexOf(legacy), -1, 'legacy pattern must not be ported: ' + legacy);
});
console.log('Department/access architecture verification passed.');
