var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var FRONTEND_ROOT = path.join(ROOT, 'src', '500_student_fee');
var failures = [];

var REQUIRED_FILES = [
  'common/Student_Fee_Styles.html',
  'common/student_fee_common_js.html',
  '500_home/Student_Fee_Home.html',
  '500_home/Student_Fee_Home_View.html',
  '500_home/student_fee_home_js.html',
  '510_payers/Student_Fee_Payers.html',
  '510_payers/Student_Fee_Payers_View.html',
  '510_payers/modals/Student_Fee_Payer_Edit_Modal.html',
  '510_payers/student_fee_payers_js.html',
  '520_payments/Student_Fee_Payments.html',
  '520_payments/Student_Fee_Payments_View.html',
  '520_payments/modals/Student_Fee_Payment_Detail_Modal.html',
  '520_payments/modals/Student_Fee_Payment_Confirm_Modal.html',
  '520_payments/student_fee_payments_js.html',
  '530_refunds/Student_Fee_Refunds.html',
  '530_refunds/Student_Fee_Refunds_View.html',
  '530_refunds/modals/Student_Fee_Refund_Detail_Modal.html',
  '530_refunds/modals/Student_Fee_Refund_Approval_Modal.html',
  '530_refunds/modals/Student_Fee_Refund_Transfer_Modal.html',
  '530_refunds/student_fee_refunds_js.html'
];

var PAGE_SHELLS = [
  '500_home/Student_Fee_Home.html',
  '510_payers/Student_Fee_Payers.html',
  '520_payments/Student_Fee_Payments.html',
  '530_refunds/Student_Fee_Refunds.html'
];

var PAGE_JS_ALLOWLIST = {
  '500_home/student_fee_home_js.html': ['api_getStudentFeeSummary'],
  '510_payers/student_fee_payers_js.html': [
    'api_getStudentFeeReference', 'api_getStudentFeePayers', 'api_getStudentFeePayer', 'api_createStudentFeePayer', 'api_updateStudentFeePayer'
  ],
  '520_payments/student_fee_payments_js.html': [
    'api_getStudentFeeApplications', 'api_getStudentFeeApplication', 'api_processStudentFeeApplications', 'api_calculateStudentFeeAmount', 'api_confirmStudentFeePayment'
  ],
  '530_refunds/student_fee_refunds_js.html': [
    'api_getStudentFeeRefundRequests', 'api_getStudentFeeRefundRequest', 'api_processStudentFeeRefundRequests', 'api_calculateStudentFeeRefund', 'api_confirmStudentFeeRefund'
  ]
};

