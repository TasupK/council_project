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
    Utilities: { getUuid: function () { return 'uuid-test'; } }
  });
}

function plain_(value) {
  return JSON.parse(JSON.stringify(value));
}

function installRequestHelpers_(context) {
  load_(context, 'src/000_server/080_student_fee/080_common/student_fee_request.gs');
}

function testFeeRateResolution_() {
  var context = createContext_();
  context.isTruthyValue_ = function (value) { return value === true || String(value).toLowerCase() === 'true'; };
  context.readOperationTableClientRows_ = function (table) {
    assert.strictEqual(table, 'feeRates');
    return [
      { id: 'old', startDate: '2026-01-01', endDate: '2026-06-30', amountPerSemester: 10000, active: true },
      { id: 'current', startDate: '2026-07-01', endDate: '2026-12-31', amountPerSemester: 20000, active: true }
    ];
  };
  context.findOperationTableRowById_ = function () { return null; };
  load_(context, 'src/000_server/080_student_fee/080_common/student_fee_reference_query_service.gs');
  assert.strictEqual(context.resolveStudentFeeRate_('2026-08-17').id, 'current');
  assert.throws(function () { context.resolveStudentFeeRate_('2027-01-01'); }, /회비금액기준/);

  var overlapping = createContext_();
  overlapping.isTruthyValue_ = context.isTruthyValue_;
  overlapping.findOperationTableRowById_ = function () { return null; };
  overlapping.readOperationTableClientRows_ = function () {
    return [
      { id: 'a', startDate: '2026-01-01', endDate: '2026-12-31', amountPerSemester: 10000, active: true },
      { id: 'b', startDate: '2026-08-01', endDate: '2026-08-31', amountPerSemester: 20000, active: true }
    ];
  };
  load_(overlapping, 'src/000_server/080_student_fee/080_common/student_fee_reference_query_service.gs');
  assert.throws(function () { overlapping.resolveStudentFeeRate_('2026-08-17'); }, /여러 건/);
}

function testAuditAttribution_() {
  var context = createContext_();
  var captured;
  context.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  context.appendOperationTableRow_ = function (table, row) {
    captured = { table: table, row: row };
    return row;
  };
  load_(context, 'src/000_server/080_student_fee/080_common/student_fee_audit_sheet_dao.gs');
  var result = context.writeStudentFeeAudit_('staff@example.com', '승인', 'feeApplications', 'app-1', '접수', '승인', 'ok');
  assert.strictEqual(captured.table, 'businessAuditLogs');
  assert.deepStrictEqual(plain_(result), {
    id: 'uuid-test',
    occurredAt: '2026-08-17T21:00:00+09:00',
    actorEmail: 'staff@example.com',
    actionType: '승인',
    targetType: 'feeApplications',
    targetId: 'app-1',
    beforeValue: '접수',
    afterValue: '승인',
    reason: 'ok'
  });
}

function testPayerCreateAndUpdate_() {
  var context = createContext_();
  var inserted;
  var updated;
  var audits = [];
  installRequestHelpers_(context);
  context.findFeePayerRowById_ = function (id) {
    if (id === 'existing') return { studentId: 'existing' };
    if (id === '60201234') return { studentId: '60201234', name: '김학생', affiliation: '경영정보학과', startSemesterId: '2026-1', managerId: 'old@example.com', updatedAt: 'old' };
    return null;
  };
  context.assertValidStudentFeeSemester_ = function (id) {
    if (id !== '2026-1' && id !== '2026-2') throw new Error('학기기준을 찾을 수 없습니다');
    return { id: id };
  };
  context.insertFeePayerRow_ = function (row) { inserted = plain_(row); return row; };
  context.updateFeePayerRowById_ = function (id, changes) { updated = { id: id, changes: plain_(changes) }; return true; };
  context.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  context.writeStudentFeeAudit_ = function () { audits.push(Array.prototype.slice.call(arguments)); };
  load_(context, 'src/000_server/080_student_fee/081_payers/fee_payers_service.gs');

  assert.throws(function () {
    context.createFeePayerData_({ studentId: 'existing', name: 'A', affiliation: 'B', startSemesterId: '2026-1' }, { email: 'staff@example.com' });
  }, /이미 등록/);

  var created = context.createFeePayerData_({ studentId: '60209999', name: '신규', affiliation: '경영정보학과', startSemesterId: '2026-1' }, { email: 'staff@example.com' });
  assert.deepStrictEqual(plain_(created), inserted);
  assert.strictEqual(inserted.managerId, 'staff@example.com');
  assert.strictEqual(audits.length, 1);

  var result = context.updateFeePayerData_({ studentId: '60201234', name: '김수정', affiliation: '경영대학', startSemesterId: '2026-2' }, { email: 'editor@example.com' });
  assert.strictEqual(updated.id, '60201234');
  assert.strictEqual(updated.changes.managerId, 'editor@example.com');
  assert.strictEqual(updated.changes.studentId, undefined);
  assert.strictEqual(result.studentId, '60201234');
  assert.strictEqual(result.name, '김수정');
  assert.strictEqual(audits.length, 2);
}

