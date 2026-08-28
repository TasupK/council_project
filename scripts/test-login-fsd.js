const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const shellPath = 'src/frontend/pages/login/Login.html';
const viewPath = 'src/frontend/pages/login/Login_View.html';
const controllerPath = 'src/frontend/pages/login/login_controller_js.html';

[shellPath, viewPath, controllerPath].forEach(function (rel) {
  assert.ok(fs.existsSync(path.join(root, rel)), 'missing Login FSD file: ' + rel);
});
assert.ok(!fs.existsSync(path.join(root, 'src/200_login')), 'legacy src/200_login must be removed');

const shell = fs.readFileSync(path.join(root, shellPath), 'utf8');
const view = fs.readFileSync(path.join(root, viewPath), 'utf8');
const controller = fs.readFileSync(path.join(root, controllerPath), 'utf8');
const router = fs.readFileSync(path.join(root, 'src/backend/app/routing/Code.js'), 'utf8');

assert.ok(shell.includes("include('frontend/shared/styles/App_Styles')"));
assert.ok(shell.includes("include('frontend/pages/login/Login_View')"));
assert.ok(shell.includes("include('frontend/pages/login/login_controller_js')"));
assert.ok(!shell.includes('100_common/'));
assert.ok(!shell.includes('200_login/'));
assert.ok(view.includes('id="loginButton"'));
assert.ok(view.includes('id="loginAlert"'));
assert.ok(controller.includes("buildPageUrl('main')"));
assert.ok(controller.includes('LOGIN_ERROR'));
assert.ok(controller.includes("document.getElementById('loginButton')"));
assert.ok(!controller.includes('google.script.run'));
assert.ok(router.includes("login: 'frontend/pages/login/Login'"));

console.log('Login FSD migration contract: PASS');
