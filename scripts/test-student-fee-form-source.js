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
  // feePayers upsert는 별도 테스트(test-student-fee.js)에서 검증하므로 여기서는 no-op으로 stub 처리한다.
  context.upsertFeePayerFromApplication_ = () => null;
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
    // feePayers upsert는 별도 테스트(test-student-fee.js)에서 검증하므로 여기서는 no-op으로 stub 처리한다.
    context.upsertFeePayerFromApplication_ = () => null;
    load(context, 'src/000_server/080_student_fee/082_payments/fee_payments_service.gs');
    assert.throws(
      () => context.processFeeApplicationsData_({ ids: ['app-invalid'], action: 'APPROVE' }, { email: 'staff@example.com' }),
      /적용학기수|semesterCount/
    );
  });
})();

function fakeItemResponse(title, response) {
  return {
    getItem: () => ({ getTitle: () => title }),
    getResponse: () => response
  };
}

function fakeFormResponse(overrides) {
  const values = Object.assign({
    id: 'FORM-RESPONSE-001',
    timestamp: new Date('2026-08-19T12:30:00.000Z'),
    items: [
      fakeItemResponse('학번', '20261001'),
      fakeItemResponse('성명', '김학생'),
      fakeItemResponse('소속', '경영정보학과'),
      fakeItemResponse('납입날짜', '2026-08-19'),
      fakeItemResponse('현재학년', '2학년'),
      fakeItemResponse('현재학기', '1학기'),
      fakeItemResponse('납부유형', '일반 납부'),
      fakeItemResponse('학생카드캡쳐', ['https://drive.google.com/open?id=STUDENT_CARD_FILE']),
      fakeItemResponse('입금내역캡쳐', ['https://drive.google.com/file/d/DEPOSIT_FILE/view'])
    ]
  }, overrides || {});
  return {
    getId: () => values.id,
    getTimestamp: () => values.timestamp,
    getItemResponses: () => values.items
  };
}

(function testFormMapperNormalizesAuthoritativeResponse() {
  const context = createContext();
  load(context, 'src/000_server/080_student_fee/082_payments/fee_form_mapper.gs');
  const mapped = JSON.parse(JSON.stringify(context.mapStudentFeeFormResponse_(fakeFormResponse())));
  assert.strictEqual(mapped.sourceResponseId, 'FORM-RESPONSE-001');
  assert.strictEqual(mapped.sourceResponseAt, '2026-08-19T12:30:00.000Z');
  assert.strictEqual(mapped.studentId, '20261001');
  assert.strictEqual(mapped.name, '김학생');
  assert.strictEqual(mapped.affiliation, '경영정보학과');
  assert.strictEqual(mapped.paymentDate, '2026-08-19');
  assert.strictEqual(mapped.academicYearLevel, 2);
  assert.strictEqual(mapped.semesterWithinYear, 1);
  assert.strictEqual(mapped.coverageMode, 'STANDARD_REMAINING');
  assert.strictEqual(mapped.studentCardFileId, 'STUDENT_CARD_FILE');
  assert.strictEqual(mapped.depositFileId, 'DEPOSIT_FILE');
})();

(function testFormMapperCoverageModes() {
  const context = createContext();
  load(context, 'src/000_server/080_student_fee/082_payments/fee_form_mapper.gs');
  const broadFirst = fakeFormResponse({
    id: 'BROAD-FIRST',
    items: [
      fakeItemResponse('학번', '20261002'), fakeItemResponse('성명', '광역학생'), fakeItemResponse('소속', '경영대학'),
      fakeItemResponse('납입날짜', '2026-08-19'), fakeItemResponse('현재학년', '1학년'), fakeItemResponse('현재학기', '1학기'),
      fakeItemResponse('납부유형', '광역 1학년 납부')
    ]
  });
  assert.strictEqual(context.mapStudentFeeFormResponse_(broadFirst).coverageMode, 'BROAD_FIRST_YEAR');

  const broadAfter = fakeFormResponse({
    id: 'BROAD-AFTER',
    items: [
      fakeItemResponse('학번', '20261002'), fakeItemResponse('성명', '광역학생'), fakeItemResponse('소속', '경영정보학과'),
      fakeItemResponse('납입날짜', '2027-03-02'), fakeItemResponse('현재학년', '2학년'), fakeItemResponse('현재학기', '1학기'),
      fakeItemResponse('납부유형', '광역 학과확정 추가납부')
    ]
  });
  assert.strictEqual(context.mapStudentFeeFormResponse_(broadAfter).coverageMode, 'BROAD_AFTER_ASSIGNMENT');
})();

(function testFormMapperRejectsMissingRequiredData() {
  const context = createContext();
  load(context, 'src/000_server/080_student_fee/082_payments/fee_form_mapper.gs');
  assert.throws(() => context.mapStudentFeeFormResponse_(fakeFormResponse({ id: '' })), /원본응답ID|Response ID/);
  assert.throws(() => context.mapStudentFeeFormResponse_(fakeFormResponse({
    items: [fakeItemResponse('성명', '이름만 있음')]
  })), /학번/);
  assert.throws(() => context.mapStudentFeeFormResponse_(fakeFormResponse({
    items: [
      fakeItemResponse('학번', '20261001'), fakeItemResponse('성명', '김학생'), fakeItemResponse('소속', '경영정보학과'),
      fakeItemResponse('납입날짜', '2026-08-19'), fakeItemResponse('현재학년', '5학년'), fakeItemResponse('현재학기', '1학기'),
      fakeItemResponse('납부유형', '일반 납부')
    ]
  })), /현재학년/);
})();

(function testFormReaderIsReadOnly() {
  const context = createContext();
  const responses = [fakeFormResponse()];
  let openedId = '';
  context.FormApp = {
    openById: (formId) => {
      openedId = formId;
      return { getResponses: () => responses };
    }
  };
  load(context, 'src/000_server/080_student_fee/082_payments/fee_form_reader.gs');
  const result = context.readStudentFeeFormResponses_('FORM-ID-001');
  assert.strictEqual(openedId, 'FORM-ID-001');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].getId(), 'FORM-RESPONSE-001');
})();

console.log('Student Fee Form source and coverage contract: PASS');
