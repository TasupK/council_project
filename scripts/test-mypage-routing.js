var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
function read_(relativePath) { return fs.readFileSync(path.join(ROOT, relativePath), 'utf8'); }
var code = read_('src/backend/app/routing/Code.js');
var header = read_('src/frontend/widgets/app_header/App_Header.html');
var shell = read_('src/frontend/app/shell/app_shell_js.html');
assert.ok(code.indexOf("mypage: 'frontend/pages/mypage/MyPage'") !== -1, 'mypage route must be registered');
assert.ok(code.indexOf("page === 'mypage'") !== -1, 'mypage must be protected by login guard');
assert.ok(header.indexOf('id="appUserCard"') !== -1);
assert.ok(/<button[^>]*id="appUserCard"/.test(header));
assert.ok(header.indexOf('id="goMy"') !== -1);
assert.ok(shell.indexOf("var goMy = getAppElement('goMy')") !== -1);
assert.ok(shell.indexOf("window.top.location.href = buildAppPageUrl('mypage')") !== -1);
assert.ok(shell.indexOf("appNavMyPage") === -1);
console.log('MyPage routing and entry-point tests passed.');
