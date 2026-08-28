var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var FRONTEND_ROOT = path.join(ROOT, 'src', '500_student_fee');
var failures = [];

var REQUIRED_LEGACY_FILES = [
  'common/Student_Fee_Styles.html',
  'common/student_fee_common_js.html',
  'common/student_fee_client_js.html',
  '530_refunds/Student_Fee_Refunds.html',
  '530_refunds/Student_Fee_Refunds_View.html',
  '530_refunds/modals/Student_Fee_Refund_Detail_Modal.html',
  '530_refunds/modals/Student_Fee_Refund_Approval_Modal.html',
  '530_refunds/modals/Student_Fee_Refund_Transfer_Modal.html',
  '530_refunds/student_fee_refunds_js.html'
];
var REQUIRED_FSD_FILES = [
  'src/frontend/pages/student_fee_home/Student_Fee_Home.html',
  'src/frontend/pages/student_fee_home/Student_Fee_Home_View.html',
  'src/frontend/pages/student_fee_home/student_fee_home_controller_js.html',
  'src/frontend/pages/student_fee_payers/Student_Fee_Payers.html',
  'src/frontend/pages/student_fee_payers/Student_Fee_Payers_View.html',
  'src/frontend/pages/student_fee_payers/modals/Student_Fee_Payer_Edit_Modal.html',
  'src/frontend/pages/student_fee_payers/student_fee_payers_controller_js.html',
  'src/frontend/features/student_fee_payer_manage/student_fee_payer_manage_js.html',
  'src/frontend/entities/student_fee_payer/api/student_fee_payer_client_js.html',
  'src/frontend/pages/student_fee_payments/Student_Fee_Payments.html',
  'src/frontend/pages/student_fee_payments/Student_Fee_Payments_View.html',
  'src/frontend/pages/student_fee_payments/modals/Student_Fee_Payment_Detail_Modal.html',
  'src/frontend/pages/student_fee_payments/modals/Student_Fee_Payment_Confirm_Modal.html',
  'src/frontend/pages/student_fee_payments/student_fee_payments_controller_js.html',
  'src/frontend/features/student_fee_payment_manage/student_fee_payment_manage_js.html',
  'src/frontend/entities/student_fee_payment/api/student_fee_payment_client_js.html'
];

var LEGACY_PAGE_SHELLS = ['530_refunds/Student_Fee_Refunds.html'];
var PAGE_JS_ALLOWLIST = {
  '530_refunds/student_fee_refunds_js.html': [
    'api_getStudentFeeRefundRequests', 'api_getStudentFeeRefundRequest', 'api_processStudentFeeRefundRequests', 'api_calculateStudentFeeRefund', 'api_confirmStudentFeeRefund'
  ]
};

function readRoot_(relativePath) { return fs.readFileSync(path.join(ROOT, relativePath), 'utf8'); }
function readFrontend_(relativePath) { return fs.readFileSync(path.join(FRONTEND_ROOT, relativePath), 'utf8'); }
function existsFrontend_(relativePath) { return fs.existsSync(path.join(FRONTEND_ROOT, relativePath)); }

REQUIRED_LEGACY_FILES.forEach(function (file) {
  if (!existsFrontend_(file)) failures.push('Missing Student Fee frontend file: ' + file);
});
REQUIRED_FSD_FILES.forEach(function (file) {
  if (!fs.existsSync(path.join(ROOT, file))) failures.push('Missing Student Fee FSD file: ' + file);
});
['500_home', '510_payers', '520_payments'].forEach(function (legacySlice) {
  if (fs.existsSync(path.join(FRONTEND_ROOT, legacySlice))) failures.push('Legacy Student Fee slice must be removed: ' + legacySlice);
});

