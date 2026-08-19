var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var failures = [];

function read_(relativePath) {
  var target = path.join(ROOT, relativePath);
  if (!fs.existsSync(target)) {
    failures.push('Missing MyPage architecture file: ' + relativePath);
    return '';
  }
  return fs.readFileSync(target, 'utf8');
}

function listFiles_(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listFiles_(target));
    files.push(target);
    return files;
  }, []);
}

var code = read_('src/000_server/Code.js');
var authApi = read_('src/000_server/030_auth/auth_api.gs');
var permissionService = read_('src/000_server/040_iam/043_permissions/permissions_query_service.gs');
var header = read_('src/100_common/App_Header.html');
var shell = read_('src/100_common/app_shell_js.html');
var appClient = read_('src/100_common/app_client_js.html');
var page = read_('src/270_mypage/MyPage.html');
var client = read_('src/270_mypage/mypage_js.html');

if (code.indexOf("mypage: '270_mypage/MyPage'") === -1) failures.push('MyPage route is not registered in Code.js.');
if (code.indexOf("page === 'mypage'") === -1) failures.push('MyPage route is not protected by the login guard.');
if (permissionService.indexOf('function buildEffectivePermissionDetails_(') === -1) failures.push('IAM must own buildEffectivePermissionDetails_.');
if (authApi.indexOf('buildEffectivePermissionDetails_(current.permissions || {})') === -1) failures.push('Auth API must expose IAM-owned effective permission details.');
if (!/<a[^>]*id="appUserCard"/.test(header)) failures.push('Header user card must be an accessible anchor.');
if (shell.indexOf("getAppElement('appUserCard').href = buildAppPageUrl('mypage')") === -1) failures.push('Shared shell must link the user card to MyPage.');

['100_common/App_Styles', '100_common/App_Header', '100_common/App_Sidebar', '100_common/app_api_runner_js', '100_common/app_client_js', '100_common/app_shell_js'].forEach(function (includePath) {
  if (page.indexOf(includePath) === -1) failures.push('MyPage must reuse shared shell/client include: ' + includePath);
});

if (fs.existsSync(path.join(ROOT, 'src', '000_server', '070_mypage'))) failures.push('MyPage must not introduce a server-owned domain directory.');

var protectedSources = [
  'src/000_server/030_auth',
  'src/200_login',
  'src/270_mypage'
].reduce(function (sources, relativePath) {
  return sources.concat(listFiles_(path.join(ROOT, relativePath)));
}, []);

protectedSources.forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  var relative = path.relative(ROOT, file).replace(/\\/g, '/');
  if (/loginWithCredentials|password123|setupDatabaseSheet|\bDB_URL\b/.test(source)) {
    failures.push('Legacy credential/alternate DB behavior found: ' + relative);
  }
  if (/테스트 유저|implicit chairman|mock chairman/.test(source)) {
    failures.push('Mock user fallback found: ' + relative);
  }
});

if (/sessionStorage|localStorage/.test(client)) failures.push('MyPage must not use browser storage as identity/auth source.');
if (/회계 담당|회장|부회장|국장|부원/.test(client)) failures.push('MyPage client must not hard-code role permission mappings.');
if (client.indexOf('appClient.getCurrentUser()') === -1 || client.indexOf('appClient.getMyPermissions()') === -1) failures.push('MyPage must consume semantic Auth/IAM client methods.');
if (appClient.indexOf("runAppApi('api_getCurrentUser'") === -1 || appClient.indexOf("runAppApi('api_getMyPermissions'") === -1) failures.push('Shared app client must own Auth/IAM API mappings.');
if (/google\.script\.run/.test(client)) failures.push('MyPage must not call GAS transport directly.');
if (client.indexOf('permissionDetails') === -1) failures.push('MyPage must render server-provided permissionDetails.');

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('MyPage architecture verification passed.');
}
