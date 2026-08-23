var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var FRONTEND_ROOT = path.join(ROOT, 'src', '400_accounting');
var failures = [];

function read_(relativePath) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, relativePath), 'utf8');
}

var views = [
  '410_ledger/Accounting_Ledger_View.html',
  '420_reconciliation/Accounting_Reconciliation_View.html',
  '430_settlement/Accounting_Settlement_View.html'
];

views.forEach(function (file) {
  var source = read_(file);
  if (/accounting-tabs|data-accounting-page/.test(source)) {
    failures.push(file + ' must not contain internal Accounting navigation; use the sidebar only.');
  }
  if (source.indexOf('ui-page-head') < 0) failures.push(file + ' must use ui-page-head.');
  if (source.indexOf('ui-page-desc') < 0) failures.push(file + ' must use ui-page-desc.');
  if (source.indexOf('ui-btn') < 0) failures.push(file + ' must use ui-btn.');
  if (source.indexOf('ui-toast') < 0) failures.push(file + ' must use ui-toast.');
  if (/class=["'][^"']*\b(?:breadcrumb|desc)\b/.test(source)) {
    failures.push(file + ' must not keep legacy breadcrumb/desc presentation classes.');
  }
});

var ledger = read_('410_ledger/Accounting_Ledger_View.html');
['ui-stat-card', 'ui-toolbar', 'ui-table', 'ui-pagination', 'ui-modal', 'ui-badge'].forEach(function (primitive) {
  if (ledger.indexOf(primitive) < 0) failures.push('Ledger must use shared primitive: ' + primitive);
});

var reconciliation = read_('420_reconciliation/Accounting_Reconciliation_View.html');
['ui-card', 'ui-toolbar', 'ui-table'].forEach(function (primitive) {
  if (reconciliation.indexOf(primitive) < 0) failures.push('Reconciliation must use shared primitive: ' + primitive);
});

var settlement = read_('430_settlement/Accounting_Settlement_View.html');
['ui-stat-card', 'ui-card'].forEach(function (primitive) {
  if (settlement.indexOf(primitive) < 0) failures.push('Settlement must use shared primitive: ' + primitive);
});

var styles = read_('common/Accounting_Styles.html');
if (/#[0-9a-fA-F]{3,8}\b/.test(styles)) {
  failures.push('Accounting domain styles must use canonical --ui-* tokens instead of literal hex colors.');
}
if (/\.accounting-page\s+\.(?:small|badge)\b/.test(styles)) {
  failures.push('Accounting domain styles must not own button/badge primitives.');
}
if (/\.accounting-page\s+\.(?:page-head|breadcrumb|desc)\b/.test(styles)) {
  failures.push('Accounting domain styles must not own shared page-header presentation.');
}
if (/\.accounting-page\s+\.(?:match-pill|match-ok|match-check|match-bad)\b/.test(styles)) {
  failures.push('Accounting reconciliation status styling must use shared ui-badge variants.');
}

var commonJs = read_('common/accounting_common_js.html');
if (/function\s+setupAccountingPageLinks\s*\(/.test(commonJs) || /data-accounting-page/.test(commonJs)) {
  failures.push('Accounting common JS must not provide internal page-link navigation.');
}

var ledgerJs = read_('410_ledger/accounting_ledger_js.html');
var reconciliationJs = read_('420_reconciliation/accounting_reconciliation_js.html');
var settlementJs = read_('430_settlement/accounting_settlement_js.html');
var combinedJs = [ledgerJs, reconciliationJs, settlementJs].join('\n');
if (/class=["'][^"']*\b(?:badge|small)\b/.test(combinedJs)) {
  failures.push('Accounting dynamic markup must use shared ui-badge/ui-btn variants instead of legacy badge/small classes.');
}
if (/match-pill|match-ok|match-check|match-bad/.test(reconciliationJs) || reconciliationJs.indexOf('ui-badge') < 0) {
  failures.push('Accounting reconciliation dynamic statuses must use ui-badge semantic variants.');
}

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Accounting UI reference verification passed.');
}
