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
    businessAuditLogs: {},
    events: {},
    feePayers: {},
    feeApplications: {},
    feePayments: {},
    feeRefundRequests: {},
    feeRefunds: {},
    ledger: {},
    ledgerEvidence: {},
    bankTransactions: {},
    reconciliations: {},
    settlementReports: {},
    eventApplications: {},
    eventForms: {},
    eventAttendance: {}
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
assert.strictEqual(captured[0].row.targetId, 'EVT-001');
assert.deepStrictEqual(JSON.parse(captured[0].row.beforeValue), { status: '준비' });
assert.deepStrictEqual(JSON.parse(captured[0].row.afterValue), { status: '진행중' });

console.log('business audit taxonomy contract: PASS');
