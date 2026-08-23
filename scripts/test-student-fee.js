var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');

function load_(context, relativePath) {
  var file = path.join(ROOT, relativePath);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

function createContext_() {
  return vm.createContext({
    console: console,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Math: Math,
    Date: Date,
    JSON: JSON,
    isFinite: isFinite,
    Utilities: { getUuid: function () { return 'uuid-test'; } },
    withOperationWriteLock_: function (fn) { return fn(); },
    studentFeeApiAccess_: function (action) { return { domain: 'student_fee', action: action }; }
  });
}

function plain_(value) { return JSON.parse(JSON.stringify(value)); }
function loadRequest_(context) { load_(context, 'src/000_server/080_student_fee/080_common/student_fee_request.gs'); }

function testFeeRateResolution_() {
  var context = createContext_();
  context.isTruthyValue_ = function (value) { return !!value; };
  context.readOperationTableClientRows_ = function (table) {
    if (table === 'feeRates') return [
      { id: 'old', startDate: '2026-01-01', endDate: '2026-06-30', amountPerSemester: 10000, active: true },
      { id: 'current', startDate: '2026-07-01', endDate: '2026-12-31', amountPerSemester: 20000, active: true }
    ];
    return [];
  };
  context.findOperationTableRowById_ = function () { return null; };
  load_(context, 'src/000_server/080_student_fee/080_common/student_fee_reference_query_service.gs');
  assert.strictEqual(context.resolveStudentFeeRate_('2026-08-17').id, 'current');
  assert.throws(function () { context.resolveStudentFeeRate_('2027-01-01'); }, /회비금액기준/);
}

function testStudentFeeReferenceData_() {
  var context = createContext_();
  context.readOperationTableClientRows_ = function (table) {
    if (table === 'semesters') return [
      { id: '20261', year: 2026, type: '1학기', startDate: '', endDate: '', active: true },
      { id: '20262', year: 2026, type: '2학기', startDate: '', endDate: '', active: true }
    ];
    return [];
  };
  context.isTruthyValue_ = function (value) { return value === true; };
  context.findOperationTableRowById_ = function () { return null; };
  load_(context, 'src/000_server/080_student_fee/080_common/student_fee_reference_query_service.gs');
  var data = context.getStudentFeeReferenceData_();
  assert.strictEqual(data.semesters[0].id, '20262');
  assert.strictEqual(data.semesters[0].label, '2026학년도 2학기');
  assert.strictEqual(data.semesters[1].id, '20261');
}

function testAuditAttribution_() {
  var context = createContext_();
  var captured;
  context.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  context.getOperationDbSchema_ = function () { return { businessAuditLogs: {}, feeApplications: {} }; };
  context.appendOperationTableRow_ = function (table, row) { captured = { table: table, row: row }; return row; };
  load_(context, 'src/000_server/010_core/business_audit.gs');
  load_(context, 'src/000_server/080_student_fee/080_common/student_fee_audit_sheet_dao.gs');
  var result = context.writeStudentFeeAudit_('staff@example.com', 'APPROVE', 'feeApplications', 'app-1', { status: '접수' }, { status: '승인' }, 'ok');
  assert.strictEqual(captured.table, 'businessAuditLogs');
  assert.strictEqual(result.actorEmail, 'staff@example.com');
  assert.strictEqual(result.actionType, 'APPROVE');
  assert.deepStrictEqual(JSON.parse(result.beforeValue), { status: '접수' });
  assert.deepStrictEqual(JSON.parse(result.afterValue), { status: '승인' });
}

function testPayerBehavior_() {
  var context = createContext_();
  var inserted;
  var updated;
  var audits = [];
  loadRequest_(context);
  context.findFeePayerRowById_ = function (id) {
    if (id === 'existing') return { studentId: id };
    if (id === '60201234') return { studentId: id, name: '김학생', affiliation: '경영정보학과', startSemesterId: '20261', managerEmail: 'old@example.com', updatedAt: 'old' };
    return null;
  };
  context.assertValidStudentFeeSemester_ = function (id) {
    if (['20261', '20262'].indexOf(id) < 0) throw new Error('학기기준');
    return { id: id };
  };
  context.insertFeePayerRow_ = function (row) { inserted = plain_(row); return row; };
  context.updateFeePayerRowById_ = function (id, changes) { updated = { id: id, changes: plain_(changes) }; return true; };
  context.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  context.writeStudentFeeAudit_ = function () { audits.push(Array.prototype.slice.call(arguments)); };
  load_(context, 'src/000_server/080_student_fee/081_payers/fee_payers_service.gs');

  assert.throws(function () {
    context.createFeePayerData_({ studentId: 'existing', name: 'A', affiliation: 'B', startSemesterId: '20261' }, { email: 'staff@example.com' });
  }, /이미 등록/);

  assert.throws(function () {
    context.upsertFeePayerFromApplication_({ studentId: '60208888', name: '검증', affiliation: '경영정보학과', startSemesterId: '20999' }, 'staff@example.com');
  }, /학기기준/);

  var created = context.createFeePayerData_({ studentId: '60209999', name: '신규', affiliation: '경영정보학과', startSemesterId: '20261' }, { email: 'staff@example.com' });
  assert.deepStrictEqual(plain_(created), inserted);
  assert.strictEqual(created.managerEmail, 'staff@example.com');

  var changed = context.updateFeePayerData_({ studentId: '60201234', name: '김수정', startSemesterId: '20262' }, { email: 'editor@example.com' });
  assert.strictEqual(changed.name, '김수정');
  assert.strictEqual(updated.changes.managerEmail, 'editor@example.com');
  assert.strictEqual(updated.changes.studentId, undefined);
  assert.strictEqual(audits.length, 2);
}

function testPaymentBehavior_() {
  var context = createContext_();
  var application = {
    id: 'app-1', paymentDate: '2026-08-10', semesterCount: 1, status: '접수',
    studentId: '60201234', name: '김철수', affiliation: '경영정보학과', startSemesterId: '20261'
  };
  var inserted;
  var payerRow;
  var payerUpdated;
  var existingPayer = null;
  var audits = [];

  loadRequest_(context);
  context.assertValidStudentFeeSemester_ = function (id) {
    if (id !== '20261') throw new Error('학기기준');
    return { id: id };
  };
  context.findFeeApplicationRowById_ = function () { return application; };
  context.findFeePaymentRowByApplicationId_ = function () { return inserted || null; };
  context.updateFeeApplicationRowById_ = function (id, changes) { application = Object.assign({}, application, changes); return true; };
  context.insertFeePaymentRow_ = function (row) { inserted = plain_(row); return row; };
  context.resolveStudentFeeRate_ = function () { return { amountPerSemester: 20000 }; };
  context.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  context.writeStudentFeeAudit_ = function () { audits.push(Array.prototype.slice.call(arguments)); };

  // 승인에 따른 feePayers upsert를 검증하기 위한 mock
  context.findFeePayerRowById_ = function () { return existingPayer; };
  context.insertFeePayerRow_ = function (row) { payerRow = plain_(row); existingPayer = payerRow; return row; };
  context.updateFeePayerRowById_ = function (id, changes) { payerUpdated = { id: id, changes: plain_(changes) }; existingPayer = Object.assign({}, existingPayer, changes); return true; };

  load_(context, 'src/000_server/080_student_fee/081_payers/fee_payers_service.gs');
  load_(context, 'src/000_server/080_student_fee/082_payments/fee_payments_service.gs');

  var approved = context.processFeeApplicationsData_({ ids: ['app-1'], action: 'APPROVE' }, { email: 'staff@example.com' });
  assert.strictEqual(approved[0].success, true);
  assert.strictEqual(inserted.amount, 20000);
  assert.strictEqual(inserted.managerEmail, 'staff@example.com');
  assert.strictEqual(application.managerEmail, 'staff@example.com');
  assert.strictEqual(approved[0].payer.studentId, '60201234');
  assert.strictEqual(payerRow.name, '김철수');
  assert.strictEqual(payerRow.managerEmail, 'staff@example.com');
  assert.strictEqual(audits.length, 3);

  // 동일 학번으로 재승인 시 회비납부자 정보가 갱신되는지 검증
  application = {
    id: 'app-2', paymentDate: '2026-08-11', semesterCount: 1, status: '접수',
    studentId: '60201234', name: '김철수', affiliation: '경영대학', startSemesterId: '20261'
  };
  inserted = null;
  var approved2 = context.processFeeApplicationsData_({ ids: ['app-2'], action: 'APPROVE' }, { email: 'staff2@example.com' });
  assert.strictEqual(approved2[0].success, true);
  assert.strictEqual(payerUpdated.id, '60201234');
  assert.strictEqual(payerUpdated.changes.affiliation, '경영대학');
  assert.strictEqual(payerUpdated.changes.managerEmail, 'staff2@example.com');

  var confirmation = createContext_();
  var payment = { id: 'pay-1', moneyStatus: '대기', amount: 20000 };
  var updatedPayment;
  confirmation.findFeePaymentRowById_ = function () { return payment; };
  confirmation.updateFeePaymentRowById_ = function (id, changes) { updatedPayment = plain_(changes); payment = Object.assign({}, payment, changes); return true; };
  confirmation.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  confirmation.writeStudentFeeAudit_ = function () {};
  load_(confirmation, 'src/000_server/080_student_fee/082_payments/fee_payments_service.gs');
  var confirmed = confirmation.confirmFeePaymentData_({ paymentId: 'pay-1', result: 'MISMATCH', depositorName: '홍길동' }, { email: 'staff@example.com' });
  assert.strictEqual(confirmed.moneyStatus, '불일치');
  assert.strictEqual(updatedPayment.managerEmail, 'staff@example.com');
}

function testRefundBehavior_() {
  var context = createContext_();
  var request = { id: 'req-1', paymentId: 'pay-1', status: '접수' };
  var inserted;
  var audits = [];
  context.findFeeRefundRequestRowById_ = function () { return request; };
  context.findFeeRefundRowByRequestId_ = function () { return inserted || null; };
  context.calculateRefundableAmount_ = function () { return 12000; };
  context.updateFeeRefundRequestRowById_ = function (id, changes) { request = Object.assign({}, request, changes); return true; };
  context.insertFeeRefundRow_ = function (row) { inserted = plain_(row); return row; };
  context.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  context.writeStudentFeeAudit_ = function () { audits.push(Array.prototype.slice.call(arguments)); };
  context.parseStudentFeeAmount_ = function (value, fieldName, minimum) { var amount = Number(value); if (!isFinite(amount) || amount < minimum) throw new Error(fieldName); return amount; };
  load_(context, 'src/000_server/080_student_fee/083_refunds/fee_refunds_service.gs');

  var approved = context.processFeeRefundRequestsData_({ ids: ['req-1'], action: 'APPROVE' }, { email: 'staff@example.com' });
  assert.strictEqual(approved[0].refund.approvedAmount, 12000);
  assert.strictEqual(approved[0].refund.managerEmail, 'staff@example.com');
  assert.strictEqual(request.managerEmail, 'staff@example.com');
  assert.strictEqual(audits.length, 2);

  var confirmation = createContext_();
  var refund = { id: 'ref-1', moneyStatus: '대기' };
  var changes;
  confirmation.findFeeRefundRowById_ = function () { return refund; };
  confirmation.updateFeeRefundRowById_ = function (id, update) { changes = plain_(update); refund = Object.assign({}, refund, update); return true; };
  confirmation.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  confirmation.writeStudentFeeAudit_ = function () {};
  load_(confirmation, 'src/000_server/080_student_fee/083_refunds/fee_refunds_service.gs');
  var confirmed = confirmation.confirmFeeRefundData_({ refundId: 'ref-1', result: 'DONE', transferEvidenceId: 'file-1' }, { email: 'staff@example.com' });
  assert.strictEqual(confirmed.moneyStatus, '완료');
  assert.strictEqual(changes.managerEmail, 'staff@example.com');
}

function testSummary_() {
  var context = createContext_();
  context.listFeePayerRows_ = function () { return [{}, {}]; };
  context.listFeeApplicationRows_ = function () { return [{ status: '접수' }, { status: '승인' }, { status: '반려' }]; };
  context.listFeePaymentRows_ = function () { return [{ moneyStatus: '대기', amount: 20000 }, { moneyStatus: '완료', amount: 20000 }]; };
  context.listFeeRefundRequestRows_ = function () { return [{ status: '접수' }, { status: '승인' }]; };
  context.listFeeRefundRows_ = function () { return [{ moneyStatus: '대기', approvedAmount: 10000 }]; };
  load_(context, 'src/000_server/080_student_fee/082_payments/fee_payments_query_service.gs');
  assert.deepStrictEqual(plain_(context.getStudentFeeSummaryData_()), {
    payers: { total: 2 }, applications: { total: 3, pending: 1, approved: 1, rejected: 1 },
    payments: { total: 2, pending: 1, completed: 1, mismatch: 0, completedAmount: 20000 },
    refundRequests: { total: 2, pending: 1, approved: 1, rejected: 0 },
    refunds: { total: 1, pending: 1, completed: 0, failed: 0, completedAmount: 0 }
  });
}

testFeeRateResolution_();
testStudentFeeReferenceData_();
testAuditAttribution_();
testPayerBehavior_();
testPaymentBehavior_();
testRefundBehavior_();
testSummary_();
console.log('Student Fee behavior regression tests passed.');
