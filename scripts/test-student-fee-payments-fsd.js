const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'src/frontend/pages/student_fee_payments/Student_Fee_Payments.html',
  'src/frontend/pages/student_fee_payments/Student_Fee_Payments_View.html',
  'src/frontend/pages/student_fee_payments/modals/Student_Fee_Payment_Detail_Modal.html',
  'src/frontend/pages/student_fee_payments/modals/Student_Fee_Payment_Confirm_Modal.html',
  'src/frontend/pages/student_fee_payments/student_fee_payments_controller_js.html',
  'src/frontend/features/student_fee_payment_manage/student_fee_payment_manage_js.html',
  'src/frontend/entities/student_fee_payment/api/student_fee_payment_client_js.html'
];
required.forEach(function (rel) {
  assert.ok(fs.existsSync(path.join(root, rel)), 'missing Student Fee Payments FSD file: ' + rel);
});
assert.ok(!fs.existsSync(path.join(root, 'src/500_student_fee/520_payments')), 'legacy Student Fee Payments slice must be removed');

const shell = fs.readFileSync(path.join(root, required[0]), 'utf8');
const confirmModal = fs.readFileSync(path.join(root, required[3]), 'utf8');
const controller = fs.readFileSync(path.join(root, required[4]), 'utf8');
const feature = fs.readFileSync(path.join(root, required[5]), 'utf8');
const client = fs.readFileSync(path.join(root, required[6]), 'utf8');
const router = fs.readFileSync(path.join(root, 'src/backend/app/routing/Code.js'), 'utf8');

assert.ok(shell.includes("include('frontend/entities/student_fee_payment/api/student_fee_payment_client_js')"));
assert.ok(shell.includes("include('frontend/features/student_fee_payment_manage/student_fee_payment_manage_js')"));
assert.ok(shell.includes("include('frontend/pages/student_fee_payments/student_fee_payments_controller_js')"));
assert.ok(controller.includes('initializeStudentFeePaymentManage()'));

['getApplications', 'getApplication', 'calculateAmount', 'processApplications', 'confirmPayment'].forEach(function (method) {
  assert.ok(feature.includes('studentFeePaymentClient.' + method), 'payment feature missing semantic client method: ' + method);
});
assert.ok(!feature.includes('google.script.run'));
assert.ok(!feature.match(/['"]api_[A-Za-z0-9_]+['"]/));

assert.ok(client.includes("runAppApi('api_getStudentFeeApplications'"));
assert.ok(client.includes("runAppApi('api_getStudentFeeApplication'"));
assert.ok(client.includes("runAppApi('api_calculateStudentFeeAmount'"));
assert.ok(client.includes("runAppApi('api_processStudentFeeApplications'"));
assert.ok(client.includes("runAppApi('api_confirmStudentFeePayment'"));

const singleApproveStart = feature.indexOf('function approveSfPaymentApplication_');
const singleApproveEnd = feature.indexOf('function rejectSfPaymentApplication_', singleApproveStart);
const singleApprove = feature.slice(singleApproveStart, singleApproveEnd);
assert.ok(singleApproveStart >= 0 && singleApproveEnd > singleApproveStart);
assert.ok(singleApprove.indexOf('studentFeePaymentClient.calculateAmount') >= 0);
assert.ok(singleApprove.indexOf('studentFeePaymentClient.processApplications') > singleApprove.indexOf('studentFeePaymentClient.calculateAmount'));

const bulkApproveStart = feature.indexOf('function bulkApproveSfPayments_');
const bulkApproveEnd = feature.indexOf('function bulkRejectSfPayments_', bulkApproveStart);
const bulkApprove = feature.slice(bulkApproveStart, bulkApproveEnd);
assert.ok(bulkApproveStart >= 0 && bulkApproveEnd > bulkApproveStart);
assert.ok(bulkApprove.indexOf('studentFeePaymentClient.calculateAmount') >= 0);
assert.ok(bulkApprove.indexOf('studentFeePaymentClient.processApplications') > bulkApprove.indexOf('studentFeePaymentClient.calculateAmount'));

assert.ok(confirmModal.includes('data-result="MISMATCH"'));
assert.ok(confirmModal.includes('data-result="DONE"'));
assert.ok(feature.includes("['DONE', 'MISMATCH'].indexOf(result) < 0"));
assert.ok(router.includes("student_fee_payments: 'frontend/pages/student_fee_payments/Student_Fee_Payments'"));

console.log('Student Fee Payments FSD migration contract: PASS');
