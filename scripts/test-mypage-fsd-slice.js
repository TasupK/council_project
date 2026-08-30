const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const exists = p => fs.existsSync(path.join(root, p));
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const pageFiles = [
  'src/frontend/pages/mypage/MyPage.html',
  'src/frontend/pages/mypage/MyPage_View.html',
  'src/frontend/pages/mypage/MyPage_Styles.html',
  'src/frontend/pages/mypage/mypage_controller_js.html'
];
pageFiles.forEach(p => assert.ok(exists(p), 'missing MyPage page slice file: ' + p));

const featurePath = 'src/frontend/features/notification_settings/notification_settings_js.html';
assert.ok(exists(featurePath), 'missing notification settings feature');

const page = read('src/frontend/pages/mypage/MyPage.html');
assert.ok(page.includes("include('frontend/pages/mypage/MyPage_Styles')"));
assert.ok(page.includes("include('frontend/pages/mypage/MyPage_View')"));
assert.ok(page.includes("include('frontend/features/notification_settings/notification_settings_js')"));
assert.ok(page.includes("include('frontend/pages/mypage/mypage_controller_js')"));
assert.ok(!page.includes("include('270_mypage/"), 'migrated MyPage must not use legacy path');

const controller = read('src/frontend/pages/mypage/mypage_controller_js.html');
assert.match(controller, /function\s+initializeMyPage\s*\(/);
assert.match(controller, /appClient\.getCurrentUser\(\)/);
assert.match(controller, /appClient\.getMyPermissions\(\)/);
assert.doesNotMatch(controller, /updateNotificationSettings/);
assert.doesNotMatch(controller, /function\s+saveSettings\s*\(/);

const feature = read(featurePath);
assert.match(feature, /updateNotificationSettings/);
assert.match(feature, /function\s+saveNotificationSettings\s*\(/);
assert.doesNotMatch(feature, /getCurrentUser\(\)/);
assert.doesNotMatch(feature, /getMyPermissions\(\)/);

const router = read('src/backend/app/routing/Code.js');
assert.ok(router.includes("mypage: 'frontend/pages/mypage/MyPage'"));
assert.ok(!exists('src/270_mypage'), 'legacy MyPage slice must be removed');

console.log('MyPage FSD slice contract: PASS');
