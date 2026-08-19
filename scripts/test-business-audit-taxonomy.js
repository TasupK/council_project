const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const auditPath = path.join(root, 'src/000_server/010_core/business_audit.gs');
assert.ok(fs.existsSync(auditPath), 'business_audit.gs must exist');

const captured = [];
const sandbox = {
  console,
  Utilities: { getUuid: () => 'AUD-UUID' },
  getCurrentIsoDateTime_: () => '2026-08-19T18:00:00+09:00',
  getOperationDbSchema_: () => ({
    businessAuditLogs: {}, events: {}, feePayers: {}, feeApplications: {}, feePayments: {},
    feeRefundRequests: {}, feeRefunds: {}, ledger: {}, ledgerEvidence: {}, bankTransactions: {},
    reconciliations: {}, settlementReports: {}, eventApplications: {}, eventForms: {}, eventAttendance: {}
  }),
  appendOperationTableRow_: (table, row) => {
    captured.push({ table, row });
    return row;
  }
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(auditPath, 'utf8'), sandbox, { filename: auditPath });

assert.strictEqual(sandbox.assertBusinessAuditAction_('CREATE'), 'CREATE');
assert.throws(() => sandbox.assertBusinessAuditAction_('생성'), /지원하지 않는 감사 행위/);
assert.strictEqual(sandbox.assertBusinessAuditTarget_('events'), 'events');
assert.throws(() => sandbox.assertBusinessAuditTarget_('EVENT'), /지원하지 않는 감사 대상/);
assert.strictEqual(JSON.parse(sandbox.serializeBusinessAuditValue_(undefined)), null);
assert.deepStrictEqual(JSON.parse(sandbox.serializeBusinessAuditValue_({ status: '승인' })), { status: '승인' });

sandbox.writeBusinessAudit_({
  actorEmail: ' user@example.com ', actionType: 'UPDATE', targetType: 'events', targetId: 'EVT-001',
  beforeValue: { status: '준비' }, afterValue: { status: '진행중' }, reason: '상태 변경'
});
assert.strictEqual(captured.length, 1);
assert.strictEqual(captured[0].table, 'businessAuditLogs');
assert.strictEqual(captured[0].row.actorEmail, 'user@example.com');
assert.strictEqual(captured[0].row.actionType, 'UPDATE');
assert.strictEqual(captured[0].row.targetType, 'events');
assert.strictEqual(captured[0].row.targetId, 'EVT-001');
assert.deepStrictEqual(JSON.parse(captured[0].row.beforeValue), { status: '준비' });
assert.deepStrictEqual(JSON.parse(captured[0].row.afterValue), { status: '진행중' });

function collectFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full) : [full];
  });
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `function not found: ${name}`);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next >= 0 ? next : source.length);
}

const studentFeeDir = path.join(root, 'src/000_server/080_student_fee');
const studentFeeFiles = collectFiles(studentFeeDir).filter((file) => file.endsWith('.gs'));
const studentFeeSource = studentFeeFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
for (const legacyAction of ['생성', '수정', '승인', '반려', '입금확인', '송금확인']) {
  const pattern = new RegExp(`writeStudentFeeAudit_\\(\\s*[^,]+,\\s*['\"]${legacyAction}['\"]`);
  assert.ok(!pattern.test(studentFeeSource), `legacy Student Fee audit action remains: ${legacyAction}`);
}
for (const file of studentFeeFiles) {
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(!source.includes("appendOperationTableRow_('businessAuditLogs'"), `direct businessAuditLogs append remains: ${path.relative(root, file)}`);
}

const accountingDir = path.join(root, 'src/000_server/060_accounting');
const accountingFiles = collectFiles(accountingDir).filter((file) => file.endsWith('.gs'));
const accountingSource = accountingFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
for (const legacyLiteral of ['PROCESS', 'SETTLEMENT', 'LEDGER', 'EVIDENCE', 'BANK_TRANSACTION', 'RECONCILIATION', 'SETTLEMENT_REPORT']) {
  const pattern = new RegExp(`writeAccountingAudit_\\([\\s\\S]{0,220}?['\"]${legacyLiteral}['\"]`);
  assert.ok(!pattern.test(accountingSource), `legacy Accounting audit literal remains: ${legacyLiteral}`);
}
for (const file of accountingFiles) {
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(!source.includes("appendOperationTableRow_('businessAuditLogs'"), `direct businessAuditLogs append remains: ${path.relative(root, file)}`);
}

const eventsServicePath = path.join(root, 'src/000_server/050_event/051_events/events_service.gs');
const eventsServiceSource = fs.readFileSync(eventsServicePath, 'utf8');
for (const name of ['createEventData_', 'updateEventData_', 'updateEventStatusData_', 'updateEventClosureData_']) {
  assert.ok(functionSource(eventsServiceSource, name).includes('writeBusinessAudit_('), `missing Event audit coverage: ${name}`);
}

const applicantsServicePath = path.join(root, 'src/000_server/050_event/052_applicants/applicants_service.gs');
const applicantsServiceSource = fs.readFileSync(applicantsServicePath, 'utf8');
assert.ok(functionSource(applicantsServiceSource, 'processApplicantData_').includes('writeBusinessAudit_('), 'missing Event applicant audit coverage');

const formSyncServicePath = path.join(root, 'src/000_server/050_event/052_applicants/applicants_form_sync_service.gs');
const formSyncServiceSource = fs.readFileSync(formSyncServicePath, 'utf8');
assert.ok(functionSource(formSyncServiceSource, 'applyApplicantFormSyncData_').includes('writeBusinessAudit_('), 'missing Event form sync audit coverage');

