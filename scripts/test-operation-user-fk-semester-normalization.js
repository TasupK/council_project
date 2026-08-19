const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const schemaPath = path.join(root, 'src/000_server/020_schema/operation_db_schema.gs');
const userSchemaPath = path.join(root, 'src/000_server/020_schema/user_db_schema.gs');
const integrityPath = path.join(root, 'src/000_server/020_schema/operation_db_integrity.gs');
const context = {
  console,
  normalizeTextValue_: value => String(value == null ? '' : value).trim(),
  normalizeIntegrityValue_: value => String(value == null ? '' : value).trim().toLowerCase(),
  buildIntegrityIssue_: (code, table, row, column, message, extra) => ({ code, table, rowNumber: row._rowNumber || '', column, message, ...(extra || {}) }),
  validateForeignKeys_: (tableName, rows, column, refTableName, refRows, refColumn) => {
    const ref = new Set(refRows.map(row => String(row[refColumn] || '').trim().toLowerCase()).filter(Boolean));
    return rows.flatMap(row => {
      const value = String(row[column] || '').trim().toLowerCase();
      return value && !ref.has(value)
        ? [{ code: 'FOREIGN_KEY_NOT_FOUND', table: tableName, rowNumber: row._rowNumber || '', column, value }]
        : [];
    });
  }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/000_server/010_core/config.gs'), 'utf8'), context);
vm.runInContext(fs.readFileSync(userSchemaPath, 'utf8'), context);
vm.runInContext(fs.readFileSync(schemaPath, 'utf8'), context);
vm.runInContext(fs.readFileSync(integrityPath, 'utf8'), context);

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

function collectGsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectGsFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.gs') ? [fullPath] : [];
  });
}

const serverRoot = path.join(root, 'src/000_server');
const staleManagerRefs = [];
collectGsFiles(serverRoot).forEach((filePath) => {
  if (filePath === schemaPath) return;
  const source = fs.readFileSync(filePath, 'utf8');
  const patterns = [
    /fields\.managerId\b/,
    /\bmanagerId\s*:/,
    /\bmanagerId\b/
  ];
  if (patterns.some((pattern) => pattern.test(source))) {
    staleManagerRefs.push(path.relative(root, filePath));
  }
});

assert.deepStrictEqual(staleManagerRefs, [], `stale server managerId references:\n${staleManagerRefs.join('\n')}`);
assert.strictEqual(typeof context.validateOperationDbReferenceRules_, 'function');

const referenceIssues = context.validateOperationDbReferenceRules_(schema, {
  businessAuditLogs: [
    { _rowNumber: 2, '처리자이메일': 'mihy5012@mju.ac.kr' },
    { _rowNumber: 3, '처리자이메일': 'ghost@example.com' }
  ],
  semesters: [
    { _rowNumber: 2, '학기ID': '20261', '학년도': 2026, '학기구분': '1학기' },
    { _rowNumber: 3, '학기ID': '20262', '학년도': 2026, '학기구분': '2학기' },
    { _rowNumber: 4, '학기ID': '20263', '학년도': 2026, '학기구분': '여름계절' }
  ]
}, [
  { 'Google이메일': 'mihy5012@mju.ac.kr' }
]);

assert.ok(referenceIssues.some(issue => issue.code === 'FOREIGN_KEY_NOT_FOUND' && issue.table === '업무감사로그' && issue.rowNumber === 3));
assert.ok(referenceIssues.some(issue => issue.code === 'INVALID_SEMESTER_TYPE' && issue.table === '학기기준' && issue.rowNumber === 4));
assert.ok(!referenceIssues.some(issue => issue.rowNumber === 2 && issue.code === 'FOREIGN_KEY_NOT_FOUND'));

console.log('Operation user FK and semester normalization contract: PASS');
