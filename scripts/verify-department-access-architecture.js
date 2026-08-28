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
  'src/backend/domains/iam/application/domain_access.gs',
  'src/backend/app/routing/page_access.gs',
  'src/frontend/pages/settings_departments/Settings_Departments.html',
  'src/frontend/pages/settings_departments/Settings_Departments_View.html',
  'src/frontend/pages/settings_departments/settings_departments_controller_js.html',
  'src/frontend/features/department_directory/department_directory_js.html',
  'src/frontend/entities/department/api/department_client_js.html'
];
required.forEach(exists);

var repository = read(required[0]);
var departmentQuery = read(required[1]);
var assignment = read(required[2]);
var chartQuery = read(required[4]);
var domainAccess = read(required[5]);
var pageAccess = read(required[6]);
var chartView = read(required[8]);
var controller = read(required[9]);
var directoryFeature = read(required[10]);
var departmentClient = read(required[11]);
var sidebar = read('src/frontend/widgets/app_sidebar/App_Sidebar.html');
var shell = read('src/frontend/app/shell/app_shell_js.html');

assert.ok(repository.includes("getUserDbTableSchema_('departments')"), 'Department repository must own departments table');
assert.ok(!/getSettings|api_getCurrentUser|updateSheetCrudItemById_|insertSheetCrudItem_/.test(repository + departmentQuery), 'Department IAM read layer must not depend on Settings/Auth or write');
assert.ok(assignment.includes('getAdminSettingsCurrent_'), 'Department assignment must remain admin mutation');
assert.ok(assignment.includes("updateSheetCrudItemById_('user', 'users'"), 'Department assignment must use user Sheet CRUD');
assert.ok(!/updateSheetCrudItemById_|insertSheetCrudItem_|openUserSpreadsheet_|readTableRows_/.test(chartQuery), 'Department chart query must not access Sheet primitives or mutate');
assert.ok(!/executives|국장|차장|회장/.test(chartQuery), 'Phase 1 chart must not encode position hierarchy heuristics');
assert.ok(!/부서 추가|부서 수정|부서 삭제/.test(chartView), 'Department page must remain read-only');
assert.ok(domainAccess.includes('function buildDomainAccess_'), 'IAM application must own domain access mapping');
assert.ok(pageAccess.includes('function resolvePageDomain_') && pageAccess.includes('function canAccessPage_'), 'App routing must own page access policy');
assert.ok(sidebar.includes('hidden') && shell.includes('domainAccess'), 'Sidebar must mirror Auth domain access');
assert.ok(controller.includes('departmentClient.getDepartments()'), 'Settings Departments controller must use department entity API');
assert.ok(controller.includes('renderDepartmentDirectory'), 'Settings Departments controller must compose department directory feature');
assert.ok(!/runAppApi|google\.script\.run/.test(directoryFeature), 'Department directory feature must not own transport');
assert.ok(departmentClient.includes("runAppApi('api_getSettingsDepartments'"), 'Department entity API must own departments transport mapping');

var newSources = required.map(read).join('\n') + read('src/300_settings/310_users/settings_users_js.html');
['apiV1_', 'loadAllData(', 'sessionStorage', 'DB_URL'].forEach(function (legacy) {
  assert.strictEqual(newSources.indexOf(legacy), -1, 'legacy pattern must not be ported: ' + legacy);
});
console.log('Department/access architecture verification passed.');
