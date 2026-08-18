var fs = require('fs');
var assert = require('assert');
function read(path) { return fs.readFileSync(path, 'utf8'); }

var api = read('src/000_server/070_settings/071_users/settings_users_api.gs');
var query = read('src/000_server/070_settings/071_users/settings_users_query_service.gs');
var servicePath = 'src/000_server/070_settings/071_users/settings_users_department_service.gs';
var view = read('src/300_settings/310_users/Settings_Users_View.html');
var js = read('src/300_settings/310_users/settings_users_js.html');

assert.ok(api.includes('departments: listActiveDepartments_()'), 'department options missing from loadSettingsUsersData');
assert.ok(api.includes('function saveSettingsUserDepartment'), 'saveSettingsUserDepartment API missing');
assert.ok(fs.existsSync(servicePath), 'department assignment service missing');
var service = fs.existsSync(servicePath) ? read(servicePath) : '';
assert.ok(service.includes('function updateSettingsUserDepartment_'), 'updateSettingsUserDepartment_ missing');
assert.ok(service.includes("sheetUpdateById_('user', 'users'"), 'user department persistence must use sheet CRUD');
assert.ok(service.includes('invalidateLoginContextCache_'), 'login cache invalidation missing');
assert.ok(service.includes('getAdminSettingsCurrent_'), 'admin authorization missing');
assert.ok(query.includes('departmentMap') && query.includes('getDepartmentsById_'), 'settings user query should reuse one department lookup');
assert.ok(view.includes('data-user-department'), 'department selector hook missing');
assert.ok(js.includes('saveSettingsUserDepartment'), 'frontend department mutation call missing');
console.log('Settings department assignment contract passed.');
