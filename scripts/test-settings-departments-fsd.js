var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
function exists_(p) { return fs.existsSync(path.join(ROOT, p)); }
function read_(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

var required = [
  'src/frontend/pages/settings_departments/Settings_Departments.html',
  'src/frontend/pages/settings_departments/Settings_Departments_View.html',
  'src/frontend/pages/settings_departments/Settings_Departments_Styles.html',
  'src/frontend/pages/settings_departments/settings_departments_controller_js.html',
  'src/frontend/features/department_directory/department_directory_js.html',
  'src/frontend/entities/department/api/department_client_js.html',
  'src/frontend/widgets/settings_shell/settings_shell_js.html'
];
required.forEach(function (p) { assert.ok(exists_(p), 'missing Settings Departments FSD file: ' + p); });

var page = read_('src/frontend/pages/settings_departments/Settings_Departments.html');
[
  "include('frontend/shared/styles/App_Styles')",
  "include('frontend/app/styles/App_Shell_Styles')",
  "include('frontend/shared/api/rpc/app_api_runner_js')",
  "include('frontend/entities/user/api/app_client_js')",
  "include('frontend/entities/department/api/department_client_js')",
  "include('frontend/widgets/settings_shell/settings_shell_js')",
  "include('frontend/features/department_directory/department_directory_js')",
  "include('frontend/pages/settings_departments/settings_departments_controller_js')"
].forEach(function (needle) { assert.ok(page.indexOf(needle) !== -1, 'Settings Departments missing FSD include: ' + needle); });
assert.ok(page.indexOf("include('100_common/") === -1, 'migrated Settings Departments must not include legacy 100_common');
assert.ok(page.indexOf("include('300_settings/") === -1, 'migrated Settings Departments must not include legacy settings paths');

var controller = read_('src/frontend/pages/settings_departments/settings_departments_controller_js.html');
assert.ok(controller.indexOf('departmentClient.getDepartments()') !== -1, 'page controller must load department entity data');
assert.ok(controller.indexOf('renderDepartmentDirectory') !== -1, 'page controller must compose department directory feature');
var feature = read_('src/frontend/features/department_directory/department_directory_js.html');
assert.ok(feature.indexOf('renderDepartmentSummary') !== -1 && feature.indexOf('renderDepartmentGroups') !== -1, 'department feature must own directory rendering');
assert.ok(feature.indexOf('runAppApi') === -1, 'department feature must not own transport');
var entityApi = read_('src/frontend/entities/department/api/department_client_js.html');
assert.ok(entityApi.indexOf("runAppApi('api_getSettingsDepartments'") !== -1, 'department entity API must own settings departments mapping');

var router = read_('src/backend/app/routing/Code.js');
assert.ok(router.indexOf("settings_departments: 'frontend/pages/settings_departments/Settings_Departments'") !== -1, 'router must use migrated Settings Departments page');
assert.ok(!exists_('src/300_settings/340_departments'), 'legacy Settings Departments directory must be removed');

console.log('Settings Departments FSD migration contract: PASS');
