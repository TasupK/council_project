var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
function read_(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

var page = read_('src/270_mypage/MyPage.html');
var view = read_('src/270_mypage/MyPage_View.html');
var styles = read_('src/270_mypage/MyPage_Styles.html');
var client = read_('src/270_mypage/mypage_js.html');
var appClient = read_('src/100_common/app_client_js.html');

['100_common/App_Styles', '100_common/App_Header', '100_common/App_Sidebar', '100_common/app_api_runner_js', '100_common/app_client_js', '100_common/app_shell_js'].forEach(function (includePath) {
  assert.ok(page.indexOf(includePath) !== -1, 'MyPage must reuse shared shell: ' + includePath);
});
assert.ok(page.indexOf('270_mypage/MyPage_Styles') !== -1);
assert.ok(page.indexOf('270_mypage/MyPage_View') !== -1);
assert.ok(page.indexOf('270_mypage/mypage_js') !== -1);
assert.ok(page.indexOf("APP_CURRENT_PAGE =") !== -1);

['mypageName', 'mypageEmail', 'mypageDepartment', 'mypageStatus', 'mypageTitle', 'mypageRoles', 'mypagePermissions', 'mypageMenus'].forEach(function (id) {
  assert.ok(view.indexOf('id="' + id + '"') !== -1, 'missing MyPage view hook: ' + id);
});

assert.ok(client.indexOf('appClient.getCurrentUser()') !== -1, 'MyPage must use appClient.getCurrentUser');
assert.ok(client.indexOf('appClient.getMyPermissions()') !== -1, 'MyPage must use appClient.getMyPermissions');
assert.ok(appClient.indexOf("runAppApi('api_getCurrentUser'") !== -1, 'app client must own api_getCurrentUser mapping');
assert.ok(appClient.indexOf("runAppApi('api_getMyPermissions'") !== -1, 'app client must own api_getMyPermissions mapping');
assert.ok(client.indexOf('permissionDetails') !== -1, 'MyPage must render IAM permission details');
assert.ok(client.indexOf('sessionStorage') === -1, 'MyPage must not trust browser sessionStorage for user identity');
assert.ok(client.indexOf('localStorage') === -1, 'MyPage must not trust browser localStorage for user identity');
assert.ok(client.indexOf('회계 담당') === -1 && client.indexOf('회장') === -1, 'MyPage must not hard-code role permission maps');
assert.ok(styles.indexOf('.mypage-') !== -1, 'MyPage-specific styles must be scoped');

console.log('MyPage frontend contract tests passed.');
