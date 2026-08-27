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

const templates = [
  'src/250_main/Main.html',
  'src/270_mypage/MyPage.html',
  'src/300_settings/300_home/Settings_Home.html',
  'src/300_settings/310_users/Settings_Users.html',
  'src/300_settings/320_roles/Settings_Roles.html',
  'src/300_settings/330_permissions/Settings_Permissions.html',
  'src/300_settings/340_departments/Settings_Departments.html',
  'src/400_accounting/400_home/Accounting_Home.html',
  'src/400_accounting/410_ledger/Accounting_Ledger.html',
  'src/400_accounting/420_reconciliation/Accounting_Reconciliation.html',
  'src/400_accounting/430_settlement/Accounting_Settlement.html',
  'src/500_student_fee/500_home/Student_Fee_Home.html',
  'src/500_student_fee/510_payers/Student_Fee_Payers.html',
  'src/500_student_fee/520_payments/Student_Fee_Payments.html',
  'src/500_student_fee/530_refunds/Student_Fee_Refunds.html',
  'src/600_event/610_home/Event_Home.html',
  'src/600_event/620_form/Event_Form.html',
  'src/600_event/630_detail/Event_Detail.html'
];

const expectedIncludes = [
  "include('frontend/shared/styles/App_Styles')",
  "include('frontend/widgets/app_header/App_Header')",
  "include('frontend/widgets/app_sidebar/App_Sidebar')",
  "include('frontend/app/styles/App_Shell_Styles')",
  "include('frontend/shared/api/app_api_runner_js')",
  "include('frontend/entities/user/api/app_client_js')",
  "include('frontend/app/shell/app_shell_js')"
];

templates.forEach(p => {
  const source = read(p);
  expectedIncludes.forEach(needle => assert.ok(source.includes(needle), p + ' missing ' + needle));
  assert.ok(!source.includes("include('100_common/"), p + ' still includes legacy 100_common partial');
});

assert.ok(!exists('src/100_common'), 'legacy src/100_common directory must be removed');
console.log('Frontend FSD foundation migration contract: PASS');
