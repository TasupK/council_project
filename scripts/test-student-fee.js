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

function loadRequest_(context) {
  load_(context, 'src/000_server/080_student_fee/080_common/student_fee_request.gs');
}

function testFeeRateResolution_() {
  var context = createContext_();
  context.isTruthyValue_ = function (value) { return !!value; };
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
  overlapping.isTruthyValue_ = function (value) { return !!value; };
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
  assert.strictEqual(result.id, 'uuid-test');
  assert.strictEqual(result.actorEmail, 'staff@example.com');
}

function testPayerBehavior_() {
  var context = createContext_();
  var inserted;
  var updated;
  var audits = [];
  loadRequest_(context);
  context.findFeePayerRowById_ = function (id) {
    if (id === 'existing') return { studentId: id };
    if (id === '60201234') return { studentId: id, name: '김학생', affiliation: '경영정보학과', startSemesterId: '2026-1', managerId: 'old', updatedAt: 'old' };
    return null;
  };
  context.assertValidStudentFeeSemester_ = function (id) {
    if (['2026-1', '2026-2'].indexOf(id) < 0) throw new Error('학기기준');
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
  assert.strictEqual(created.managerId, 'staff@example.com');

  var changed = context.updateFeePayerData_({ studentId: '60201234', name: '김수정', affiliation: '경영대학', startSemesterId: '2026-2' }, { email: 'editor@example.com' });
  assert.strictEqual(changed.name, '김수정');
  assert.strictEqual(updated.changes.studentId, undefined);
  assert.strictEqual(updated.changes.managerId, 'editor@example.com');
  assert.strictEqual(audits.length, 2);

  var query = createContext_();
  loadRequest_(query);
  query.findAllFeePayerRows_ = function () {
    return [{ studentId: '60201234', name: '김학생', affiliation: '경영정보학과', startSemesterId: '2026-1', updatedAt: '2026-08-17' }];
  };
  query.findFeePayerRowById_ = function () { return { studentId: '60201234', name: '김학생' }; };
  load_(query, 'src/000_server/080_student_fee/081_payers/fee_payers_query_service.gs');
  var list = query.getFeePayerListData_({ keyword: '김', page: 1, pageSize: 10 });
  assert.strictEqual(list.items[0].studentId, '60****34');
  assert.strictEqual(query.getFeePayerDetailData_({ studentId: '60201234' }).studentId, '60201234');
}

function testPaymentBehavior_() {
  var query = createContext_();
  loadRequest_(query);
  query.findAllFeeApplicationRows_ = function () {
    return [
      { id: 'app-1', studentId: '60201234', name: '김학생', paymentDate: '2026-08-10', semesterNumber: 9, appliedAt: '2026-08-11', status: '접수' },
      { id: 'app-2', studentId: '60205678', name: '이학생', paymentDate: '2026-08-09', appliedAt: '2026-08-12', status: '승인' }
    ];
  };
  query.findAllFeePaymentRows_ = function () { return [{ id: 'pay-2', applicationId: 'app-2', amount: 20000, moneyStatus: '대기' }]; };
  query.findFeeApplicationRowById_ = function () { return query.findAllFeeApplicationRows_()[0]; };
  query.findFeePaymentRowByApplicationId_ = function () { return null; };
  query.resolveStudentFeeRate_ = function () { return { id: 'rate-1', amountPerSemester: 20000 }; };
  load_(query, 'src/000_server/080_student_fee/082_payments/fee_payments_query_service.gs');
  var list = query.getFeeApplicationListData_({ page: 1, pageSize: 10 });
  assert.deepStrictEqual(list.items.map(function (item) { return item.id; }), ['app-2', 'app-1']);
  assert.strictEqual(list.items[0].studentId, '60****78');
  assert.strictEqual(query.calculateFeeAmountData_({ paymentDate: '2026-08-10', semesterNumber: 9 }).amount, 20000);

  var service = createContext_();
  var application = { id: 'app-1', paymentDate: '2026-08-10', status: '접수' };
  var inserted;
  var audits = [];
  service.findFeeApplicationRowById_ = function () { return application; };
  service.findFeePaymentRowByApplicationId_ = function () { return inserted || null; };
  service.updateFeeApplicationRowById_ = function (id, changes) { application = Object.assign({}, application, changes); return true; };
  service.insertFeePaymentRow_ = function (row) { inserted = plain_(row); return row; };
  service.resolveStudentFeeRate_ = function () { return { amountPerSemester: 20000 }; };
  service.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  service.writeStudentFeeAudit_ = function () { audits.push(Array.prototype.slice.call(arguments)); };
  load_(service, 'src/000_server/080_student_fee/082_payments/fee_payments_service.gs');
  var approved = service.processFeeApplicationsData_({ ids: ['app-1'], action: 'APPROVE' }, { email: 'staff@example.com' });
  assert.strictEqual(approved[0].success, true);
  assert.strictEqual(inserted.amount, 20000);
  assert.strictEqual(inserted.moneyStatus, '대기');
  assert.strictEqual(audits.length, 2);
  assert.throws(function () { service.processFeeApplicationsData_({ ids: ['app-1'], action: 'APPROVE' }, { email: 'staff@example.com' }); }, /이미 처리|이미 생성/);

  var confirmation = createContext_();
  var payment = { id: 'pay-1', moneyStatus: '대기', amount: 20000 };
  confirmation.findFeePaymentRowById_ = function () { return payment; };
  confirmation.updateFeePaymentRowById_ = function (id, changes) { payment = Object.assign({}, payment, changes); return true; };
  confirmation.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  confirmation.writeStudentFeeAudit_ = function () {};
  load_(confirmation, 'src/000_server/080_student_fee/082_payments/fee_payments_service.gs');
  var confirmed = confirmation.confirmFeePaymentData_({ paymentId: 'pay-1', result: 'MISMATCH', depositorName: '홍길동' }, { email: 'staff@example.com' });
  assert.strictEqual(confirmed.moneyStatus, '불일치');
  assert.strictEqual(confirmed.depositorName, '홍길동');
}

function testRefundBehavior_() {
  var query = createContext_();
  query.findFeePaymentRowById_ = function () { return { id: 'pay-1', amount: 20000 }; };
  query.findAllFeeRefundRequestRows_ = function () {
    return [
      { id: 'req-1', paymentId: 'pay-1', studentId: '60201234', accountNumber: '1234567890', accountHolder: '김학생', bankName: '은행', appliedAt: '2026-08-17', status: '접수' },
      { id: 'req-2', paymentId: 'pay-1' }
    ];
  };
  query.findAllFeeRefundRows_ = function () {
    return [
      { requestId: 'req-1', approvedAmount: 5000, moneyStatus: '대기' },
      { requestId: 'req-2', approvedAmount: 3000, moneyStatus: '완료' },
      { requestId: 'req-2', approvedAmount: 9999, moneyStatus: '실패' }
    ];
  };
  query.findFeeRefundRequestRowById_ = function () { return query.findAllFeeRefundRequestRows_()[0]; };
  query.findFeeRefundRowByRequestId_ = function () { return null; };
  load_(query, 'src/000_server/080_student_fee/083_refunds/fee_refunds_query_service.gs');
  assert.strictEqual(query.calculateRefundableAmount_('pay-1'), 12000);
  var list = query.getFeeRefundRequestListData_({ page: 1, pageSize: 10 });
  assert.strictEqual(list.items[0].studentId, '60****34');
  assert.notStrictEqual(list.items[0].accountNumber, '1234567890');
  assert.strictEqual(query.getFeeRefundRequestDetailData_({ refundRequestId: 'req-1', hasFullAccess: true }).request.accountNumber, '1234567890');

  var service = createContext_();
  var request = { id: 'req-1', paymentId: 'pay-1', status: '접수' };
  var inserted;
  var audits = [];
  service.findFeeRefundRequestRowById_ = function () { return request; };
  service.findFeeRefundRowByRequestId_ = function () { return inserted || null; };
  service.calculateRefundableAmount_ = function () { return 12000; };
  service.updateFeeRefundRequestRowById_ = function (id, changes) { request = Object.assign({}, request, changes); return true; };
  service.insertFeeRefundRow_ = function (row) { inserted = plain_(row); return row; };
  service.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  service.writeStudentFeeAudit_ = function () { audits.push(Array.prototype.slice.call(arguments)); };
  service.parseStudentFeeAmount_ = function (value, fieldName, minimum) {
    var amount = Number(value);
    if (!isFinite(amount) || amount < minimum) throw new Error(fieldName);
    return amount;
  };
  load_(service, 'src/000_server/080_student_fee/083_refunds/fee_refunds_service.gs');
  var approved = service.processFeeRefundRequestsData_({ ids: ['req-1'], action: 'APPROVE' }, { email: 'staff@example.com' });
  assert.strictEqual(approved[0].refund.approvedAmount, 12000);
  assert.strictEqual(approved[0].refund.moneyStatus, '대기');
  assert.strictEqual(audits.length, 2);

  var confirmation = createContext_();
  var refund = { id: 'ref-1', moneyStatus: '대기' };
  confirmation.findFeeRefundRowById_ = function () { return refund; };
  confirmation.updateFeeRefundRowById_ = function (id, changes) { refund = Object.assign({}, refund, changes); return true; };
  confirmation.getCurrentIsoDateTime_ = function () { return '2026-08-17T21:00:00+09:00'; };
  confirmation.writeStudentFeeAudit_ = function () {};
  load_(confirmation, 'src/000_server/080_student_fee/083_refunds/fee_refunds_service.gs');
  var confirmed = confirmation.confirmFeeRefundData_({ refundId: 'ref-1', result: 'DONE', transferEvidenceId: 'file-1' }, { email: 'staff@example.com' });
  assert.strictEqual(confirmed.moneyStatus, '완료');
  assert.strictEqual(confirmed.transferEvidenceId, 'file-1');
}

function testSummary_() {
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
  [
    'getStudentFeeSummaryData_', 'getFeePayerListData_', 'getFeePayerDetailData_', 'createFeePayerData_', 'updateFeePayerData_',
    'getFeeApplicationListData_', 'getFeeApplicationDetailData_', 'processFeeApplicationsData_', 'calculateFeeAmountData_', 'confirmFeePaymentData_',
    'getFeeRefundRequestListData_', 'getFeeRefundRequestDetailData_', 'processFeeRefundRequestsData_', 'calculateFeeRefundData_', 'confirmFeeRefundData_'
  ].forEach(function (name) { context[name] = function () {}; });
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

testFeeRateResolution_();
testAuditAttribution_();
testPayerBehavior_();
testPaymentBehavior_();
testRefundBehavior_();
testSummary_();
testApiRequiresLogin_();
console.log('Student Fee behavior regression tests passed.');
