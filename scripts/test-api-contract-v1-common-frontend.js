const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
function read(relativePath) { return fs.readFileSync(path.join(root, relativePath), 'utf8'); }

const clientPath = path.join(root, 'src/100_common/app_client_js.html');
assert.ok(fs.existsSync(clientPath), 'app_client_js.html must exist');

const client = read('src/100_common/app_client_js.html');
assert.match(client, /getCurrentUser\s*:\s*function/);
assert.match(client, /runAppApi\(['"]api_getCurrentUser['"]/);
assert.match(client, /getMyPermissions\s*:\s*function/);
assert.match(client, /runAppApi\(['"]api_getMyPermissions['"]/);

const shell = read('src/100_common/app_shell_js.html');
assert.ok(!/google\.script\.run/.test(shell), 'app shell must not call google.script.run directly');
assert.match(shell, /appClient\.getCurrentUser\(\)/);

const mypage = read('src/270_mypage/mypage_js.html');
assert.ok(!/callMyPageApi_/.test(mypage), 'legacy MyPage wrapper must be removed');
assert.ok(!/google\.script\.run/.test(mypage), 'MyPage must not call google.script.run directly');
assert.match(mypage, /appClient\.getCurrentUser\(\)/);
assert.match(mypage, /appClient\.getMyPermissions\(\)/);

const authApi = read('src/backend/domains/iam/controllers/auth_controller.gs');
assert.match(authApi, /function\s+api_getCurrentUser\s*\(\)[\s\S]*?wrapApiSuccess_/);
assert.match(authApi, /function\s+api_getMyPermissions\s*\(\)[\s\S]*?wrapApiSuccess_/);

const templates = [
  'src/250_main/Main.html', 'src/270_mypage/MyPage.html',
  'src/300_settings/300_home/Settings_Home.html', 'src/300_settings/310_users/Settings_Users.html',
  'src/300_settings/320_roles/Settings_Roles.html', 'src/300_settings/330_permissions/Settings_Permissions.html',
  'src/300_settings/340_departments/Settings_Departments.html',
  'src/400_accounting/400_home/Accounting_Home.html', 'src/400_accounting/410_ledger/Accounting_Ledger.html',
  'src/400_accounting/420_reconciliation/Accounting_Reconciliation.html', 'src/400_accounting/430_settlement/Accounting_Settlement.html',
  'src/500_student_fee/500_home/Student_Fee_Home.html', 'src/500_student_fee/510_payers/Student_Fee_Payers.html',
  'src/500_student_fee/520_payments/Student_Fee_Payments.html', 'src/500_student_fee/530_refunds/Student_Fee_Refunds.html',
  'src/600_event/610_home/Event_Home.html', 'src/600_event/620_form/Event_Form.html', 'src/600_event/630_detail/Event_Detail.html'
];
templates.forEach(function (relativePath) {
  const html = read(relativePath);
  assert.ok(html.indexOf("include('100_common/app_client_js')") >= 0, relativePath + ' must include app_client_js');
});

console.log('API Contract v1 common frontend: PASS');
