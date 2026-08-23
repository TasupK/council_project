const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = filePath => fs.readFileSync(path.join(root, filePath), 'utf8');

const header = read('src/100_common/App_Header.html');
const sidebar = read('src/100_common/App_Sidebar.html');
const shellStyles = read('src/100_common/App_Shell_Styles.html');
const shellJs = read('src/100_common/app_shell_js.html');

assert.match(header, /id=["']appSidebarToggle["']/);
assert.match(header, /aria-controls=["']appSidebar["']/);
assert.match(sidebar, /id=["']appSidebar["']/);
assert.match(shellStyles, /\.app\s*\{[\s\S]*height:\s*100vh/);
assert.match(shellStyles, /grid-template-rows:\s*var\(--header-h\)\s+minmax\(0,\s*1fr\)/);
assert.match(shellStyles, /\.main\s*\{[\s\S]*overflow:\s*auto/);
assert.match(shellStyles, /\.sidebar\s*\{[\s\S]*overflow-y:\s*auto/);
assert.match(shellStyles, /\.app\.sidebar-hidden\s+\.body/);
assert.match(shellStyles, /body\.app-mode\s*\{[\s\S]*overflow:\s*hidden/);
assert.match(shellJs, /localStorage/);
assert.match(shellJs, /sidebar-hidden/);
assert.match(shellJs, /aria-expanded/);
assert.match(shellJs, /aria-hidden/);

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
  'src/600_event/600_home/Event_Home.html',
  'src/600_event/610_form/Event_Form.html',
  'src/600_event/620_detail/Event_Detail.html'
];

templates.forEach(file => {
  const source = read(file);
  assert.doesNotMatch(source, /<footer\b[^>]*status-bar/);
  assert.match(source, /include\(['"]100_common\/App_Header['"]\)/);
  assert.match(source, /include\(['"]100_common\/App_Sidebar['"]\)/);
  assert.match(source, /include\(['"]100_common\/App_Shell_Styles['"]\)/);
  assert.match(source, /include\(['"]100_common\/app_shell_js['"]\)/);
});

console.log('Frontend app shell contract: PASS');
