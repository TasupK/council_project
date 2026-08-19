const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const schemaPath = path.join(root, 'src/000_server/020_schema/operation_db_schema.gs');
const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/000_server/010_core/config.gs'), 'utf8'), context);
vm.runInContext(fs.readFileSync(schemaPath, 'utf8'), context);

const schema = context.getOperationDbSchema_();
const managerTables = [
  'feePayers', 'feeApplications', 'feePayments', 'feeRefundRequests',
  'feeRefunds', 'events', 'eventApplications', 'eventPayments',
  'eventAttendance', 'eventSettlements', 'eventRefunds', 'ledger',
  'evidence', 'reconciliation', 'settlementReports'
];

managerTables.forEach((tableKey) => {
  const table = schema[tableKey];
  assert.ok(table, `missing schema table: ${tableKey}`);
  assert.strictEqual(table.fields.managerEmail, '담당자이메일', `${tableKey}.managerEmail must map to 담당자이메일`);
  assert.ok(!Object.prototype.hasOwnProperty.call(table.fields, 'managerId'), `${tableKey} must not expose managerId`);
  assert.ok(table.foreignKeys.some((fk) =>
    fk.field === 'managerEmail' &&
    fk.refDatabase === 'user' &&
    fk.refTable === 'users' &&
    fk.refField === 'email'
  ), `${tableKey} must FK managerEmail to user.users.email`);
});

assert.strictEqual(schema.businessAuditLogs.fields.actorEmail, '처리자이메일');
assert.deepStrictEqual(JSON.parse(JSON.stringify(schema.semesters.allowedTypes)), ['1학기', '2학기']);

const schemaSource = fs.readFileSync(schemaPath, 'utf8');
assert.ok(!/managerId\s*:\s*['"]담당자ID['"]/.test(schemaSource), 'operation schema must not define managerId: 담당자ID');
assert.ok(!schemaSource.includes("'담당자ID'"), 'physical 담당자ID must not remain in operation schema field definitions');

console.log('Operation user FK and semester normalization contract: PASS');
