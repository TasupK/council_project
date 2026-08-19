const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
function load(ctx, relative) {
  const file = path.join(ROOT, relative);
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: relative });
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }

function makeHarness(dtos, existingRows) {
  const state = {
    rows: (existingRows || []).map(plain),
    audits: [],
    lastSyncedAt: '',
    lockCount: 0,
    uuid: 0
  };
  const responses = (dtos || []).map((dto) => ({ _dto: dto }));
  const ctx = vm.createContext({
    console,
    Object, Array, String, Number, Boolean, Math, Date, JSON, isFinite,
    Utilities: { getUuid: () => 'APP-' + (++state.uuid) },
    getCurrentIsoDateTime_: () => '2026-08-19T23:30:00+09:00',
    isTruthyValue_: (value) => value === true || String(value).toLowerCase() === 'true',
    withOperationWriteLock_: (fn) => { state.lockCount += 1; return fn(); },
    getStudentFeeFormSettings_: () => ({
      googleFormId: 'FORM-ID', enabled: true, currentSemesterId: '20262', lastSyncedAt: ''
    }),
    updateStudentFeeFormLastSyncedAt_: (value) => { state.lastSyncedAt = value; },
    readStudentFeeFormResponses_: () => responses,
    mapStudentFeeFormResponse_: (response) => response._dto,
    assertValidStudentFeeSemester_: (id) => {
      if (id !== '20262') throw new Error('invalid semester');
      return { id };
    },
    calculateStudentFeeCoverage_: (input) => ({
      startSemesterId: input.currentSemesterId,
      semesterCount: input.coverageMode === 'BROAD_FIRST_YEAR' ? 2 : 7
    }),
    findFeeApplicationRowBySourceResponseId_: (sourceId) => state.rows.find((row) => row.sourceResponseId === sourceId) || null,
    insertFeeApplicationRow_: (row) => { state.rows.push(plain(row)); return row; },
    writeStudentFeeAudit_: (...args) => state.audits.push(plain(args))
  });
  load(ctx, 'src/000_server/080_student_fee/082_payments/fee_form_import_service.gs');
  return { ctx, state };
}

function dto(id, studentId) {
  return {
    sourceResponseId: id,
    sourceResponseAt: '2026-08-19T12:00:00.000Z',
    studentId: studentId || '20261001',
    name: '김학생',
    affiliation: '경영정보학과',
    paymentDate: '2026-08-19',
    academicYearLevel: 1,
    semesterWithinYear: 2,
    coverageMode: 'STANDARD_REMAINING',
    studentCardFileId: 'CARD',
    depositFileId: 'DEPOSIT'
  };
}

(function firstImportCreatesApplicationAndAudit() {
  const h = makeHarness([dto('R1')]);
  const result = plain(h.ctx.syncStudentFeeFormApplicationsData_({}, { email: 'staff@example.com' }));
  assert.strictEqual(result.importedCount, 1);
  assert.strictEqual(result.duplicateCount, 0);
  assert.strictEqual(h.state.rows.length, 1);
  assert.strictEqual(h.state.rows[0].sourceResponseId, 'R1');
  assert.strictEqual(h.state.rows[0].startSemesterId, '20262');
  assert.strictEqual(h.state.rows[0].semesterCount, 7);
  assert.strictEqual(h.state.rows[0].status, '접수');
  assert.strictEqual(h.state.rows[0].managerEmail, '');
  assert.strictEqual(h.state.audits.length, 1);
  assert.strictEqual(h.state.audits[0][1], 'IMPORT');
  assert.strictEqual(h.state.audits[0][2], 'feeApplications');
  assert.strictEqual(h.state.lastSyncedAt, '2026-08-19T23:30:00+09:00');
  assert.strictEqual(h.state.lockCount, 1);
})();

(function duplicateResponseIsNoop() {
  const h = makeHarness([dto('R1')], [{ id: 'OLD', sourceResponseId: 'R1' }]);
  const result = plain(h.ctx.syncStudentFeeFormApplicationsData_({}, { email: 'staff@example.com' }));
  assert.strictEqual(result.importedCount, 0);
  assert.strictEqual(result.duplicateCount, 1);
  assert.strictEqual(h.state.rows.length, 1);
  assert.strictEqual(h.state.audits.length, 0);
})();

(function sameStudentDifferentResponsesRemainDistinct() {
  const h = makeHarness([dto('R1', '20261001'), dto('R2', '20261001')]);
  const result = plain(h.ctx.syncStudentFeeFormApplicationsData_({}, { email: 'staff@example.com' }));
  assert.strictEqual(result.importedCount, 2);
  assert.strictEqual(result.duplicateCount, 0);
  assert.deepStrictEqual(h.state.rows.map((row) => row.sourceResponseId), ['R1', 'R2']);
})();

(function disabledOrInvalidConfigRejectsBeforeImport() {
  const h = makeHarness([dto('R1')]);
  h.ctx.getStudentFeeFormSettings_ = () => ({ googleFormId: 'FORM-ID', enabled: false, currentSemesterId: '20262' });
  assert.throws(() => h.ctx.syncStudentFeeFormApplicationsData_({}, { email: 'staff@example.com' }), /연동.*비활성|비활성/);
  assert.strictEqual(h.state.rows.length, 0);
  assert.strictEqual(h.state.lastSyncedAt, '');
})();

(function apiUsesEditAccessAndAuthenticatedContext() {
  const ctx = vm.createContext({
    console,
    studentFeeApiAccess_: (action) => ({ domain: 'student_fee', action }),
    parseStudentFeeRequest_: (input) => ({ request: input || {} }),
    syncStudentFeeFormApplicationsData_: () => ({ ok: true }),
    apiHandler_: (config) => config
  });
  load(ctx, 'src/000_server/080_student_fee/082_payments/fee_payments_api.gs');
  const config = ctx.api_syncStudentFeeFormApplications({});
  assert.strictEqual(config.requireLogin, true);
  assert.strictEqual(config.access.action, 'edit');
  assert.strictEqual(typeof config.service, 'function');
})();

console.log('Student Fee Form import contract: PASS');
