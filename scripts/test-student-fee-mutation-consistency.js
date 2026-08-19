var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');

function load(file, extra) {
  var state = {
    lockCount: 0,
    applicationUpdates: [],
    payments: [],
    refundRequestUpdates: [],
    refunds: [],
    audits: []
  };
  var ctx = vm.createContext(Object.assign({
    console: console,
    Error: Error,
    String: String,
    Number: Number,
    Object: Object,
    Array: Array,
    Utilities: { getUuid: function () { return 'UUID-' + Math.random(); } },
    getCurrentIsoDateTime_: function () { return '2026-08-18T21:00:00+09:00'; },
    withOperationWriteLock_: function (fn) { state.lockCount += 1; return fn(); },
    writeStudentFeeAudit_: function () { state.audits.push([].slice.call(arguments)); }
  }, extra || {}));
  vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
  return { ctx: ctx, state: state };
}

(function testPaymentBatchPrevalidation() {
  var rows = {
    A: { id: 'A', status: '접수', paymentDate: '2026-03-01', semesterCount: 1 },
    B: { id: 'B', status: '승인', paymentDate: '2026-03-01', semesterCount: 1 }
  };
  var h = load('src/000_server/080_student_fee/082_payments/fee_payments_service.gs', {
    findFeeApplicationRowById_: function (id) { return rows[id] || null; },
    findFeePaymentRowByApplicationId_: function () { return null; },
    resolveStudentFeeRate_: function () { return { amountPerSemester: 10000 }; },
    updateFeeApplicationRowById_: function (id, changes) { h.state.applicationUpdates.push([id, changes]); },
    insertFeePaymentRow_: function (row) { h.state.payments.push(row); },
    findFeePaymentRowById_: function () { return null; },
    updateFeePaymentRowById_: function () {}
  });
  assert.throws(function () {
    h.ctx.processFeeApplicationsData_({ ids: ['A', 'B'], action: 'APPROVE' }, { email: 'admin@example.com' });
  }, /이미 처리된 납부신청/);
  assert.strictEqual(h.state.lockCount, 1, 'batch approval must use one write lock');
  assert.strictEqual(h.state.applicationUpdates.length, 0, 'no application may be written before all batch items validate');
  assert.strictEqual(h.state.payments.length, 0, 'no payment may be inserted before all batch items validate');
})();

(function testPaymentDuplicateCheckInsideLock() {
  var inLock = false;
  var h = load('src/000_server/080_student_fee/082_payments/fee_payments_service.gs', {
    withOperationWriteLock_: function (fn) { h.state.lockCount += 1; inLock = true; try { return fn(); } finally { inLock = false; } },
    findFeeApplicationRowById_: function () { assert.ok(inLock, 'application re-read must occur inside lock'); return { id: 'A', status: '접수', paymentDate: '2026-03-01', semesterCount: 1 }; },
    findFeePaymentRowByApplicationId_: function () { assert.ok(inLock, 'duplicate payment check must occur inside lock'); return { id: 'EXISTING' }; },
    resolveStudentFeeRate_: function () { return { amountPerSemester: 10000 }; },
    updateFeeApplicationRowById_: function () { throw new Error('must not write'); },
    insertFeePaymentRow_: function () { throw new Error('must not insert'); },
    findFeePaymentRowById_: function () { return null; },
    updateFeePaymentRowById_: function () {}
  });
  assert.throws(function () {
    h.ctx.processFeeApplicationsData_({ ids: ['A'], action: 'APPROVE' }, { email: 'admin@example.com' });
  }, /이미 생성된 납부내역/);
})();

(function testRefundBatchPrevalidation() {
  var rows = {
    R1: { id: 'R1', status: '접수', paymentId: 'P1' },
    R2: { id: 'R2', status: '반려', paymentId: 'P2' }
  };
  var h = load('src/000_server/080_student_fee/083_refunds/fee_refunds_service.gs', {
    findFeeRefundRequestRowById_: function (id) { return rows[id] || null; },
    findFeeRefundRowByRequestId_: function () { return null; },
    calculateRefundableAmount_: function () { return 10000; },
    parseStudentFeeAmount_: function (value) { return Number(value); },
    updateFeeRefundRequestRowById_: function (id, changes) { h.state.refundRequestUpdates.push([id, changes]); },
    insertFeeRefundRow_: function (row) { h.state.refunds.push(row); },
    findFeeRefundRowById_: function () { return null; },
    updateFeeRefundRowById_: function () {}
  });
  assert.throws(function () {
    h.ctx.processFeeRefundRequestsData_({ ids: ['R1', 'R2'], action: 'APPROVE' }, { email: 'admin@example.com' });
  }, /이미 처리된 환불신청/);
  assert.strictEqual(h.state.lockCount, 1, 'refund batch must use one write lock');
  assert.strictEqual(h.state.refundRequestUpdates.length, 0, 'refund request writes must wait for full validation');
  assert.strictEqual(h.state.refunds.length, 0, 'refund insert must wait for full validation');
})();

console.log('Student Fee mutation consistency contract passed.');
