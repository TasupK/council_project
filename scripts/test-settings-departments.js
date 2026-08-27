var fs = require('fs');
var assert = require('assert');
function read(path) { return fs.readFileSync(path, 'utf8'); }

var api = read('src/backend/domains/iam/controllers/settings_users_controller.gs');
var query = read('src/backend/domains/iam/application/settings_users_query.gs');
var servicePath = 'src/backend/domains/iam/application/settings_users_department.gs';
var view = read('src/300_settings/310_users/Settings_Users_View.html');
var js = read('src/300_settings/310_users/settings_users_js.html');
var client = read('src/300_settings/common/settings_client_js.html');

assert.ok(api.includes('departments: getActiveDepartmentsData_()'), 'department options missing from api_getSettingsUsers');
assert.ok(api.includes('function api_updateSettingsUserDepartment'), 'api_updateSettingsUserDepartment API missing');
assert.ok(fs.existsSync(servicePath), 'department assignment service missing');
var service = fs.existsSync(servicePath) ? read(servicePath) : '';
assert.ok(service.includes('function updateSettingsUserDepartment_'), 'updateSettingsUserDepartment_ missing');
assert.ok(service.includes("updateSheetCrudItemById_('user', 'users'"), 'user department persistence must use sheet CRUD');
assert.ok(service.includes('invalidateLoginContextCache_'), 'login cache invalidation missing');
assert.ok(service.includes('getAdminSettingsCurrent_'), 'admin authorization missing');
assert.ok(query.includes('departmentMap') && query.includes('buildDepartmentsById_'), 'settings user query should reuse one department lookup');
assert.ok(view.includes('data-user-department'), 'department selector hook missing');
assert.ok(js.includes("data-user-field=\"departmentId\"") || js.includes("data-user-field='departmentId'"), 'batch user editor must expose department field');
assert.ok(js.includes('settingsClient.saveUserChanges'), 'batch department/user persistence must use Settings semantic client');
assert.ok(client.includes('api_updateSettingsUserDepartment'), 'Settings client must retain department mutation API mapping');
console.log('Settings department assignment contract passed.');
