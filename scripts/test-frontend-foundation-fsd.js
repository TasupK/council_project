const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const exists = p => fs.existsSync(path.join(root, p));

const foundation = [
  'src/frontend/pages/access_denied/Access_Denied.html',
  'src/frontend/widgets/app_header/App_Header.html',
  'src/frontend/widgets/app_sidebar/App_Sidebar.html',
  'src/frontend/app/styles/App_Shell_Styles.html',
  'src/frontend/shared/styles/App_Styles.html',
  'src/frontend/shared/api/app_api_runner_js.html',
  'src/frontend/entities/user/api/app_client_js.html',
  'src/frontend/app/shell/app_shell_js.html'
];
foundation.forEach(p => assert.ok(exists(p), 'missing frontend foundation file: ' + p));

const expectedFoundationIncludes = [
  "include('frontend/shared/styles/App_Styles')",
  "include('frontend/app/styles/App_Shell_Styles')",
  "include('frontend/shared/api/app_api_runner_js')",
  "include('frontend/entities/user/api/app_client_js')",
  "include('frontend/widgets/app_header/App_Header')",
  "include('frontend/widgets/app_sidebar/App_Sidebar')",
  "include('frontend/app/shell/app_shell_js')"
];
function assertMigratedPage_(relativePath) {
  const source = read(relativePath);
  expectedFoundationIncludes.forEach(needle => assert.ok(source.includes(needle), relativePath + ' missing ' + needle));
  assert.ok(!source.includes("include('100_common/"), relativePath + ' must not use legacy common path');
}

const accessDenied = read('src/frontend/pages/access_denied/Access_Denied.html');
assert.ok(accessDenied.includes("include('frontend/shared/styles/App_Styles')"), 'Access Denied page must use shared styles from frontend foundation');
assert.ok(!accessDenied.includes("include('100_common/"), 'Access Denied page must not use legacy common path');

assertMigratedPage_('src/250_main/Main.html');
assertMigratedPage_('src/270_mypage/MyPage.html');

const router = read('src/backend/app/routing/Code.js');
assert.ok(router.includes("file = 'frontend/pages/access_denied/Access_Denied'"), 'router must use migrated Access Denied page');

// Migration is intentionally incremental: remaining page shells may keep 100_common
// until their own page/domain slice is moved.
assert.ok(exists('src/100_common'), 'legacy common must remain while unmigrated page shells still consume it');

console.log('Frontend FSD foundation migration contract: PASS');
