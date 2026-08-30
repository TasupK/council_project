var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
function exists_(p) { return fs.existsSync(path.join(ROOT, p)); }
function read_(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

var required = [
  'src/frontend/pages/settings_permissions/Settings_Permissions.html',
  'src/frontend/pages/settings_permissions/Settings_Permissions_View.html',
  'src/frontend/pages/settings_permissions/settings_permissions_controller_js.html',
  'src/frontend/features/settings_permissions_manage/settings_permissions_manage_js.html',
  'src/frontend/entities/iam/api/settings_client_js.html'
];
required.forEach(function (p) { assert.ok(exists_(p), 'missing Settings Permissions FSD file: ' + p); });

var page = read_(required[0]);
[
  "include('frontend/shared/styles/App_Styles')",
  "include('frontend/app/styles/App_Shell_Styles')",
  "include('frontend/shared/api/rpc/app_api_runner_js')",
  "include('frontend/entities/user/api/app_client_js')",
  "include('frontend/entities/iam/api/settings_client_js')",
  "include('frontend/widgets/settings_shell/Settings_Styles')",
  "include('frontend/widgets/settings_shell/settings_shell_js')",
  "include('frontend/features/settings_permissions_manage/settings_permissions_manage_js')",
  "include('frontend/pages/settings_permissions/settings_permissions_controller_js')"
].forEach(function (needle) { assert.ok(page.indexOf(needle) !== -1, 'Settings Permissions missing FSD include: ' + needle); });
assert.ok(page.indexOf("include('100_common/") === -1 && page.indexOf("include('300_settings/") === -1, 'migrated Settings Permissions must not include legacy paths');

var controller = read_(required[2]);
assert.ok(controller.indexOf('settingsClient.getPermissions()') !== -1, 'page controller must load permissions data');
assert.ok(controller.indexOf('initializeSettingsPermissionsManage') !== -1, 'page controller must initialize permissions feature');
var feature = read_(required[3]);
['renderSettingsPermissions', 'permissionChangeCount_', 'commitPermissionChanges_', 'discardPermissionChanges_'].forEach(function (name) {
  assert.ok(feature.indexOf(name) !== -1, 'permissions feature missing behavior: ' + name);
});
assert.ok(feature.indexOf('settingsClient.saveRolePermissions') !== -1, 'permissions feature must save through IAM entity client');
assert.ok(feature.indexOf('runAppApi') === -1 && feature.indexOf('google.script.run') === -1, 'permissions feature must not own transport');

var router = read_('src/backend/app/routing/Code.js');
assert.ok(router.indexOf("settings_permissions: 'frontend/pages/settings_permissions/Settings_Permissions'") !== -1, 'router must use migrated Settings Permissions page');
assert.ok(!exists_('src/300_settings/330_permissions'), 'legacy Settings Permissions directory must be removed');
console.log('Settings Permissions FSD migration contract: PASS');