function testMaskedPayerList_() {
  var context = createContext_();
  context.findAllFeePayerRows_ = function () {
    return [
      { studentId: '60201234', name: '김학생', affiliation: '경영정보학과', startSemesterId: '2026-1', updatedAt: '2026-08-17' },
      { studentId: '60205678', name: '이학생', affiliation: '경영대학', startSemesterId: '2026-1', updatedAt: '2026-08-16' }
    ];
  };
  load_(context, 'src/000_server/080_student_fee/081_payers/fee_payers_query_service.gs');
  var result = context.getFeePayerListData_({ keyword: '김', page: 1, pageSize: 10 });
  assert.strictEqual(result.total, 1);
  assert.strictEqual(result.items[0].studentId, '60****34');
}

function testPaymentReads_() {
  var context = createContext_();
  context.findAllFeeApplicationRows_ = function () {
    return [
      { id: 'app-1', studentId: '60201234', name: '김학생', affiliation: '경영정보학과', paymentDate: '2026-08-10', semesterNumber: 2, appliedAt: '2026-08-11T09:00:00', status: '접수' },
      { id: 'app-2', studentId: '60205678', name: '이학생', affiliation: '경영대학', paymentDate: '2026-08-09', semesterNumber: 4, appliedAt: '2026-08-12T09:00:00', status: '승인' }
    ];
  };
  context.findAllFeePaymentRows_ = function () { return [{ id: 'pay-2', applicationId: 'app-2', amount: 20000, moneyStatus: '대기' }]; };
  context.findFeeApplicationRowById_ = function () { return context.findAllFeeApplicationRows_()[0]; };
  context.findFeePaymentRowByApplicationId_ = function () { return null; };
  context.resolveStudentFeeRate_ = function () { return { id: 'rate-1', amountPerSemester: 20000 }; };
  load_(context, 'src/000_server/080_student_fee/082_payments/fee_payments_query_service.gs');
  var list = context.getFeeApplicationListData_({ page: 1, pageSize: 10 });
  assert.deepStrictEqual(list.items.map(function (item) { return item.id; }), ['app-2', 'app-1']);
  assert.strictEqual(list.items[0].studentId, '60****78');
  assert.strictEqual(list.items[0].payment.id, 'pay-2');
  var calc = context.calculateFeeAmountData_({ paymentDate: '2026-08-10', semesterNumber: 9 });
  assert.strictEqual(calc.amount, 20000);
}

function testPaymentApprovalAndDuplicatePrevention_() {
  var context = createContext_();
  var application = { id: 'app-1', paymentDate: '2026-08-10', status: '접수' };
  var updated;
  var inserted;
  var audits = [];
  context.findFeeApplicationRowById_ = function () { return application; };
  context.findFeePaymentRowByApplicationId_ = function () { return inserted ? inserted : null; };
  context.updateFeeApplicationRowById_ = function (id, changes) { updated = plain_(changes); application = Object.assign({}, application, changes); return true; };
  context.insertFeePaymentRow_ = function (row) { inserted = plain_(row); return row; };
  context.resolveStudentFeeRate_ = function () { return { id: 'rate-1', amountPerSemester: 20000 }; };
  context.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  context.writeStudentFeeAudit_ = function () { audits.push(Array.prototype.slice.call(arguments)); };
  load_(context, 'src/000_server/080_student_fee/082_payments/fee_payments_service.gs');
  var result = context.processFeeApplicationsData_({ ids: ['app-1'], action: 'APPROVE' }, { email: 'staff@example.com' });
  assert.strictEqual(result[0].success, true);
  assert.strictEqual(updated.status, '승인');
  assert.strictEqual(inserted.amount, 20000);
  assert.strictEqual(inserted.moneyStatus, '대기');
  assert.strictEqual(inserted.managerId, 'staff@example.com');
  assert.strictEqual(audits.length, 2);
  assert.throws(function () {
    context.processFeeApplicationsData_({ ids: ['app-1'], action: 'APPROVE' }, { email: 'staff@example.com' });
  }, /이미 처리|이미 생성/);
}

