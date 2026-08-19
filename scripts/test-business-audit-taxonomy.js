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
  const pattern = new RegExp(`writeStudentFeeAudit_\\([\\s\\S]{0,180}?['\"]${legacyAction}['\"]`);
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

console.log('business audit taxonomy contract: PASS');
