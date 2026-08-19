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
    isFinite
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

console.log('Student Fee Form source and coverage contract: PASS');
