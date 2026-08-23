var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var FRONTEND_ROOT = path.join(ROOT, 'src', '500_student_fee');
var failures = [];

function read_(relativePath) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, relativePath), 'utf8');
}

var VIEW_FILES = [
  '500_home/Student_Fee_Home_View.html',
  '510_payers/Student_Fee_Payers_View.html',
  '520_payments/Student_Fee_Payments_View.html',
  '530_refunds/Student_Fee_Refunds_View.html'
];

VIEW_FILES.forEach(function (file) {
  var source = read_(file);
  if (/\sstyle\s*=\s*["']/.test(source)) {
    failures.push(file + ' must not contain inline style attributes.');
  }
  if (source.indexOf('ui-page-head') < 0) {
    failures.push(file + ' must use the shared ui-page-head pattern.');
  }
  if (source.indexOf('ui-loading') < 0) {
    failures.push(file + ' must use the shared ui-loading state.');
  }
  if (source.indexOf('ui-toast') < 0) {
    failures.push(file + ' must use the shared ui-toast pattern.');
  }
});

[
  '510_payers/Student_Fee_Payers_View.html',
  '520_payments/Student_Fee_Payments_View.html',
  '530_refunds/Student_Fee_Refunds_View.html'
].forEach(function (file) {
  var source = read_(file);
  ['ui-card', 'ui-toolbar', 'ui-table-wrap', 'ui-btn'].forEach(function (primitive) {
    if (source.indexOf(primitive) < 0) {
      failures.push(file + ' must use shared primitive: ' + primitive);
    }
  });
});

var styles = read_('common/Student_Fee_Styles.html');
if (/#[0-9a-fA-F]{3,8}\b/.test(styles)) {
  failures.push('Student Fee domain styles must use canonical --ui-* tokens instead of literal hex colors.');
}
if (/^\s*\.ui-[^{,\s]+\s*\{/m.test(styles)) {
  failures.push('Student Fee domain styles must not own shared .ui-* primitives.');
}
if (styles.indexOf('.sf-table-toolbar') < 0) {
  failures.push('Student Fee domain styles must provide sf-table-toolbar for list-page spacing.');
}

var homeJs = read_('500_home/student_fee_home_js.html');
['ui-card', 'ui-stat-card', 'ui-stat-grid'].forEach(function (primitive) {
  if (homeJs.indexOf(primitive) < 0) failures.push('Student Fee home must render shared primitive: ' + primitive);
});

var payerJs = read_('510_payers/student_fee_payers_js.html');
var paymentJs = read_('520_payments/student_fee_payments_js.html');
var refundJs = read_('530_refunds/student_fee_refunds_js.html');
[payerJs, paymentJs, refundJs].forEach(function (source, index) {
  if (source.indexOf('ui-table') < 0) failures.push('Student Fee list renderer ' + index + ' must render ui-table.');
});

var commonJs = read_('common/student_fee_common_js.html');
if (commonJs.indexOf('ui-badge') < 0) failures.push('Student Fee status helper must render ui-badge.');
if (commonJs.indexOf('ui-pagination') < 0 || commonJs.indexOf('ui-page-btn') < 0) {
  failures.push('Student Fee pagination helper must use shared pagination primitives.');
}

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Student Fee UI reference verification passed.');
}
