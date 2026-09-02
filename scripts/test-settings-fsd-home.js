const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));

const required = [
  'src/frontend/pages/settings_home/Settings_Home.html',
  'src/frontend/pages/settings_home/Settings_Home_View.html',
  'src/frontend/pages/settings_home/settings_home_controller_js.html',
  'src/frontend/widgets/settings_shell/Settings_Styles.html',
  'src/frontend/widgets/settings_shell/settings_shell_js.html',
  'src/frontend/entities/iam/api/settings_client_js.html'
];
required.forEach(p => assert.ok(exists(p), 'missing Settings FSD file: ' + p));

const page = read('src/frontend/pages/settings_home/Settings_Home.html');
[
  "include('frontend/shared/styles/App_Styles')",
  "include('frontend/app/styles/App_Shell_Styles')",
  "include('frontend/shared/api/rpc/app_api_runner_js')",
  "include('frontend/entities/user/api/app_client_js')",
  "include('frontend/entities/iam/api/settings_client_js')",
  "include('frontend/widgets/settings_shell/Settings_Styles')",
  "include('frontend/widgets/app_header/App_Header')",
  "include('frontend/widgets/app_sidebar/App_Sidebar')",
  "include('frontend/widgets/settings_shell/settings_shell_js')",
  "include('frontend/pages/settings_home/settings_home_controller_js')"
].forEach(needle => assert.ok(page.includes(needle), 'Settings Home missing FSD include: ' + needle));
assert.ok(!page.includes("include('100_common/"), 'Settings Home must not use legacy common includes');

const controller = read('src/frontend/pages/settings_home/settings_home_controller_js.html');
assert.ok(controller.includes('settingsClient.getHome()'), 'Settings Home controller must load home data through settingsClient');
assert.ok(controller.includes('applySettingsShell(data)'), 'Settings Home controller must delegate shared shell rendering');
assert.ok(controller.includes('renderConnectionCards_('), 'Settings Home controller must render connection cards');
assert.ok(controller.includes('submitConnectionChange_('), 'Settings Home controller must own connection submit flow');

const view = read('src/frontend/pages/settings_home/Settings_Home_View.html');
[
  'operationDbConnectionCard',
  'userDbConnectionCard',
  'rootFolderConnectionCard',
  'operationDbUrlInput',
  'userDbUrlInput',
  'rootFolderUrlInput',
  'btnSaveOperationDb',
  'btnSaveUserDb',
  'btnSaveRootFolder'
].forEach(id => assert.ok(view.includes('id="' + id + '"'), 'missing connection UI: ' + id));
['btnDisconnect', '연도별', '프로필 목록', '전체 연결 저장'].forEach(needle => {
  assert.ok(!view.includes(needle), 'Settings Home must not expose unsupported connection UI: ' + needle);
});

const entityApi = read('src/frontend/entities/iam/api/settings_client_js.html');
assert.ok(entityApi.includes("runAppApi('api_getSettingsHome'"), 'IAM entity client must own Settings Home API mapping');
[
  'api_updateOperationDbConnection',
  'api_updateUserDbConnection',
  'api_updateRootFolderConnection'
].forEach(name => assert.ok(entityApi.includes(name), 'missing Settings connection API mapping: ' + name));

const router = read('src/backend/app/routing/Code.js');
assert.ok(router.includes("settings: 'frontend/pages/settings_home/Settings_Home'"), 'router must use migrated Settings Home page');

console.log('Settings FSD Home migration contract: PASS');
