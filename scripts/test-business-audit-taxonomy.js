const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const backendRoot = path.join(root, 'src/backend');
const auditPath = path.join(backendRoot, 'core/audit/business_audit.gs');
assert.ok(fs.existsSync(auditPath), 'business_audit.gs must exist');

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return [];
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

const captured = [];
const sandbox = {
  console,
  Utilities: { getUuid: () => 'AUD-UUID' },
  getCurrentIsoDateTime_: () => '2026-08-19T18:00:00+09:00',
  getOperationDbSchema_: () => ({
    businessAuditLogs: {}, events: {}, feePayers: {}, feeApplications: {}, feePayments: {},
    feeRefundRequests: {}, feeRefunds: {}, ledger: {}, evidence: {}, bankTransactions: {},
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

sandbox.writeBusinessAudit_({
  actorEmail: ' user@example.com ',
  actionType: 'UPDATE',
  targetType: 'events',
  targetId: 'EVT-001',
  beforeValue: { status: '준비' },
  afterValue: { status: '진행중' },
  reason: '상태 변경'
});
assert.strictEqual(captured.length, 1);
assert.strictEqual(captured[0].table, 'businessAuditLogs');
assert.strictEqual(captured[0].row.actorEmail, 'user@example.com');
assert.strictEqual(captured[0].row.actionType, 'UPDATE');
assert.strictEqual(captured[0].row.targetType, 'events');
assert.deepStrictEqual(JSON.parse(captured[0].row.beforeValue), { status: '준비' });
assert.deepStrictEqual(JSON.parse(captured[0].row.afterValue), { status: '진행중' });

const studentFeeDir = path.join(backendRoot, 'domains/student_fee');
const accountingDir = path.join(backendRoot, 'domains/accounting');
const eventDir = path.join(backendRoot, 'domains/event');
const studentFeeFiles = collectFiles(studentFeeDir).filter((file) => file.endsWith('.gs'));
const accountingFiles = collectFiles(accountingDir).filter((file) => file.endsWith('.gs'));
const eventFiles = collectFiles(eventDir).filter((file) => file.endsWith('.gs'));

const studentFeeSource = studentFeeFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
for (const legacyAction of ['생성', '수정', '승인', '반려', '입금확인', '송금확인']) {
  const pattern = new RegExp(`writeStudentFeeAudit_\\(\\s*[^,]+,\\s*['\"]${legacyAction}['\"]`);
  assert.ok(!pattern.test(studentFeeSource), `legacy Student Fee audit action remains: ${legacyAction}`);
}

const accountingSource = accountingFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n');
for (const legacyLiteral of ['PROCESS', 'SETTLEMENT', 'LEDGER', 'EVIDENCE', 'BANK_TRANSACTION', 'RECONCILIATION', 'SETTLEMENT_REPORT']) {
  const pattern = new RegExp(`writeAccountingAudit_\\([\\s\\S]{0,220}?['\"]${legacyLiteral}['\"]`);
  assert.ok(!pattern.test(accountingSource), `legacy Accounting audit literal remains: ${legacyLiteral}`);
}

const eventMutationPath = path.join(eventDir, 'application/events_mutation.gs');
const eventMutationSource = fs.readFileSync(eventMutationPath, 'utf8');
for (const name of ['createEventData_', 'updateEventData_', 'updateEventStatusData_', 'updateEventClosureData_']) {
  assert.ok(functionSource(eventMutationSource, name).includes('writeBusinessAudit_('), `missing Event audit coverage: ${name}`);
}

const applicantsPath = path.join(eventDir, 'application/applicants_mutation.gs');
assert.ok(functionSource(fs.readFileSync(applicantsPath, 'utf8'), 'processApplicantData_').includes('writeBusinessAudit_('), 'missing Event applicant audit coverage');

const formSyncPath = path.join(eventDir, 'application/applicant_form_sync.gs');
assert.ok(functionSource(fs.readFileSync(formSyncPath, 'utf8'), 'applyApplicantFormSyncData_').includes('writeBusinessAudit_('), 'missing Event form sync audit coverage');

const attendancePath = path.join(eventDir, 'application/attendance_mutation.gs');
assert.ok(functionSource(fs.readFileSync(attendancePath, 'utf8'), 'applyAttendanceChangesData_').includes('writeBusinessAudit_('), 'missing Event attendance audit coverage');

const serverFiles = collectFiles(backendRoot).filter((file) => file.endsWith('.gs'));
for (const file of serverFiles) {
  const source = fs.readFileSync(file, 'utf8');
  if (path.resolve(file) !== path.resolve(auditPath)) {
    assert.ok(!source.includes("appendOperationTableRow_('businessAuditLogs'"), `direct audit append outside common service: ${path.relative(root, file)}`);
  }
  assert.ok(!source.includes("updateOperationTableRow_('businessAuditLogs'"), `audit rows must not be rewritten: ${path.relative(root, file)}`);
  assert.ok(!source.includes("deleteOperationTableRow_('businessAuditLogs'"), `audit rows must not be deleted: ${path.relative(root, file)}`);
}

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

const schemaContext = vm.createContext({ console });
vm.runInContext(fs.readFileSync(path.join(backendRoot, 'app/config/config.gs'), 'utf8'), schemaContext);
vm.runInContext(fs.readFileSync(path.join(backendRoot, 'core/db/schema/operation_db_schema.gs'), 'utf8'), schemaContext);
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