function testPaymentRejectAndConfirm_() {
  var context = createContext_();
  var app = { id: 'app-1', status: '접수', paymentDate: '2026-08-10' };
  var payment = { id: 'pay-1', applicationId: 'app-1', moneyStatus: '대기', amount: 20000 };
  var paymentPatch;
  context.findFeeApplicationRowById_ = function () { return app; };
  context.findFeePaymentRowByApplicationId_ = function () { return null; };
  context.updateFeeApplicationRowById_ = function (id, changes) { app = Object.assign({}, app, changes); return true; };
  context.insertFeePaymentRow_ = function () { throw new Error('reject must not insert'); };
  context.findFeePaymentRowById_ = function () { return payment; };
  context.updateFeePaymentRowById_ = function (id, changes) { paymentPatch = plain_(changes); payment = Object.assign({}, payment, changes); return true; };
  context.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  context.writeStudentFeeAudit_ = function () {};
  context.resolveStudentFeeRate_ = function () { return { amountPerSemester: 20000 }; };
  load_(context, 'src/000_server/080_student_fee/082_payments/fee_payments_service.gs');
  var rejected = context.processFeeApplicationsData_({ ids: ['app-1'], action: 'REJECT', reason: '증빙 불충분' }, { email: 'staff@example.com' });
  assert.strictEqual(rejected[0].success, true);
  assert.strictEqual(app.status, '반려');

  var confirmed = context.confirmFeePaymentData_({ paymentId: 'pay-1', result: 'MISMATCH', depositorName: '홍길동' }, { email: 'staff@example.com' });
  assert.strictEqual(confirmed.moneyStatus, '불일치');
  assert.strictEqual(paymentPatch.depositorName, '홍길동');
  assert.strictEqual(paymentPatch.managerId, 'staff@example.com');
  assert.throws(function () {
    context.confirmFeePaymentData_({ paymentId: 'pay-1', result: 'DONE' }, { email: 'staff@example.com' });
  }, /대기/);
}

function testRefundableBalance_() {
  var context = createContext_();
  context.findFeePaymentRowById_ = function () { return { id: 'pay-1', amount: 20000 }; };
  context.findAllFeeRefundRequestRows_ = function () {
    return [
      { id: 'req-1', paymentId: 'pay-1' },
      { id: 'req-2', paymentId: 'pay-1' },
      { id: 'req-other', paymentId: 'pay-2' }
    ];
  };
  context.findAllFeeRefundRows_ = function () {
    return [
      { requestId: 'req-1', approvedAmount: 5000, moneyStatus: '대기' },
      { requestId: 'req-2', approvedAmount: 3000, moneyStatus: '완료' },
      { requestId: 'req-2', approvedAmount: 9999, moneyStatus: '실패' }
    ];
  };
  load_(context, 'src/000_server/080_student_fee/083_refunds/fee_refunds_query_service.gs');
  assert.strictEqual(context.calculateRefundableAmount_('pay-1'), 12000);
}

