var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
function read_(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

var clientPath = path.join(ROOT, 'src/300_settings/common/settings_client_js.html');
assert.ok(fs.existsSync(clientPath), 'settings_client_js.html must exist');
var client = fs.readFileSync(clientPath, 'utf8');
[
  ["getHome", "api_getSettingsHome"],
  ["getUsers", "api_getSettingsUsers"],
  ["updateUserDepartment", "api_updateSettingsUserDepartment"],
  ["getRoles", "api_getSettingsRoles"],
  ["getPermissions", "api_getSettingsPermissions"],
  ["getDepartments", "api_getSettingsDepartments"]
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

var access = read_('src/000_server/070_settings/070_common/settings_access.gs');
assert.ok(access.indexOf('requireAuthenticatedUserData_') !== -1, 'Settings access must use internal auth data contract');
assert.ok(access.indexOf('api_getCurrentUser()') === -1, 'Settings access must not chain through public Auth API');

[
  'src/000_server/070_settings/070_common/settings_shell_query_service.gs',
  'src/000_server/070_settings/071_users/settings_users_api.gs',
  'src/000_server/070_settings/072_roles/settings_roles_api.gs',
  'src/000_server/070_settings/073_permissions/settings_permissions_api.gs',
  'src/000_server/070_settings/074_departments/settings_departments_api.gs'
].forEach(function (relativePath) {
  var source = read_(relativePath);
  assert.ok(source.indexOf('apiHandler_') !== -1, relativePath + ' must expose canonical API boundary');
});

console.log('API Contract v1 Settings: PASS');