var code = readRoot_('src/backend/app/routing/Code.js');
var routes = {
  student_fee: 'frontend/pages/student_fee_home/Student_Fee_Home',
  student_fee_payers: 'frontend/pages/student_fee_payers/Student_Fee_Payers',
  student_fee_payments: 'frontend/pages/student_fee_payments/Student_Fee_Payments',
  student_fee_refunds: '500_student_fee/530_refunds/Student_Fee_Refunds'
};
Object.keys(routes).forEach(function (route) {
  var pattern = new RegExp('\\b' + route + '\\s*:\\s*[\'\"]' + routes[route].replace(/\//g, '\\/') + '[\'\"]');
  if (!pattern.test(code)) failures.push('Missing Student Fee route: ' + route);
});
if (!/page\.indexOf\(['\"]student_fee['\"]\)\s*===\s*0/.test(code)) failures.push('Student Fee route prefix is not login protected.');

var sidebar = readRoot_('src/frontend/widgets/app_sidebar/App_Sidebar.html');
['appNavStudentFee', 'appStudentFeeSubmenu', 'appNavStudentFeeHome', 'appNavStudentFeePayers', 'appNavStudentFeePayments', 'appNavStudentFeeRefunds'].forEach(function (id) {
  if (sidebar.indexOf('id="' + id + '"') < 0) failures.push('Missing sidebar navigation element: ' + id);
});
var shellJs = readRoot_('src/frontend/app/shell/app_shell_js.html');
if (shellJs.indexOf('student_fee') < 0 || shellJs.indexOf('appNavStudentFee') < 0 || shellJs.indexOf('setStudentFeeSubmenuExpanded_') < 0) failures.push('Student Fee navigation active/expand logic missing from shell JS.');

[
  ['src/frontend/pages/student_fee_home/Student_Fee_Home.html', null],
  ['src/frontend/pages/student_fee_payers/Student_Fee_Payers.html', "include('frontend/entities/student_fee_payer/api/student_fee_payer_client_js')"],
  ['src/frontend/pages/student_fee_payments/Student_Fee_Payments.html', "include('frontend/entities/student_fee_payment/api/student_fee_payment_client_js')"]
].forEach(function (entry) {
  var source = readRoot_(entry[0]);
  [
    "include('frontend/shared/styles/App_Styles')",
    "include('frontend/widgets/app_header/App_Header')",
    "include('frontend/widgets/app_sidebar/App_Sidebar')",
    "include('500_student_fee/common/Student_Fee_Styles')",
    "include('frontend/app/shell/app_shell_js')",
    "include('500_student_fee/common/student_fee_common_js')"
  ].forEach(function (needle) {
    if (source.indexOf(needle) < 0) failures.push(entry[0] + ' missing include: ' + needle);
  });
  if (entry[1] && source.indexOf(entry[1]) < 0) failures.push(entry[0] + ' missing include: ' + entry[1]);
});

LEGACY_PAGE_SHELLS.forEach(function (file) {
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

var homeController = readRoot_('src/frontend/pages/student_fee_home/student_fee_home_controller_js.html');
if (/['"]api_[A-Za-z0-9_]+['"]/.test(homeController)) failures.push('Student Fee Home controller must not own raw server API names.');
if (homeController.indexOf('studentFeeClient.getSummary()') < 0) failures.push('Student Fee Home controller must use semantic summary client.');

var payerFeature = readRoot_('src/frontend/features/student_fee_payer_manage/student_fee_payer_manage_js.html');
var payerClient = readRoot_('src/frontend/entities/student_fee_payer/api/student_fee_payer_client_js.html');
if (/['"]api_[A-Za-z0-9_]+['"]/.test(payerFeature)) failures.push('Student Fee Payers feature must not own raw server API names.');
['getReference', 'getPayers', 'getPayer', 'createPayer', 'updatePayer'].forEach(function (method) {
  if (payerFeature.indexOf('studentFeePayerClient.' + method) < 0) failures.push('Student Fee Payers feature missing semantic client method: ' + method);
});
['api_getStudentFeeReference', 'api_getStudentFeePayers', 'api_getStudentFeePayer', 'api_createStudentFeePayer', 'api_updateStudentFeePayer'].forEach(function (apiName) {
  if (payerClient.indexOf(apiName) < 0) failures.push('Student Fee Payer client missing API mapping: ' + apiName);
});

var paymentFeature = readRoot_('src/frontend/features/student_fee_payment_manage/student_fee_payment_manage_js.html');
var paymentClient = readRoot_('src/frontend/entities/student_fee_payment/api/student_fee_payment_client_js.html');
if (/['"]api_[A-Za-z0-9_]+['"]/.test(paymentFeature)) failures.push('Student Fee Payments feature must not own raw server API names.');
['getApplications', 'getApplication', 'calculateAmount', 'processApplications', 'confirmPayment'].forEach(function (method) {
  if (paymentFeature.indexOf('studentFeePaymentClient.' + method) < 0) failures.push('Student Fee Payments feature missing semantic client method: ' + method);
});
['api_getStudentFeeApplications', 'api_getStudentFeeApplication', 'api_calculateStudentFeeAmount', 'api_processStudentFeeApplications', 'api_confirmStudentFeePayment'].forEach(function (apiName) {
  if (paymentClient.indexOf(apiName) < 0) failures.push('Student Fee Payment client missing API mapping: ' + apiName);
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
  if (/api_get|api_create|api_update|api_process|api_calculate|api_confirm/.test(commonJs)) failures.push('Student Fee common JS must remain generic and not hard-code domain API names.');
  if (commonJs.indexOf('studentFeeRunBusy') < 0 || commonJs.indexOf('studentFeeSetBusy') < 0) failures.push('Student Fee common JS must provide busy helpers.');
}

var combined = REQUIRED_LEGACY_FILES.filter(existsFrontend_).map(readFrontend_).concat(REQUIRED_FSD_FILES.map(readRoot_)).join('\n');
[
  ['apiV1_', 'Legacy apiV1_ found'],
  ['hasFullAccess', 'Client-controlled hasFullAccess found'],
  ['FormApp', 'FormApp found in frontend'],
  ['newTrigger', 'Trigger creation found in frontend'],
  ['적용종료학기', 'Forbidden feature-only field found: 적용종료학기'],
  ['보관여부', 'Forbidden feature-only field found: 보관여부']
].forEach(function (entry) { if (combined.indexOf(entry[0]) >= 0) failures.push(entry[1]); });
if (/name=[\'\"]유형[\'\"]|>\s*유형\s*</.test(combined)) failures.push('Forbidden feature-only UI field found: 유형');
if (/class=[\'\"][^\'\"]*(topbar|standalone-sidebar|shell-copy)/.test(combined)) failures.push('Copied standalone shell markup found.');

[
  ['src/frontend/pages/student_fee_payers/modals/Student_Fee_Payer_Edit_Modal.html', /ui-modal-overlay/i, 'Payer modal structure missing'],
  ['src/frontend/pages/student_fee_payments/Student_Fee_Payments_View.html', /bulk/i, 'Payment bulk action structure missing'],
  ['src/frontend/pages/student_fee_payments/modals/Student_Fee_Payment_Detail_Modal.html', /ui-modal-overlay/i, 'Payment detail modal structure missing'],
  ['src/frontend/pages/student_fee_payments/modals/Student_Fee_Payment_Confirm_Modal.html', /ui-modal-overlay/i, 'Payment confirm modal structure missing'],
  ['530_refunds/Student_Fee_Refunds_View.html', /bulk/i, 'Refund bulk action structure missing'],
  ['530_refunds/modals/Student_Fee_Refund_Detail_Modal.html', /ui-modal-overlay/i, 'Refund detail modal structure missing'],
  ['530_refunds/modals/Student_Fee_Refund_Approval_Modal.html', /ui-modal-overlay/i, 'Refund approval modal structure missing'],
  ['530_refunds/modals/Student_Fee_Refund_Transfer_Modal.html', /ui-modal-overlay/i, 'Refund transfer modal structure missing']
].forEach(function (rule) {
  var isRoot = rule[0].indexOf('src/') === 0;
  var exists = isRoot ? fs.existsSync(path.join(ROOT, rule[0])) : existsFrontend_(rule[0]);
  if (!exists) return;
  var source = isRoot ? readRoot_(rule[0]) : readFrontend_(rule[0]);
  if (!rule[1].test(source)) failures.push(rule[2]);
});

if (!/studentFeeRunBusy\s*\(/.test(payerFeature)) failures.push('Student Fee Payers feature missing busy/double-submit protection');
if (!/studentFeeRunBusy\s*\(/.test(paymentFeature)) failures.push('Student Fee Payments feature missing busy/double-submit protection');
['530_refunds/student_fee_refunds_js.html'].forEach(function (file) {
  if (!existsFrontend_(file)) return;
  if (!/studentFeeRunBusy\s*\(/.test(readFrontend_(file))) failures.push(file + ' missing busy/double-submit protection');
});

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Student Fee frontend architecture verification passed.');
}
