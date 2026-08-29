const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
function read(relativePath) { return fs.readFileSync(path.join(root, relativePath), 'utf8'); }

const clientPath = path.join(root, 'src/frontend/entities/user/api/app_client_js.html');
assert.ok(fs.existsSync(clientPath), 'migrated app_client_js.html must exist');

const client = read('src/frontend/entities/user/api/app_client_js.html');
assert.match(client, /getCurrentUser\s*:\s*function/);
assert.match(client, /runAppApi\(['"]api_getCurrentUser['"]/);
assert.match(client, /getMyPermissions\s*:\s*function/);
assert.match(client, /runAppApi\(['"]api_getMyPermissions['"]/);

const shell = read('src/frontend/app/shell/app_shell_js.html');
assert.ok(!/google\.script\.run/.test(shell), 'app shell must not call google.script.run directly');
assert.match(shell, /appClient\.getCurrentUser\(\)/);

const mypageController = read('src/frontend/pages/mypage/mypage_controller_js.html');
const notificationFeature = read('src/frontend/features/notification_settings/notification_settings_js.html');
assert.ok(!/callMyPageApi_/.test(mypageController), 'legacy MyPage wrapper must be removed');
assert.ok(!/google\.script\.run/.test(mypageController), 'MyPage controller must not call google.script.run directly');
assert.ok(!/google\.script\.run/.test(notificationFeature), 'notification feature must not call google.script.run directly');
assert.match(mypageController, /appClient\.getCurrentUser\(\)/);
assert.match(mypageController, /appClient\.getMyPermissions\(\)/);
assert.match(notificationFeature, /appClient\.updateNotificationSettings\(/);

const authApi = read('src/backend/domains/iam/controllers/auth_controller.gs');
assert.match(authApi, /function\s+api_getCurrentUser\s*\(\)[\s\S]*?wrapApiSuccess_/);
assert.match(authApi, /function\s+api_getMyPermissions\s*\(\)[\s\S]*?wrapApiSuccess_/);

const migrated = new Set([
  'src/frontend/pages/main/Main.html','src/frontend/pages/mypage/MyPage.html',
  'src/frontend/pages/settings_home/Settings_Home.html','src/frontend/pages/settings_users/Settings_Users.html',
  'src/frontend/pages/settings_roles/Settings_Roles.html','src/frontend/pages/settings_permissions/Settings_Permissions.html','src/frontend/pages/settings_departments/Settings_Departments.html',
  'src/frontend/pages/accounting_ledger/Accounting_Ledger.html','src/frontend/pages/accounting_reconciliation/Accounting_Reconciliation.html','src/frontend/pages/accounting_settlement/Accounting_Settlement.html',
  'src/frontend/pages/student_fee_home/Student_Fee_Home.html','src/frontend/pages/student_fee_payers/Student_Fee_Payers.html','src/frontend/pages/student_fee_payments/Student_Fee_Payments.html','src/frontend/pages/student_fee_refunds/Student_Fee_Refunds.html',
  'src/frontend/pages/event_home/Event_Home.html','src/frontend/pages/event_form/Event_Form.html'
]);
const templates = [
  'src/frontend/pages/main/Main.html', 'src/frontend/pages/mypage/MyPage.html',
  'src/frontend/pages/settings_home/Settings_Home.html', 'src/frontend/pages/settings_users/Settings_Users.html',
  'src/frontend/pages/settings_roles/Settings_Roles.html', 'src/frontend/pages/settings_permissions/Settings_Permissions.html',
  'src/frontend/pages/settings_departments/Settings_Departments.html',
  'src/frontend/pages/accounting_ledger/Accounting_Ledger.html',
  'src/frontend/pages/accounting_reconciliation/Accounting_Reconciliation.html', 'src/frontend/pages/accounting_settlement/Accounting_Settlement.html',
  'src/frontend/pages/student_fee_home/Student_Fee_Home.html', 'src/frontend/pages/student_fee_payers/Student_Fee_Payers.html',
  'src/frontend/pages/student_fee_payments/Student_Fee_Payments.html', 'src/frontend/pages/student_fee_refunds/Student_Fee_Refunds.html',
  'src/frontend/pages/event_home/Event_Home.html', 'src/frontend/pages/event_form/Event_Form.html', 'src/600_event/630_detail/Event_Detail.html'
];
templates.forEach(function (relativePath) {
  const html = read(relativePath);
  const expected = migrated.has(relativePath)
    ? "include('frontend/entities/user/api/app_client_js')"
    : "include('100_common/app_client_js')";
  assert.ok(html.indexOf(expected) >= 0, relativePath + ' must include expected app client path');
});

console.log('API Contract v1 common frontend: PASS');
