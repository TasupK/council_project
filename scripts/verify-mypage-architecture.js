var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var failures = [];
function read_(relativePath) { var target = path.join(ROOT, relativePath); if (!fs.existsSync(target)) { failures.push('Missing MyPage architecture file: ' + relativePath); return ''; } return fs.readFileSync(target, 'utf8'); }
function listFiles_(directory) { if (!fs.existsSync(directory)) return []; return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) { var target = path.join(directory, entry.name); if (entry.isDirectory()) return files.concat(listFiles_(target)); files.push(target); return files; }, []); }
var code = read_('src/backend/app/routing/Code.js');
var authController = read_('src/backend/domains/iam/controllers/auth_controller.gs');
var permissionQuery = read_('src/backend/domains/iam/application/permissions_query.gs');
var authContext = read_('src/backend/core/auth/auth_context.gs');
var header = read_('src/frontend/widgets/app_header/App_Header.html');
var shell = read_('src/frontend/app/shell/app_shell_js.html');
var appClient = read_('src/frontend/entities/user/api/app_client_js.html');
var page = read_('src/frontend/pages/mypage/MyPage.html');
var controller = read_('src/frontend/pages/mypage/mypage_controller_js.html');
var feature = read_('src/frontend/features/notification_settings/notification_settings_js.html');
if (code.indexOf("mypage: 'frontend/pages/mypage/MyPage'") === -1) failures.push('MyPage route is not registered in app routing/Code.js.');
if (code.indexOf("page === 'mypage'") === -1 || code.indexOf('var isKnownProtectedPage') === -1) failures.push('MyPage route is not protected by the centralized login guard.');
if (authContext.indexOf('function requireLoginContext_(') === -1) failures.push('Core Auth must own the shared login context guard.');
if (permissionQuery.indexOf('function buildEffectivePermissionDetails_(') === -1) failures.push('IAM application must own buildEffectivePermissionDetails_.');
if (authController.indexOf('buildEffectivePermissionDetails_(current.permissions || {})') === -1) failures.push('IAM Auth controller must expose application-owned effective permission details.');
if (!/<button[^>]*id="appUserCard"[^>]*aria-haspopup="true"/.test(header)) failures.push('Header user card must be an accessible profile popup button.');
if (header.indexOf('id="goMy"') === -1) failures.push('Profile popup must expose a MyPage navigation action.');
if (shell.indexOf("var goMy = getAppElement('goMy')") === -1 || shell.indexOf("window.top.location.href = buildAppPageUrl('mypage')") === -1) failures.push('App shell must route the profile popup MyPage action to MyPage.');
['frontend/shared/styles/App_Styles','frontend/widgets/app_header/App_Header','frontend/widgets/app_sidebar/App_Sidebar','frontend/shared/api/app_api_runner_js','frontend/entities/user/api/app_client_js','frontend/app/shell/app_shell_js'].forEach(function (includePath) { if (page.indexOf(includePath) === -1) failures.push('MyPage must reuse FSD foundation include: ' + includePath); });
if (fs.existsSync(path.join(ROOT, 'src', '270_mypage'))) failures.push('Legacy MyPage frontend slice must be removed.');
if (fs.existsSync(path.join(ROOT, 'src', 'backend', 'domains', 'mypage'))) failures.push('MyPage must not introduce a backend-owned business domain.');
var protectedSources = ['src/backend/core/auth','src/backend/domains/iam','src/backend/app/routing','src/200_login','src/frontend/pages/mypage','src/frontend/features/notification_settings'].reduce(function (sources, relativePath) { return sources.concat(listFiles_(path.join(ROOT, relativePath))); }, []);
protectedSources.forEach(function (file) { var source = fs.readFileSync(file, 'utf8'); var relative = path.relative(ROOT, file).replace(/\\/g, '/'); if (/loginWithCredentials|password123|setupDatabaseSheet|\bDB_URL\b/.test(source)) failures.push('Legacy credential/alternate DB behavior found: ' + relative); if (/테스트 유저|implicit chairman|mock chairman/.test(source)) failures.push('Mock user fallback found: ' + relative); });
if (/sessionStorage|localStorage/.test(controller)) failures.push('MyPage controller must not use browser storage as identity/auth source.');
if (/회계 담당|회장|부회장|국장|부원/.test(controller)) failures.push('MyPage controller must not hard-code role permission mappings.');
if (controller.indexOf('appClient.getCurrentUser()') === -1 || controller.indexOf('appClient.getMyPermissions()') === -1) failures.push('MyPage controller must consume semantic Auth/IAM client methods.');
if (controller.indexOf('updateNotificationSettings') !== -1) failures.push('Notification mutations must not stay in MyPage controller.');
if (feature.indexOf('appClient.updateNotificationSettings') === -1) failures.push('Notification settings feature must own notification updates.');
if (appClient.indexOf("runAppApi('api_getCurrentUser'") === -1 || appClient.indexOf("runAppApi('api_getMyPermissions'") === -1) failures.push('User entity app client must own Auth/IAM API mappings.');
if (/google\.script\.run/.test(controller) || /google\.script\.run/.test(feature)) failures.push('MyPage frontend must not call GAS transport directly.');
if (controller.indexOf('permissionDetails') === -1) failures.push('MyPage must render server-provided permissionDetails.');
if (failures.length) { failures.forEach(function (failure) { console.error(failure); }); process.exitCode = 1; } else { console.log('MyPage migrated architecture verification passed.'); }
