var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var FRONTEND_ROOT = path.join(ROOT, 'src', '500_student_fee');
var failures = [];

function target_(relativePath) {
  return relativePath.indexOf('src/') === 0 ? path.join(ROOT, relativePath) : path.join(FRONTEND_ROOT, relativePath);
}
function readAny_(relativePath) { return fs.readFileSync(target_(relativePath), 'utf8'); }
function readOptionalAny_(relativePath) { var target = target_(relativePath); return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : ''; }
function includePath_(relativePath) {
  return relativePath.indexOf('src/') === 0
    ? relativePath.replace(/^src\//, '').replace(/\.html$/, '')
    : '500_student_fee/' + relativePath.replace(/\.html$/, '');
}

var VIEW_FILES = [
  'src/frontend/pages/student_fee_home/Student_Fee_Home_View.html',
  'src/frontend/pages/student_fee_payers/Student_Fee_Payers_View.html',
  'src/frontend/pages/student_fee_payments/Student_Fee_Payments_View.html',
  '530_refunds/Student_Fee_Refunds_View.html'
];

VIEW_FILES.forEach(function (file) {
  var source = readAny_(file);
  if (/\sstyle\s*=\s*["']/.test(source)) failures.push(file + ' must not contain inline style attributes.');
  if (source.indexOf('ui-page-head') < 0) failures.push(file + ' must use the shared ui-page-head pattern.');
  if (source.indexOf('ui-loading') < 0) failures.push(file + ' must use the shared ui-loading state.');
  if (source.indexOf('ui-toast') < 0) failures.push(file + ' must use the shared ui-toast pattern.');
});

[
  'src/frontend/pages/student_fee_payers/Student_Fee_Payers_View.html',
  'src/frontend/pages/student_fee_payments/Student_Fee_Payments_View.html',
  '530_refunds/Student_Fee_Refunds_View.html'
].forEach(function (file) {
  var source = readAny_(file);
  ['ui-card', 'ui-toolbar', 'ui-table-wrap', 'ui-btn'].forEach(function (primitive) {
    if (source.indexOf(primitive) < 0) failures.push(file + ' must use shared primitive: ' + primitive);
  });
});

var MODAL_PAGES = [
  {
    shell: 'src/frontend/pages/student_fee_payers/Student_Fee_Payers.html',
    view: 'src/frontend/pages/student_fee_payers/Student_Fee_Payers_View.html',
    partials: ['src/frontend/pages/student_fee_payers/modals/Student_Fee_Payer_Edit_Modal.html']
  },
  {
    shell: 'src/frontend/pages/student_fee_payments/Student_Fee_Payments.html',
    view: 'src/frontend/pages/student_fee_payments/Student_Fee_Payments_View.html',
    partials: ['src/frontend/pages/student_fee_payments/modals/Student_Fee_Payment_Detail_Modal.html','src/frontend/pages/student_fee_payments/modals/Student_Fee_Payment_Confirm_Modal.html']
  },
  {
    shell: '530_refunds/Student_Fee_Refunds.html',
    view: '530_refunds/Student_Fee_Refunds_View.html',
    partials: ['530_refunds/modals/Student_Fee_Refund_Detail_Modal.html','530_refunds/modals/Student_Fee_Refund_Approval_Modal.html','530_refunds/modals/Student_Fee_Refund_Transfer_Modal.html']
  }
];
MODAL_PAGES.forEach(function (page) {
  var shell = readAny_(page.shell);
  var view = readAny_(page.view);
  if (/ui-modal-overlay/.test(view)) failures.push(page.view + ' must not own page-specific modal markup.');
  page.partials.forEach(function (partial) {
    var source = readOptionalAny_(partial);
    if (!source) failures.push('Missing Student Fee modal partial: ' + partial);
    var includePath = includePath_(partial);
    if (shell.indexOf("include('" + includePath + "')") < 0) failures.push(page.shell + ' must include ' + partial + '.');
    if (source) {
      if (source.indexOf('ui-modal-overlay') < 0 || source.indexOf('ui-modal') < 0) failures.push(partial + ' must use shared modal primitives.');
      if (source.indexOf('aria-modal="true"') < 0) failures.push(partial + ' must preserve aria-modal=true.');
      if (/<script\b/i.test(source)) failures.push(partial + ' must not contain script blocks.');
      if (/include\s*\(/.test(source)) failures.push(partial + ' must not contain nested includes.');
    }
  });
});

function requireIds_(source, ids, label) { ids.forEach(function (id) { if (source.indexOf('id="' + id + '"') < 0) failures.push(label + ' missing id=' + id); }); }
function requireNames_(source, names, label) { names.forEach(function (name) { if (source.indexOf('name="' + name + '"') < 0) failures.push(label + ' missing name=' + name); }); }
function requireActions_(source, actions, label) { actions.forEach(function (action) { if (source.indexOf('data-action="' + action + '"') < 0) failures.push(label + ' missing action=' + action); }); }

var payerModal = readOptionalAny_('src/frontend/pages/student_fee_payers/modals/Student_Fee_Payer_Edit_Modal.html');
requireIds_(payerModal, ['sf-payer-modal','sf-payer-modal-title','sf-payer-modal-desc','sf-payer-form','sf-payer-student-id','sf-payer-name','sf-payer-affiliation-input','sf-payer-semester','sf-payer-submit'], 'Payer modal');
requireNames_(payerModal, ['studentId','name','affiliation','startSemesterId'], 'Payer modal');
requireActions_(payerModal, ['close-payer-modal'], 'Payer modal');

var paymentDetail = readOptionalAny_('src/frontend/pages/student_fee_payments/modals/Student_Fee_Payment_Detail_Modal.html');
requireIds_(paymentDetail, ['sf-payment-detail-modal','sf-payment-detail-title','sf-payment-detail-content','sf-payment-detail-actions'], 'Payment detail modal');
var paymentConfirm = readOptionalAny_('src/frontend/pages/student_fee_payments/modals/Student_Fee_Payment_Confirm_Modal.html');
requireIds_(paymentConfirm, ['sf-payment-confirm-modal','sf-payment-confirm-title','sf-payment-confirm-form','sf-payment-depositor','sf-payment-confirm-reason'], 'Payment confirm modal');
requireNames_(paymentConfirm, ['depositorName','reason'], 'Payment confirm modal');
requireActions_(paymentConfirm, ['close-payment-confirm','confirm-payment'], 'Payment confirm modal');
if (paymentConfirm && (paymentConfirm.indexOf('data-result="MISMATCH"') < 0 || paymentConfirm.indexOf('data-result="DONE"') < 0)) failures.push('Payment confirm modal must preserve MISMATCH and DONE results.');

var refundDetail = readOptionalAny_('530_refunds/modals/Student_Fee_Refund_Detail_Modal.html');
requireIds_(refundDetail, ['sf-refund-detail-modal','sf-refund-detail-title','sf-refund-detail-content','sf-refund-detail-actions'], 'Refund detail modal');
var refundApproval = readOptionalAny_('530_refunds/modals/Student_Fee_Refund_Approval_Modal.html');
requireIds_(refundApproval, ['sf-refund-approval-modal','sf-refund-approval-title','sf-refund-approval-form','sf-refund-maximum','sf-refund-approved-amount','sf-refund-approval-reason','sf-refund-approve-submit'], 'Refund approval modal');
requireNames_(refundApproval, ['approvedAmount','reason'], 'Refund approval modal');
requireActions_(refundApproval, ['close-refund-approval'], 'Refund approval modal');
var refundTransfer = readOptionalAny_('530_refunds/modals/Student_Fee_Refund_Transfer_Modal.html');
requireIds_(refundTransfer, ['sf-refund-transfer-modal','sf-refund-transfer-title','sf-refund-transfer-form','sf-refund-transfer-date','sf-refund-transfer-file','sf-refund-transfer-reason'], 'Refund transfer modal');
requireNames_(refundTransfer, ['transferDate','transferEvidenceId','reason'], 'Refund transfer modal');
requireActions_(refundTransfer, ['close-refund-transfer','confirm-refund-transfer'], 'Refund transfer modal');
if (refundTransfer && (refundTransfer.indexOf('data-result="FAILED"') < 0 || refundTransfer.indexOf('data-result="DONE"') < 0)) failures.push('Refund transfer modal must preserve FAILED and DONE results.');

var styles = readAny_('common/Student_Fee_Styles.html');
if (/#[0-9a-fA-F]{3,8}\b/.test(styles)) failures.push('Student Fee domain styles must use canonical --ui-* tokens instead of literal hex colors.');
if (/^\s*\.ui-[^{,\s]+\s*\{/m.test(styles)) failures.push('Student Fee domain styles must not own shared .ui-* primitives.');
if (styles.indexOf('.sf-table-toolbar') < 0) failures.push('Student Fee domain styles must provide sf-table-toolbar for list-page spacing.');

var homeJs = readAny_('src/frontend/pages/student_fee_home/student_fee_home_controller_js.html');
['ui-card', 'ui-stat-card', 'ui-stat-grid'].forEach(function (primitive) { if (homeJs.indexOf(primitive) < 0) failures.push('Student Fee home must render shared primitive: ' + primitive); });

var payerJs = readAny_('src/frontend/features/student_fee_payer_manage/student_fee_payer_manage_js.html');
var paymentJs = readAny_('src/frontend/features/student_fee_payment_manage/student_fee_payment_manage_js.html');
var refundJs = readAny_('530_refunds/student_fee_refunds_js.html');
[payerJs, paymentJs, refundJs].forEach(function (source, index) { if (source.indexOf('ui-table') < 0) failures.push('Student Fee list renderer ' + index + ' must render ui-table.'); });

var commonJs = readAny_('common/student_fee_common_js.html');
if (commonJs.indexOf('ui-badge') < 0) failures.push('Student Fee status helper must render ui-badge.');
if (commonJs.indexOf('ui-pagination') < 0 || commonJs.indexOf('ui-page-btn') < 0) failures.push('Student Fee pagination helper must use shared pagination primitives.');

if (failures.length) { failures.forEach(function (failure) { console.error(failure); }); process.exitCode = 1; }
else console.log('Student Fee UI reference verification passed.');