function testMaskedRefundList_() {
  var context = createContext_();
  context.findAllFeeRefundRequestRows_ = function () {
    return [{ id: 'req-1', studentId: '60201234', bankName: '은행', accountNumber: '1234567890', accountHolder: '김학생', paymentId: 'pay-1', appliedAt: '2026-08-17T09:00:00', status: '접수' }];
  };
  context.findAllFeeRefundRows_ = function () { return []; };
  context.findFeePaymentRowById_ = function () { return { id: 'pay-1', amount: 20000 }; };
  context.findFeeRefundRequestRowById_ = function () { return context.findAllFeeRefundRequestRows_()[0]; };
  context.findFeeRefundRowByRequestId_ = function () { return null; };
  load_(context, 'src/000_server/080_student_fee/083_refunds/fee_refunds_query_service.gs');
  var result = context.getFeeRefundRequestListData_({ page: 1, pageSize: 10 });
  assert.strictEqual(result.items[0].studentId, '60****34');
  assert.notStrictEqual(result.items[0].accountNumber, '1234567890');
  var detail = context.getFeeRefundRequestDetailData_({ refundRequestId: 'req-1', hasFullAccess: true });
  assert.strictEqual(detail.request.accountNumber, '1234567890');
}

function testRefundApprovalAndDuplicatePrevention_() {
  var context = createContext_();
  var request = { id: 'req-1', paymentId: 'pay-1', status: '접수' };
  var inserted;
  var audits = [];
  context.findFeeRefundRequestRowById_ = function () { return request; };
  context.findFeeRefundRowByRequestId_ = function () { return inserted ? inserted : null; };
  context.calculateRefundableAmount_ = function () { return 12000; };
  context.updateFeeRefundRequestRowById_ = function (id, changes) { request = Object.assign({}, request, changes); return true; };
  context.insertFeeRefundRow_ = function (row) { inserted = plain_(row); return row; };
  context.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  context.writeStudentFeeAudit_ = function () { audits.push(Array.prototype.slice.call(arguments)); };
  context.parseStudentFeeAmount_ = function (value) { var n = Number(value); if (!(n > 0)) throw new Error('금액'); return n; };
  load_(context, 'src/000_server/080_student_fee/083_refunds/fee_refunds_service.gs');
  var result = context.processFeeRefundRequestsData_({ ids: ['req-1'], action: 'APPROVE' }, { email: 'staff@example.com' });
  assert.strictEqual(result[0].success, true);
  assert.strictEqual(inserted.approvedAmount, 12000);
  assert.strictEqual(inserted.moneyStatus, '대기');
  assert.strictEqual(inserted.managerId, 'staff@example.com');
  assert.strictEqual(audits.length, 2);
  assert.throws(function () {
    context.processFeeRefundRequestsData_({ ids: ['req-1'], action: 'APPROVE' }, { email: 'staff@example.com' });
  }, /이미 처리|이미 생성/);
}

function testRefundRejectAndConfirm_() {
  var context = createContext_();
  var request = { id: 'req-1', paymentId: 'pay-1', status: '접수' };
  var refund = { id: 'ref-1', requestId: 'req-1', approvedAmount: 10000, moneyStatus: '대기' };
  context.findFeeRefundRequestRowById_ = function () { return request; };
  context.findFeeRefundRowByRequestId_ = function () { return null; };
  context.calculateRefundableAmount_ = function () { return 12000; };
  context.updateFeeRefundRequestRowById_ = function (id, changes) { request = Object.assign({}, request, changes); return true; };
  context.insertFeeRefundRow_ = function () { throw new Error('reject must not insert'); };
  context.findFeeRefundRowById_ = function () { return refund; };
  context.updateFeeRefundRowById_ = function (id, changes) { refund = Object.assign({}, refund, changes); return true; };
  context.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  context.writeStudentFeeAudit_ = function () {};
  context.parseStudentFeeAmount_ = function (value) { return Number(value); };
  load_(context, 'src/000_server/080_student_fee/083_refunds/fee_refunds_service.gs');
  var rejected = context.processFeeRefundRequestsData_({ ids: ['req-1'], action: 'REJECT', reason: '대상 아님' }, { email: 'staff@example.com' });
  assert.strictEqual(rejected[0].success, true);
  assert.strictEqual(request.status, '반려');
  var confirmed = context.confirmFeeRefundData_({ refundId: 'ref-1', result: 'DONE', transferDate: '2026-08-17', transferEvidenceId: 'file-1' }, { email: 'staff@example.com' });
  assert.strictEqual(confirmed.moneyStatus, '완료');
  assert.strictEqual(confirmed.managerId, 'staff@example.com');
  assert.strictEqual(confirmed.transferEvidenceId, 'file-1');
}