const attendanceServicePath = path.join(root, 'src/000_server/050_event/054_attendance/attendance_service.gs');
const attendanceServiceSource = fs.readFileSync(attendanceServicePath, 'utf8');
assert.ok(functionSource(attendanceServiceSource, 'applyAttendanceChangesData_').includes('writeBusinessAudit_('), 'missing Event attendance audit coverage');

// Attendance mutation behavior: one canonical audit event per changed attendance row.
(function testAttendanceAuditBehavior() {
  let attendance = { id: 'ATT-1', applicationId: 'APP-1', status: '미확인', managerEmail: 'old@example.com' };
  const audits = [];
  const ctx = vm.createContext({
    console, Object, Array, String, Number, Boolean, JSON,
    EVENT_ATTENDANCE_STATUSES: ['미확인', '출석', '결석'],
    Utilities: { getUuid: () => 'ATT-NEW' },
    requireEventRequestId_: () => 'EVT-1',
    requireEventText_: (value) => String(value || '').trim(),
    validateEventChoice_: () => true,
    throwEventError_: (code, message) => { const error = new Error(message); error.code = code; throw error; },
    readActiveUserEmailFromSession_: () => 'staff@example.com',
    getCurrentIsoDateTime_: () => '2026-08-19T18:30:00+09:00',
    withOperationWriteLock_: (fn) => fn(),
    findEventApplicationRowById_: () => ({ id: 'APP-1', eventId: 'EVT-1' }),
    findEventAttendanceRowByApplicationId_: () => attendance,
    findEventAttendanceRowById_: () => attendance,
    updateEventAttendanceRowById_: (id, patch) => { attendance = Object.assign({}, attendance, patch); },
    insertEventAttendanceRow_: (row) => { attendance = Object.assign({}, row); },
    withoutInternalRowNumber_: (row) => row && Object.assign({}, row),
    writeBusinessAudit_: (event) => { audits.push(event); return event; }
  });
  vm.runInContext(fs.readFileSync(attendanceServicePath, 'utf8'), ctx, { filename: attendanceServicePath });
  const result = ctx.applyAttendanceChangesData_({ id: 'EVT-1', items: [{ applicationId: 'APP-1', status: '출석' }] });
  assert.strictEqual(result[0].status, '출석');
  assert.strictEqual(result[0].managerEmail, 'staff@example.com');
  assert.strictEqual(audits.length, 1);
  assert.strictEqual(audits[0].actionType, 'CONFIRM');
  assert.strictEqual(audits[0].targetType, 'eventAttendance');
  assert.strictEqual(audits[0].targetId, 'ATT-1');
  assert.strictEqual(audits[0].beforeValue.status, '미확인');
  assert.strictEqual(audits[0].afterValue.status, '출석');
})();

// Repository-wide architecture guard: only the common service may write the audit table directly.
const serverRoot = path.join(root, 'src/000_server');
const serverFiles = collectFiles(serverRoot).filter((file) => file.endsWith('.gs'));
for (const file of serverFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (path.resolve(file) !== path.resolve(auditPath)) {
    assert.ok(!source.includes("appendOperationTableRow_('businessAuditLogs'"), `direct audit append outside common service: ${path.relative(root, file)}`);
  }
  assert.ok(!source.includes("updateOperationTableRow_('businessAuditLogs'"), `legacy audit rows must not be rewritten: ${path.relative(root, file)}`);
  assert.ok(!source.includes("deleteOperationTableRow_('businessAuditLogs'"), `legacy audit rows must not be deleted: ${path.relative(root, file)}`);
}

// Canonical action/target guard for executable audit call sites only.
const allServerSource = serverFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
const legacyActions = ['수기등록', '폼접수', '폼접수실패', '생성', '수정', '승인', '반려', '입금확인', '송금확인', 'PROCESS', 'SETTLEMENT'];
const legacyTargets = ['LEDGER', 'EVIDENCE', 'BANK_TRANSACTION', 'RECONCILIATION', 'SETTLEMENT_REPORT'];
for (const value of legacyActions) {
  const objectPattern = new RegExp(`actionType\\s*:\\s*['\"]${value}['\"]`);
  const wrapperPattern = new RegExp(`write(?:Accounting|StudentFee)Audit_\\(\\s*[^,]+,\\s*['\"]${value}['\"]`);
  assert.ok(!objectPattern.test(allServerSource) && !wrapperPattern.test(allServerSource), `legacy audit action remains: ${value}`);
}
for (const value of legacyTargets) {
  const objectPattern = new RegExp(`targetType\\s*:\\s*['\"]${value}['\"]`);
  const wrapperPattern = new RegExp(`write(?:Accounting|StudentFee)Audit_\\(\\s*[^,]+,\\s*['\"][^'\"]+['\"]\\s*,\\s*['\"]${value}['\"]`);
  assert.ok(!objectPattern.test(allServerSource) && !wrapperPattern.test(allServerSource), `legacy audit target remains: ${value}`);
}

// Physical schema remains the original nine columns; this feature requires no sheet migration.
const schemaContext = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(root, 'src/000_server/010_core/config.gs'), 'utf8'), schemaContext);
vm.runInContext(fs.readFileSync(path.join(root, 'src/000_server/020_schema/operation_db_schema.gs'), 'utf8'), schemaContext);
const auditFields = JSON.parse(JSON.stringify(schemaContext.getOperationDbSchema_().businessAuditLogs.fields));
assert.deepStrictEqual(auditFields, {
  id: '로그ID',
  occurredAt: '발생일시',
  actorEmail: '처리자이메일',
  actionType: '행위구분',
  targetType: '대상구분',
  targetId: '대상ID',
  beforeValue: '변경전값',
  afterValue: '변경후값',
  reason: '처리사유'
});
assert.strictEqual(Object.keys(auditFields).length, 9);

console.log('business audit taxonomy contract: PASS');
