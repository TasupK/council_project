var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
function read_(relativePath) { return fs.readFileSync(path.join(ROOT, relativePath), 'utf8'); }
function escapeRegex_(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function hasSelectorBlock_(source, selector) { return new RegExp('(^|\\})\\s*' + escapeRegex_(selector) + '\\s*\\{', 'm').test(source); }
function getCssVarValue_(source, token) { var match = source.match(new RegExp(escapeRegex_(token) + '\\s*:\\s*([^;]+);')); return match ? match[1].trim() : ''; }

var appStyles = read_('src/frontend/shared/styles/App_Styles.html');
var shellStyles = read_('src/frontend/app/styles/App_Shell_Styles.html');
var failures = [];
function fail_(message) { failures.push(message); }

['--ui-bg','--ui-surface','--ui-border','--ui-border-strong','--ui-text','--ui-muted','--ui-primary','--ui-primary-hover','--ui-info-bg','--ui-info-fg','--ui-success-bg','--ui-success-fg','--ui-warning-bg','--ui-warning-fg','--ui-danger-bg','--ui-danger-fg','--ui-neutral-bg','--ui-neutral-fg','--ui-radius-sm','--ui-radius-md','--ui-radius-lg','--ui-shadow','--ui-space-1','--ui-space-2','--ui-space-3','--ui-space-4','--ui-space-5','--ui-space-6','--ui-space-8'].forEach(function (token) {
  if (appStyles.indexOf(token + ':') === -1) fail_('Missing canonical UI token: ' + token);
});
['--bg','--surface','--border','--border-strong','--text','--text-2','--text-3','--text-4','--primary','--primary-hover','--active-bg','--active-text','--danger','--green','--radius','--shadow'].forEach(function (token) {
  var value = getCssVarValue_(appStyles, token);
  if (value && value.indexOf('var(--ui-') === -1) fail_('Legacy token must alias canonical UI token: ' + token + ' -> ' + value);
});

['.app','.header','.body','.sidebar','.main','.sidebar-toggle','.nav-item','.nav-group','.nav-submenu','.nav-subitem','.global-search','.term-select','.icon-btn','.user-trigger','.pop'].forEach(function (selector) {
  if (hasSelectorBlock_(appStyles, selector)) fail_('Shell selector must not be owned by App_Styles: ' + selector);
  if (!hasSelectorBlock_(shellStyles, selector)) fail_('Shell selector missing from App_Shell_Styles: ' + selector);
});
['.active','.brand','.crumb','.page','.side','.top','.shell'].forEach(function (selector) {
  if (hasSelectorBlock_(appStyles, selector) || hasSelectorBlock_(shellStyles, selector)) fail_('Unscoped shared selector is forbidden: ' + selector);
});
[['.ui-btn'],['.ui-field'],['.ui-card'],['.ui-stat-card'],['.ui-badge'],['.ui-table-wrap'],['table.ui-table'],['.ui-modal'],['.ui-tabs'],['.ui-tab'],['.ui-pagination'],['.ui-toast'],['.ui-loading','.ui-empty'],['.ui-error']].forEach(function (selectors) {
  selectors.forEach(function (selector) { if (!hasSelectorBlock_(appStyles, selector) && appStyles.indexOf(selector + ',') === -1) fail_('Missing shared UI primitive: ' + selector); });
});
['.ui-btn.primary','.ui-btn.outline','.ui-btn.ghost','.ui-btn.danger','.ui-btn.small','.ui-btn.large','.ui-badge.success','.ui-badge.warning','.ui-badge.danger','.ui-badge.info','.ui-badge.neutral'].forEach(function (selector) {
  if (appStyles.indexOf(selector) === -1) fail_('Missing shared UI modifier: ' + selector);
});
if (appStyles.indexOf(':focus-visible') === -1) fail_('Shared UI primitives require focus-visible styles');
if (shellStyles.indexOf(':focus-visible') === -1) fail_('App shell controls require focus-visible styles');
if (appStyles.indexOf('.ui-control:disabled') === -1) fail_('Shared controls require disabled styling');
if (appStyles.indexOf('aria-invalid="true"') === -1) fail_('Shared controls require invalid styling');

var SHELL_TEMPLATES = [
  'src/frontend/pages/main/Main.html','src/frontend/pages/mypage/MyPage.html',
  'src/frontend/pages/settings_home/Settings_Home.html','src/frontend/pages/settings_users/Settings_Users.html','src/frontend/pages/settings_roles/Settings_Roles.html','src/frontend/pages/settings_permissions/Settings_Permissions.html','src/frontend/pages/settings_departments/Settings_Departments.html',
  'src/400_accounting/400_home/Accounting_Home.html','src/400_accounting/410_ledger/Accounting_Ledger.html','src/400_accounting/420_reconciliation/Accounting_Reconciliation.html','src/frontend/pages/accounting_settlement/Accounting_Settlement.html',
  'src/500_student_fee/500_home/Student_Fee_Home.html','src/500_student_fee/510_payers/Student_Fee_Payers.html','src/500_student_fee/520_payments/Student_Fee_Payments.html','src/500_student_fee/530_refunds/Student_Fee_Refunds.html',
  'src/600_event/610_home/Event_Home.html','src/600_event/620_form/Event_Form.html','src/600_event/630_detail/Event_Detail.html'
];
var MIGRATED = {
  'src/frontend/pages/main/Main.html': true,
  'src/frontend/pages/mypage/MyPage.html': true,
  'src/frontend/pages/settings_home/Settings_Home.html': true,
  'src/frontend/pages/settings_users/Settings_Users.html': true,
  'src/frontend/pages/settings_roles/Settings_Roles.html': true,
  'src/frontend/pages/settings_departments/Settings_Departments.html': true,
  'src/frontend/pages/settings_permissions/Settings_Permissions.html': true,
  'src/frontend/pages/accounting_settlement/Accounting_Settlement.html': true
};
SHELL_TEMPLATES.forEach(function (file) {
  var source = read_(file);
  var stylePath = MIGRATED[file] ? 'frontend/shared/styles/App_Styles' : '100_common/App_Styles';
  var shellStylePath = MIGRATED[file] ? 'frontend/app/styles/App_Shell_Styles' : '100_common/App_Shell_Styles';
  if (source.indexOf(stylePath) === -1) fail_('App shell page missing App_Styles include: ' + file);
  if (source.indexOf(shellStylePath) === -1) fail_('App shell page missing App_Shell_Styles include: ' + file);
});

if (failures.length) { failures.forEach(function (failure) { console.error(failure); }); process.exitCode = 1; }
else console.log('UI system architecture verification passed.');