function readRoot_(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readFrontend_(relativePath) {
  return fs.readFileSync(path.join(FRONTEND_ROOT, relativePath), 'utf8');
}

function existsFrontend_(relativePath) {
  return fs.existsSync(path.join(FRONTEND_ROOT, relativePath));
}

REQUIRED_FILES.forEach(function (file) {
  if (!existsFrontend_(file)) failures.push('Missing Student Fee frontend file: ' + file);
});

var code = readRoot_('src/backend/app/routing/Code.js');
var routes = {
  student_fee: '500_student_fee/500_home/Student_Fee_Home',
  student_fee_payers: '500_student_fee/510_payers/Student_Fee_Payers',
  student_fee_payments: '500_student_fee/520_payments/Student_Fee_Payments',
  student_fee_refunds: '500_student_fee/530_refunds/Student_Fee_Refunds'
};
Object.keys(routes).forEach(function (route) {
  var pattern = new RegExp('\\b' + route + '\\s*:\\s*[\'\"]' + routes[route].replace(/\//g, '\\/') + '[\'\"]');
  if (!pattern.test(code)) failures.push('Missing Student Fee route: ' + route);
});
if (!/page\.indexOf\(['\"]student_fee['\"]\)\s*===\s*0/.test(code)) {
  failures.push('Student Fee route prefix is not login protected.');
}

var sidebar = readRoot_('src/100_common/App_Sidebar.html');
['appNavStudentFee', 'appStudentFeeSubmenu', 'appNavStudentFeeHome', 'appNavStudentFeePayers', 'appNavStudentFeePayments', 'appNavStudentFeeRefunds'].forEach(function (id) {
  if (sidebar.indexOf('id="' + id + '"') < 0) failures.push('Missing sidebar navigation element: ' + id);
});

var shellJs = readRoot_('src/100_common/app_shell_js.html');
if (shellJs.indexOf('student_fee') < 0 || shellJs.indexOf('appNavStudentFee') < 0 || shellJs.indexOf('setStudentFeeSubmenuExpanded_') < 0) {
  failures.push('Student Fee navigation active/expand logic missing from shell JS.');
}

PAGE_SHELLS.forEach(function (file) {
  if (!existsFrontend_(file)) return;
  var source = readFrontend_(file);
  [
    "include('100_common/App_Styles')",
    "include('100_common/App_Header')",
    "include('100_common/App_Sidebar')",
    "include('500_student_fee/common/Student_Fee_Styles')",
    "include('100_common/app_shell_js')",
    "include('500_student_fee/common/student_fee_common_js')"
  ].forEach(function (needle) {
    if (source.indexOf(needle) < 0) failures.push(file + ' missing include: ' + needle);
  });
});

Object.keys(PAGE_JS_ALLOWLIST).forEach(function (file) {
  if (!existsFrontend_(file)) return;
  var source = readFrontend_(file);
  var matches = source.match(/api_[A-Za-z0-9_]+/g) || [];
  var unique = matches.filter(function (name, index) { return matches.indexOf(name) === index; });
  unique.forEach(function (name) {
    if (PAGE_JS_ALLOWLIST[file].indexOf(name) < 0) failures.push(file + ' calls unapproved API: ' + name);
  });
});

if (existsFrontend_('common/student_fee_common_js.html')) {
  var commonJs = readFrontend_('common/student_fee_common_js.html');
  if (/api_get|api_create|api_update|api_process|api_calculate|api_confirm/.test(commonJs)) {
    failures.push('Student Fee common JS must remain generic and not hard-code domain API names.');
  }
  if (commonJs.indexOf('studentFeeRunBusy') < 0 || commonJs.indexOf('studentFeeSetBusy') < 0) {
    failures.push('Student Fee common JS must provide busy helpers.');
  }
}

if (fs.existsSync(FRONTEND_ROOT)) {
  var combined = REQUIRED_FILES.filter(existsFrontend_).map(readFrontend_).join('\n');
  [
    ['apiV1_', 'Legacy apiV1_ found'],
    ['hasFullAccess', 'Client-controlled hasFullAccess found'],
    ['FormApp', 'FormApp found in frontend'],
    ['newTrigger', 'Trigger creation found in frontend'],
    ['적용종료학기', 'Forbidden feature-only field found: 적용종료학기'],
    ['보관여부', 'Forbidden feature-only field found: 보관여부']
  ].forEach(function (entry) {
    if (combined.indexOf(entry[0]) >= 0) failures.push(entry[1]);
  });
  if (/name=[\'\"]유형[\'\"]|>\s*유형\s*</.test(combined)) failures.push('Forbidden feature-only UI field found: 유형');
  if (/class=[\'\"][^\'\"]*(topbar|standalone-sidebar|shell-copy)/.test(combined)) failures.push('Copied standalone shell markup found.');
}

[
  ['510_payers/modals/Student_Fee_Payer_Edit_Modal.html', /ui-modal-overlay/i, 'Payer modal structure missing'],
  ['520_payments/Student_Fee_Payments_View.html', /bulk/i, 'Payment bulk action structure missing'],
  ['520_payments/modals/Student_Fee_Payment_Detail_Modal.html', /ui-modal-overlay/i, 'Payment detail modal structure missing'],
  ['520_payments/modals/Student_Fee_Payment_Confirm_Modal.html', /ui-modal-overlay/i, 'Payment confirm modal structure missing'],
  ['530_refunds/Student_Fee_Refunds_View.html', /bulk/i, 'Refund bulk action structure missing'],
  ['530_refunds/modals/Student_Fee_Refund_Detail_Modal.html', /ui-modal-overlay/i, 'Refund detail modal structure missing'],
  ['530_refunds/modals/Student_Fee_Refund_Approval_Modal.html', /ui-modal-overlay/i, 'Refund approval modal structure missing'],
  ['530_refunds/modals/Student_Fee_Refund_Transfer_Modal.html', /ui-modal-overlay/i, 'Refund transfer modal structure missing']
].forEach(function (rule) {
  if (existsFrontend_(rule[0]) && !rule[1].test(readFrontend_(rule[0]))) failures.push(rule[2]);
});

['510_payers/student_fee_payers_js.html', '520_payments/student_fee_payments_js.html', '530_refunds/student_fee_refunds_js.html'].forEach(function (file) {
  if (!existsFrontend_(file)) return;
  var source = readFrontend_(file);
  if (!/studentFeeRunBusy\s*\(/.test(source)) failures.push(file + ' missing busy/double-submit protection');
});

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Student Fee frontend architecture verification passed.');
}
