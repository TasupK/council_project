var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
function read_(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

var code = read_('src/000_server/Code.js');
var header = read_('src/100_common/App_Header.html');
var shell = read_('src/100_common/app_shell_js.html');

assert.ok(code.indexOf("mypage: '270_mypage/MyPage'") !== -1, 'mypage route must be registered');
assert.ok(code.indexOf("page === 'mypage'") !== -1, 'mypage must be protected by login guard');
assert.ok(header.indexOf('id="appUserCard"') !== -1, 'shared header must expose an accessible MyPage entry element');
assert.ok(/<(a|button)[^>]*id="appUserCard"/.test(header), 'MyPage entry must be an anchor or button');
assert.ok(shell.indexOf("getAppElement('appUserCard').href = buildAppPageUrl('mypage')") !== -1, 'header user card must navigate to mypage');
assert.ok(shell.indexOf("appNavMyPage") === -1, 'MyPage must not be duplicated in the sidebar navigation');

console.log('MyPage routing and entry-point tests passed.');
