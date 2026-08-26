var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
function read_(relativePath) { return fs.readFileSync(path.join(ROOT, relativePath), 'utf8'); }

var clientPath = path.join(ROOT, 'src/300_settings/common/settings_client_js.html');
assert.ok(fs.existsSync(clientPath), 'settings_client_js.html must exist');
var client = fs.readFileSync(clientPath, 'utf8');
[
  ['getHome', 'api_getSettingsHome'],
  ['getUsers', 'api_getSettingsUsers'],
  ['updateUserDepartment', 'api_updateSettingsUserDepartment'],
  ['saveUserChanges', 'api_applySettingsUserChanges'],
  ['createUser', 'api_createSettingsUser'],
  ['updateUser', 'api_updateSettingsUser'],
  ['getRoles', 'api_getSettingsRoles'],
  ['saveRoleChanges', 'api_applySettingsRoleChanges'],
  ['createRole', 'api_createSettingsRole'],
  ['updateRole', 'api_updateSettingsRole'],
  ['getPermissions', 'api_getSettingsPermissions'],
  ['saveRolePermissions', 'api_updateSettingsRolePermissions'],
  ['getDepartments', 'api_getSettingsDepartments']
].forEach(function (pair) {
  assert.ok(client.indexOf(pair[0]) !== -1, 'missing settings client method: ' + pair[0]);
  assert.ok(client.indexOf(pair[1]) !== -1, 'missing settings API mapping: ' + pair[1]);
});
assert.ok(client.indexOf('runAppApi') !== -1, 'settings client must use shared runner');
assert.ok(client.indexOf('google.script.run') === -1, 'settings client must not own GAS transport');

var common = read_('src/300_settings/common/settings_common_js.html');
assert.ok(common.indexOf('callSettingsApi') === -1, 'legacy callSettingsApi wrapper must be removed');
assert.ok(common.indexOf('google.script.run') === -1, 'settings common frontend must not call GAS directly');

[
  'src/300_settings/300_home/settings_home_js.html',
  'src/300_settings/310_users/settings_users_js.html',
  'src/300_settings/320_roles/settings_roles_js.html',
  'src/300_settings/330_permissions/settings_permissions_js.html',
  'src/300_settings/340_departments/settings_departments_js.html'
].forEach(function (relativePath) {
  var source = read_(relativePath);
  assert.ok(source.indexOf('callSettingsApi') === -1, relativePath + ' must use semantic settings client');
  assert.ok(source.indexOf('google.script.run') === -1, relativePath + ' must not call GAS directly');
});

var access = read_('src/backend/domains/iam/application/settings_access.gs');
assert.ok(access.indexOf('requireAuthenticatedUserData_') !== -1, 'Settings access must use internal auth data contract');
assert.ok(access.indexOf('api_getCurrentUser()') === -1, 'Settings access must not chain through public Auth API');

[
  'src/backend/domains/iam/controllers/settings_home_controller.gs',
  'src/backend/domains/iam/controllers/settings_users_controller.gs',
  'src/backend/domains/iam/controllers/settings_roles_controller.gs',
  'src/backend/domains/iam/controllers/settings_permissions_controller.gs',
  'src/backend/domains/iam/controllers/settings_departments_controller.gs'
].forEach(function (relativePath) {
  var source = read_(relativePath);
  assert.ok(source.indexOf('apiHandler_') !== -1, relativePath + ' must expose canonical API boundary');
});

var usersApi = read_('src/backend/domains/iam/controllers/settings_users_controller.gs');
['api_applySettingsUserChanges', 'api_createSettingsUser', 'api_updateSettingsUser'].forEach(function (name) {
  assert.ok(usersApi.indexOf(name) !== -1, 'missing settings users API: ' + name);
});
var rolesApi = read_('src/backend/domains/iam/controllers/settings_roles_controller.gs');
['api_applySettingsRoleChanges', 'api_createSettingsRole', 'api_updateSettingsRole'].forEach(function (name) {
  assert.ok(rolesApi.indexOf(name) !== -1, 'missing settings roles API: ' + name);
});
var permissionsApi = read_('src/backend/domains/iam/controllers/settings_permissions_controller.gs');
assert.ok(permissionsApi.indexOf('api_updateSettingsRolePermissions') !== -1, 'missing settings permissions mutation API');

[
  'src/backend/domains/iam/application/settings_users_mutation.gs',
  'src/backend/domains/iam/application/settings_roles_mutation.gs',
  'src/backend/domains/iam/application/settings_permissions_mutation.gs'
].forEach(function (relativePath) {
  assert.ok(fs.existsSync(path.join(ROOT, relativePath)), relativePath + ' must exist');
});

var config = read_('src/backend/app/config/config.gs');
assert.ok(config.indexOf('BOOTSTRAP_ADMIN_EMAILS') === -1, 'repository config must not hardcode bootstrap admin emails');
var manifest = JSON.parse(read_('src/appsscript.json'));
assert.strictEqual(manifest.webapp.access, 'MYSELF', 'PR #28 must not widen Apps Script webapp access policy');

console.log('API Contract v1 Settings: PASS');
