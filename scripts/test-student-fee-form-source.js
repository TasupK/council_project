const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');

function load(context, relativePath) {
  const filePath = path.join(root, relativePath);
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
}

function createContext() {
  const context = vm.createContext({
    console,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    Date,
    JSON,
    isFinite,
    Utilities: { getUuid: () => 'uuid-test' },
    withOperationWriteLock_: (fn) => fn()
  });
  load(context, 'src/000_server/010_core/config.gs');
  return context;
}

(function testFeeApplicationSchemaContract() {
  const context = createContext();
  load(context, 'src/000_server/020_schema/operation_db_schema.gs');
  const feeApplications = context.getOperationDbSchema_().feeApplications;
  assert.ok(feeApplications, 'feeApplications schema is required');
  assert.strictEqual(feeApplications.fields.sourceResponseId, '원본응답ID');
  assert.strictEqual(feeApplications.fields.sourceResponseAt, '원본응답일시');
  assert.strictEqual(feeApplications.fields.importedAt, '가져온일시');
  assert.strictEqual(feeApplications.fields.startSemesterId, '적용시작학기ID');
  assert.strictEqual(feeApplications.fields.semesterCount, '적용학기수');
  assert.ok(!Object.prototype.hasOwnProperty.call(feeApplications.fields, 'semesterNumber'));
  assert.ok(feeApplications.foreignKeys.some((fk) =>
    fk.field === 'startSemesterId' &&
    fk.refDatabase === 'operation' &&
    fk.refTable === 'semesters' &&
    fk.refField === 'id'
  ), 'feeApplications.startSemesterId must FK semesters.id');
})();

(function testCoveragePolicy() {
  const context = createContext();
  load(context, 'src/000_server/080_student_fee/080_common/student_fee_coverage_policy.gs');

  function coverage(input) {
    return JSON.parse(JSON.stringify(context.calculateStudentFeeCoverage_(input)));
  }

  assert.deepStrictEqual(coverage({
    currentSemesterId: '20261',
    academicYearLevel: 1,
    semesterWithinYear: 1,
    coverageMode: 'STANDARD_REMAINING'
  }), { startSemesterId: '20261', semesterCount: 8 });

  assert.strictEqual(coverage({
    currentSemesterId: '20271',
    academicYearLevel: 2,
    semesterWithinYear: 1,
    coverageMode: 'STANDARD_REMAINING'
  }).semesterCount, 6);

  assert.strictEqual(coverage({
    currentSemesterId: '20284',
    academicYearLevel: 4,
    semesterWithinYear: 2,
    coverageMode: 'STANDARD_REMAINING'
  }).semesterCount, 1);

  assert.strictEqual(coverage({
    currentSemesterId: '20261',
    academicYearLevel: 1,
    semesterWithinYear: 1,
    coverageMode: 'BROAD_FIRST_YEAR'
  }).semesterCount, 2);

  assert.strictEqual(coverage({
    currentSemesterId: '20271',
    academicYearLevel: 2,
    semesterWithinYear: 1,
    coverageMode: 'BROAD_AFTER_ASSIGNMENT'
  }).semesterCount, 6);

  assert.throws(() => context.calculateStudentFeeCoverage_({
    currentSemesterId: '20261', academicYearLevel: 0, semesterWithinYear: 1, coverageMode: 'STANDARD_REMAINING'
  }), /academicYearLevel/);
  assert.throws(() => context.calculateStudentFeeCoverage_({
    currentSemesterId: '20261', academicYearLevel: 1, semesterWithinYear: 3, coverageMode: 'STANDARD_REMAINING'
  }), /semesterWithinYear/);
  assert.throws(() => context.calculateStudentFeeCoverage_({
    currentSemesterId: '20261', academicYearLevel: 2, semesterWithinYear: 1, coverageMode: 'BROAD_FIRST_YEAR'
  }), /1학년/);
  assert.throws(() => context.calculateStudentFeeCoverage_({
    currentSemesterId: '20261', academicYearLevel: 1, semesterWithinYear: 1, coverageMode: 'UNKNOWN'
  }), /coverageMode/);
})();

(function testApprovalUsesFullCoverageAmount() {
  const context = createContext();
  let application = { id: 'app-1', paymentDate: '2026-08-10', semesterCount: 6, status: '접수' };
  let inserted = null;
  context.findFeeApplicationRowById_ = () => application;
  context.findFeePaymentRowByApplicationId_ = () => inserted;
  context.updateFeeApplicationRowById_ = (id, changes) => { application = Object.assign({}, application, changes); };
  context.insertFeePaymentRow_ = (row) => { inserted = JSON.parse(JSON.stringify(row)); return row; };
  context.resolveStudentFeeRate_ = () => ({ amountPerSemester: 20000 });
  context.getCurrentIsoDateTime_ = () => '2026-08-19T23:00:00+09:00';
  context.writeStudentFeeAudit_ = () => {};
  load(context, 'src/000_server/080_student_fee/082_payments/fee_payments_service.gs');

  context.processFeeApplicationsData_({ ids: ['app-1'], action: 'APPROVE' }, { email: 'staff@example.com' });
  assert.strictEqual(inserted.amount, 120000, 'approval amount must be rate * semesterCount');
})();

(function testApprovalRejectsInvalidCoverageCount() {
  [undefined, '', 0, 1.5, 9].forEach((semesterCount) => {
    const context = createContext();
    const application = { id: 'app-invalid', paymentDate: '2026-08-10', semesterCount, status: '접수' };
    context.findFeeApplicationRowById_ = () => application;
    context.findFeePaymentRowByApplicationId_ = () => null;
    context.updateFeeApplicationRowById_ = () => {};
    context.insertFeePaymentRow_ = () => { throw new Error('must not insert invalid payment'); };
    context.resolveStudentFeeRate_ = () => ({ amountPerSemester: 20000 });
    context.getCurrentIsoDateTime_ = () => '2026-08-19T23:00:00+09:00';
    context.writeStudentFeeAudit_ = () => {};
    load(context, 'src/000_server/080_student_fee/082_payments/fee_payments_service.gs');
    assert.throws(
      () => context.processFeeApplicationsData_({ ids: ['app-invalid'], action: 'APPROVE' }, { email: 'staff@example.com' }),
      /적용학기수|semesterCount/
    );
  });
})();

console.log('Student Fee Form source and coverage contract: PASS');