function testStudentFeeSummary_() {
  var context = createContext_();
  context.findAllFeePayerRows_ = function () { return [{}, {}]; };
  context.findAllFeeApplicationRows_ = function () { return [{ status: '접수' }, { status: '승인' }, { status: '반려' }]; };
  context.findAllFeePaymentRows_ = function () { return [{ moneyStatus: '대기', amount: 20000 }, { moneyStatus: '완료', amount: 20000 }]; };
  context.findAllFeeRefundRequestRows_ = function () { return [{ status: '접수' }, { status: '승인' }]; };
  context.findAllFeeRefundRows_ = function () { return [{ moneyStatus: '대기', approvedAmount: 10000 }]; };
  load_(context, 'src/000_server/080_student_fee/082_payments/fee_payments_query_service.gs');
  assert.deepStrictEqual(plain_(context.getStudentFeeSummaryData_()), {
    payers: { total: 2 },
    applications: { total: 3, pending: 1, approved: 1, rejected: 1 },
    payments: { total: 2, pending: 1, completed: 1, mismatch: 0, completedAmount: 20000 },
    refundRequests: { total: 2, pending: 1, approved: 1, rejected: 0 },
    refunds: { total: 1, pending: 1, completed: 0, failed: 0, completedAmount: 0 }
  });
}

function testApiRequiresLogin_() {
  var context = createContext_();
  var seen = [];
  context.apiHandler_ = function (options) { seen.push(options); return options.operation; };
  context.parseStudentFeeRequest_ = function (input) { return { request: input || {} }; };
  context.getStudentFeeSummaryData_ = function () {};
  context.getFeePayerListData_ = function () {};
  context.getFeePayerDetailData_ = function () {};
  context.createFeePayerData_ = function () {};
  context.updateFeePayerData_ = function () {};
  context.getFeeApplicationListData_ = function () {};
  context.getFeeApplicationDetailData_ = function () {};
  context.processFeeApplicationsData_ = function () {};
  context.calculateFeeAmountData_ = function () {};
  context.confirmFeePaymentData_ = function () {};
  context.getFeeRefundRequestListData_ = function () {};
  context.getFeeRefundRequestDetailData_ = function () {};
  context.processFeeRefundRequestsData_ = function () {};
  context.calculateFeeRefundData_ = function () {};
  context.confirmFeeRefundData_ = function () {};
  load_(context, 'src/000_server/080_student_fee/081_payers/fee_payers_api.gs');
  load_(context, 'src/000_server/080_student_fee/082_payments/fee_payments_api.gs');
  load_(context, 'src/000_server/080_student_fee/083_refunds/fee_refunds_api.gs');

  context.api_getFeePayerList({});
  context.api_getFeePayerDetail({});
  context.api_createFeePayer({});
  context.api_updateFeePayer({});
  context.api_getStudentFeeSummary({});
  context.api_getFeeApplicationList({});
  context.api_getFeeApplicationDetail({});
  context.api_processFeeApplications({});
  context.api_calculateFeeAmount({});
  context.api_confirmFeePayment({});
  context.api_getFeeRefundRequestList({});
  context.api_getFeeRefundRequestDetail({});
  context.api_processFeeRefundRequests({});
  context.api_calculateFeeRefund({});
  context.api_confirmFeeRefund({});

  assert.strictEqual(seen.length, 15);
  seen.forEach(function (options) {
    assert.strictEqual(options.requireLogin, true, options.operation + ' must require login');
    assert.strictEqual(typeof options.parse, 'function');
    assert.strictEqual(typeof options.service, 'function');
  });
}

function run_() {
  testFeeRateResolution_();
  testAuditAttribution_();
  testPayerCreateAndUpdate_();
  testMaskedPayerList_();
  testPaymentReads_();
  testPaymentApprovalAndDuplicatePrevention_();
  testPaymentRejectAndConfirm_();
  testRefundableBalance_();
  testMaskedRefundList_();
  testRefundApprovalAndDuplicatePrevention_();
  testRefundRejectAndConfirm_();
  testStudentFeeSummary_();
  testApiRequiresLogin_();
  console.log('Student Fee behavior regression tests passed.');
}

run_();
