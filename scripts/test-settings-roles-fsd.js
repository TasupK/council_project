const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));

[
  'src/frontend/pages/settings_roles/Settings_Roles.html',
  'src/frontend/pages/settings_roles/Settings_Roles_View.html',
  'src/frontend/pages/settings_roles/settings_roles_controller_js.html',
  'src/frontend/features/settings_roles_manage/settings_roles_manage_js.html'
].forEach(p => assert.ok(exists(p), 'missing Settings Roles FSD file: ' + p));

const page = read('src/frontend/pages/settings_roles/Settings_Roles.html');
[
  "include('frontend/shared/styles/App_Styles')",
  "include('frontend/app/styles/App_Shell_Styles')",
  "include('frontend/shared/api/rpc/app_api_runner_js')",
  "include('frontend/entities/user/api/app_client_js')",
  "include('frontend/entities/iam/api/settings_client_js')",
  "include('frontend/widgets/settings_shell/Settings_Styles')",
  "include('frontend/widgets/settings_shell/settings_shell_js')",
  "include('frontend/features/settings_roles_manage/settings_roles_manage_js')",
  "include('frontend/pages/settings_roles/settings_roles_controller_js')"
].forEach(needle => assert.ok(page.includes(needle), 'Settings Roles missing FSD include: ' + needle));
assert.ok(!page.includes("include('100_common/"), 'Settings Roles must not use legacy common includes');

const feature = read('src/frontend/features/settings_roles_manage/settings_roles_manage_js.html');
assert.ok(feature.includes('function initSettingsRolesManagement()'), 'role management feature must expose init function');
assert.ok(feature.includes('settingsClient.getRoles()'), 'role management feature must load roles through settingsClient');
assert.ok(feature.includes('settingsClient.saveRoleChanges'), 'role management feature must own role change save action');
assert.ok(feature.includes('addNewRole_'), 'role management feature must own role creation interaction');

const controller = read('src/frontend/pages/settings_roles/settings_roles_controller_js.html');
assert.ok(controller.includes('initSettingsRolesManagement()'), 'Settings Roles page controller must initialize the management feature');

const router = read('src/backend/app/routing/Code.js');
assert.ok(router.includes("settings_roles: 'frontend/pages/settings_roles/Settings_Roles'"), 'router must use migrated Settings Roles page');

console.log('Settings Roles FSD migration contract: PASS');
