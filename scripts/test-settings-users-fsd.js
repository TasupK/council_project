const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));

[
  'src/frontend/pages/settings_users/Settings_Users.html',
  'src/frontend/pages/settings_users/Settings_Users_View.html',
  'src/frontend/pages/settings_users/settings_users_controller_js.html',
  'src/frontend/features/settings_users_manage/settings_users_manage_js.html'
].forEach(p => assert.ok(exists(p), 'missing Settings Users FSD file: ' + p));

const page = read('src/frontend/pages/settings_users/Settings_Users.html');
[
  "include('frontend/shared/styles/App_Styles')",
  "include('frontend/app/styles/App_Shell_Styles')",
  "include('frontend/shared/api/app_api_runner_js')",
  "include('frontend/entities/user/api/app_client_js')",
  "include('frontend/entities/iam/api/settings_client_js')",
  "include('frontend/widgets/settings_shell/Settings_Styles')",
  "include('frontend/widgets/settings_shell/settings_shell_js')",
  "include('frontend/features/settings_users_manage/settings_users_manage_js')",
  "include('frontend/pages/settings_users/settings_users_controller_js')"
].forEach(needle => assert.ok(page.includes(needle), 'Settings Users missing FSD include: ' + needle));
assert.ok(!page.includes("include('100_common/"), 'Settings Users must not use legacy common includes');

const feature = read('src/frontend/features/settings_users_manage/settings_users_manage_js.html');
assert.ok(feature.includes('function initSettingsUsersManagement()'), 'user management feature must expose init function');
assert.ok(feature.includes('settingsClient.getUsers()'), 'user management feature must load users through settingsClient');
assert.ok(feature.includes('settingsClient.saveUserChanges'), 'user management feature must own user change save action');
assert.ok(feature.includes('addNewUserRow_'), 'user management feature must own user creation interaction');

const controller = read('src/frontend/pages/settings_users/settings_users_controller_js.html');
assert.ok(controller.includes('initSettingsUsersManagement()'), 'Settings Users page controller must initialize the management feature');

const router = read('src/backend/app/routing/Code.js');
assert.ok(router.includes("settings_users: 'frontend/pages/settings_users/Settings_Users'"), 'router must use migrated Settings Users page');

console.log('Settings Users FSD migration contract: PASS');
