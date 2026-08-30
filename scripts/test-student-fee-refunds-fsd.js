const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'src/frontend/pages/student_fee_refunds/Student_Fee_Refunds.html',
  'src/frontend/pages/student_fee_refunds/Student_Fee_Refunds_View.html',
  'src/frontend/pages/student_fee_refunds/modals/Student_Fee_Refund_Detail_Modal.html',
  'src/frontend/pages/student_fee_refunds/modals/Student_Fee_Refund_Approval_Modal.html',
  'src/frontend/pages/student_fee_refunds/modals/Student_Fee_Refund_Transfer_Modal.html',
  'src/frontend/pages/student_fee_refunds/student_fee_refunds_controller_js.html',
  'src/frontend/features/student_fee_refund_manage/student_fee_refund_manage_js.html',
  'src/frontend/entities/student_fee_refund/api/student_fee_refund_client_js.html'
];
required.forEach(function (rel) {
  assert.ok(fs.existsSync(path.join(root, rel)), 'missing Student Fee Refunds FSD file: ' + rel);
});
assert.ok(!fs.existsSync(path.join(root, 'src/500_student_fee/530_refunds')), 'legacy Student Fee Refunds slice must be removed');

const shell = fs.readFileSync(path.join(root, required[0]), 'utf8');
const approvalModal = fs.readFileSync(path.join(root, required[3]), 'utf8');
const transferModal = fs.readFileSync(path.join(root, required[4]), 'utf8');
const controller = fs.readFileSync(path.join(root, required[5]), 'utf8');
const feature = fs.readFileSync(path.join(root, required[6]), 'utf8');
const client = fs.readFileSync(path.join(root, required[7]), 'utf8');
const router = fs.readFileSync(path.join(root, 'src/backend/app/routing/Code.js'), 'utf8');

assert.ok(shell.includes("include('frontend/entities/student_fee_refund/api/student_fee_refund_client_js')"));
assert.ok(shell.includes("include('frontend/features/student_fee_refund_manage/student_fee_refund_manage_js')"));
assert.ok(shell.includes("include('frontend/pages/student_fee_refunds/student_fee_refunds_controller_js')"));
assert.ok(controller.includes('initializeStudentFeeRefundManage()'));

['getRefundRequests', 'getRefundRequest', 'calculateRefund', 'processRefundRequests', 'confirmRefund'].forEach(function (method) {
  assert.ok(feature.includes('studentFeeRefundClient.' + method), 'refund feature missing semantic client method: ' + method);
});
assert.ok(!feature.includes('google.script.run'));
assert.ok(!feature.match(/['"]api_[A-Za-z0-9_]+['"]/));

assert.ok(client.includes("runAppApi('api_getStudentFeeRefundRequests'"));
assert.ok(client.includes("runAppApi('api_getStudentFeeRefundRequest'"));
assert.ok(client.includes("runAppApi('api_calculateStudentFeeRefund'"));
assert.ok(client.includes("runAppApi('api_processStudentFeeRefundRequests'"));
assert.ok(client.includes("runAppApi('api_confirmStudentFeeRefund'"));

const detailStart = feature.indexOf('function openSfRefundDetail_');
const detailEnd = feature.indexOf('function openSfRefundApproval_', detailStart);
const detailBlock = feature.slice(detailStart, detailEnd);
assert.ok(detailStart >= 0 && detailEnd > detailStart);
assert.ok(detailBlock.indexOf('studentFeeRefundClient.getRefundRequest') >= 0);
assert.ok(detailBlock.indexOf('studentFeeRefundClient.calculateRefund') > detailBlock.indexOf('studentFeeRefundClient.getRefundRequest'));

const approvalStart = feature.indexOf('function submitSfRefundApproval_');
const approvalEnd = feature.indexOf('function rejectSfRefund_', approvalStart);
const approvalBlock = feature.slice(approvalStart, approvalEnd);
assert.ok(approvalStart >= 0 && approvalEnd > approvalStart);
assert.ok(approvalBlock.includes('approvedAmount: approvedAmount'));
assert.ok(approvalBlock.includes('studentFeeRefundClient.processRefundRequests'));

const bulkStart = feature.indexOf('function bulkApproveSfRefunds_');
const bulkEnd = feature.indexOf('function bulkRejectSfRefunds_', bulkStart);
const bulkBlock = feature.slice(bulkStart, bulkEnd);
assert.ok(bulkStart >= 0 && bulkEnd > bulkStart);
assert.ok(bulkBlock.indexOf('studentFeeRefundClient.calculateRefund') >= 0);
assert.ok(bulkBlock.indexOf('studentFeeRefundClient.processRefundRequests') > bulkBlock.indexOf('studentFeeRefundClient.calculateRefund'));
assert.ok(!/approvedAmount\s*:/.test(bulkBlock), 'bulk refund approval must not send one shared approvedAmount');

assert.ok(approvalModal.includes('name="approvedAmount"'));
assert.ok(transferModal.includes('data-result="FAILED"'));
assert.ok(transferModal.includes('data-result="DONE"'));
assert.ok(feature.includes("['DONE', 'FAILED'].indexOf(result) < 0"));
assert.ok(router.includes("student_fee_refunds: 'frontend/pages/student_fee_refunds/Student_Fee_Refunds'"));

console.log('Student Fee Refunds FSD migration contract: PASS');
