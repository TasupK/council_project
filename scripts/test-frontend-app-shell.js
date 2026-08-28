const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = filePath => fs.readFileSync(path.join(root, filePath), 'utf8');

const header = read('src/frontend/widgets/app_header/App_Header.html');
const sidebar = read('src/frontend/widgets/app_sidebar/App_Sidebar.html');
const appStyles = read('src/frontend/shared/styles/App_Styles.html');
const shellStyles = read('src/frontend/app/styles/App_Shell_Styles.html');
const shellJs = read('src/frontend/app/shell/app_shell_js.html');

assert.match(header, /id=["']appSidebarToggle["']/);
assert.match(header, /aria-controls=["']appSidebar["']/);
assert.match(sidebar, /id=["']appSidebar["']/);
assert.match(shellStyles, /\.app\s*\{[\s\S]*height:\s*100vh/);
assert.match(shellStyles, /grid-template-rows:\s*var\(--header-h\)\s+minmax\(0,\s*1fr\)/);
assert.match(shellStyles, /\.header\s*\{/);
assert.match(shellStyles, /\.sidebar\s*\{[\s\S]*overflow-y:\s*auto/);
assert.match(shellStyles, /\.main\s*\{[\s\S]*overflow:\s*auto/);

['.app', '.header', '.body', '.sidebar', '.main', '.nav-item', '.nav-group', '.nav-submenu', '.nav-subitem', '.global-search', '.term-select', '.icon-btn', '.user-trigger', '.pop'].forEach(selector => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.doesNotMatch(appStyles, new RegExp('(^|\\})\\s*' + escaped + '\\s*\\{', 'm'), `App_Styles must not own shell selector ${selector}`);
});
assert.match(shellJs, /localStorage/);
assert.match(shellJs, /sidebar-hidden/);
assert.match(shellJs, /aria-expanded/);
assert.match(shellJs, /aria-hidden/);

const templates = [
  'src/frontend/pages/main/Main.html','src/frontend/pages/mypage/MyPage.html',
  'src/frontend/pages/settings_home/Settings_Home.html','src/frontend/pages/settings_users/Settings_Users.html','src/frontend/pages/settings_roles/Settings_Roles.html','src/frontend/pages/settings_permissions/Settings_Permissions.html','src/frontend/pages/settings_departments/Settings_Departments.html',
  'src/frontend/pages/accounting_ledger/Accounting_Ledger.html','src/frontend/pages/accounting_reconciliation/Accounting_Reconciliation.html','src/frontend/pages/accounting_settlement/Accounting_Settlement.html',
  'src/frontend/pages/student_fee_home/Student_Fee_Home.html','src/frontend/pages/student_fee_payers/Student_Fee_Payers.html','src/frontend/pages/student_fee_payments/Student_Fee_Payments.html','src/500_student_fee/530_refunds/Student_Fee_Refunds.html',
  'src/600_event/610_home/Event_Home.html','src/600_event/620_form/Event_Form.html','src/600_event/630_detail/Event_Detail.html'
];
const migrated = new Set([
  'src/frontend/pages/main/Main.html',
  'src/frontend/pages/mypage/MyPage.html',
  'src/frontend/pages/settings_home/Settings_Home.html',
  'src/frontend/pages/settings_users/Settings_Users.html',
  'src/frontend/pages/settings_roles/Settings_Roles.html',
  'src/frontend/pages/settings_permissions/Settings_Permissions.html',
  'src/frontend/pages/settings_departments/Settings_Departments.html',
  'src/frontend/pages/accounting_ledger/Accounting_Ledger.html',
  'src/frontend/pages/accounting_reconciliation/Accounting_Reconciliation.html',
  'src/frontend/pages/accounting_settlement/Accounting_Settlement.html',
  'src/frontend/pages/student_fee_home/Student_Fee_Home.html',
  'src/frontend/pages/student_fee_payers/Student_Fee_Payers.html',
  'src/frontend/pages/student_fee_payments/Student_Fee_Payments.html'
]);

templates.forEach(file => {
  const source = read(file);
  assert.doesNotMatch(source, /<footer\b[^>]*status-bar/);
  if (migrated.has(file)) {
    assert.match(source, /include\(['"]frontend\/shared\/styles\/App_Styles['"]\)/);
    assert.match(source, /include\(['"]frontend\/widgets\/app_header\/App_Header['"]\)/);
    assert.match(source, /include\(['"]frontend\/widgets\/app_sidebar\/App_Sidebar['"]\)/);
    assert.match(source, /include\(['"]frontend\/app\/styles\/App_Shell_Styles['"]\)/);
    assert.match(source, /include\(['"]frontend\/app\/shell\/app_shell_js['"]\)/);
  } else {
    assert.match(source, /include\(['"]100_common\/App_Styles['"]\)/);
    assert.match(source, /include\(['"]100_common\/App_Header['"]\)/);
    assert.match(source, /include\(['"]100_common\/App_Sidebar['"]\)/);
    assert.match(source, /include\(['"]100_common\/App_Shell_Styles['"]\)/);
    assert.match(source, /include\(['"]100_common\/app_shell_js['"]\)/);
  }
});

console.log('Frontend app shell contract: PASS');
