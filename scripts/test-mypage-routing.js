var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
function read_(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

var code = read_('src/backend/app/routing/Code.js');
var header = read_('src/100_common/App_Header.html');
var shell = read_('src/100_common/app_shell_js.html');

assert.ok(code.indexOf("mypage: '270_mypage/MyPage'") !== -1, 'mypage route must be registered');
assert.ok(code.indexOf("page === 'mypage'") !== -1, 'mypage must be protected by login guard');
assert.ok(header.indexOf('id="appUserCard"') !== -1, 'shared header must expose an accessible profile entry element');
assert.ok(/<button[^>]*id="appUserCard"/.test(header), 'profile entry must be a button that opens the profile popup');
assert.ok(header.indexOf('id="goMy"') !== -1, 'profile popup must expose a MyPage navigation action');
assert.ok(shell.indexOf("var goMy = getAppElement('goMy')") !== -1, 'profile popup MyPage action must be wired');
assert.ok(shell.indexOf("window.top.location.href = buildAppPageUrl('mypage')") !== -1, 'profile popup MyPage action must navigate to mypage');
assert.ok(shell.indexOf("appNavMyPage") === -1, 'MyPage must not be duplicated in the sidebar navigation');

console.log('MyPage routing and entry-point tests passed.');
