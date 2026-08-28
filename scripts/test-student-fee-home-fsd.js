const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pageRoot = path.join(root, 'src/frontend/pages/student_fee_home');
const shellPath = path.join(pageRoot, 'Student_Fee_Home.html');
const viewPath = path.join(pageRoot, 'Student_Fee_Home_View.html');
const controllerPath = path.join(pageRoot, 'student_fee_home_controller_js.html');
const legacyRoot = path.join(root, 'src/500_student_fee/500_home');

[shellPath, viewPath, controllerPath].forEach(function (file) {
  assert.ok(fs.existsSync(file), 'missing Student Fee Home FSD file: ' + path.relative(root, file));
});
assert.ok(!fs.existsSync(legacyRoot), 'legacy Student Fee Home slice must be removed');

const shell = fs.readFileSync(shellPath, 'utf8');
const controller = fs.readFileSync(controllerPath, 'utf8');
const router = fs.readFileSync(path.join(root, 'src/backend/app/routing/Code.js'), 'utf8');

[
  "include('frontend/shared/styles/App_Styles')",
  "include('frontend/app/styles/App_Shell_Styles')",
  "include('frontend/shared/api/app_api_runner_js')",
  "include('frontend/entities/user/api/app_client_js')",
  "include('frontend/widgets/app_header/App_Header')",
  "include('frontend/widgets/app_sidebar/App_Sidebar')",
  "include('frontend/app/shell/app_shell_js')",
  "include('frontend/pages/student_fee_home/Student_Fee_Home_View')",
  "include('frontend/pages/student_fee_home/student_fee_home_controller_js')"
].forEach(function (expected) {
  assert.ok(shell.includes(expected), 'Student Fee Home shell missing FSD include: ' + expected);
});
assert.ok(controller.includes('studentFeeClient.getSummary()'), 'Student Fee Home controller must load summary through semantic client');
assert.ok(!controller.includes('google.script.run'), 'Student Fee Home controller must not call GAS directly');
assert.ok(router.includes("student_fee: 'frontend/pages/student_fee_home/Student_Fee_Home'"), 'Student Fee Home route must point at FSD page');

console.log('Student Fee Home FSD migration contract: PASS');
