var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var file = path.join(ROOT, 'src/000_server/020_schema/operation_db_integrity.gs');
var context = vm.createContext({
  console: console,
  String: String, Object: Object, Array: Array,
  validateDuplicateKeys_: function (tableName, rows, columns) {
    var seen = {};
    var issues = [];
    rows.forEach(function (row) {
      var values = columns.map(function (column) { return String(row[column] || '').trim().toLowerCase(); });
      if (values.some(function (value) { return !value; })) return;
      var key = values.join('|');
      if (seen[key]) issues.push({ code: 'DUPLICATE_KEY', table: tableName, column: columns.join('+'), key: key });
      else seen[key] = true;
    });
    return issues;
  }
});
vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });

assert.strictEqual(typeof context.validateOperationDbBusinessKeys_, 'function', 'business-key validator must exist');
var schema = {
  eventForms: { name: '행사폼', fields: { eventId: '행사ID' } },
  feePayments: { name: '납부내역', fields: { applicationId: '납부신청ID' } },
  feeRefunds: { name: '환불내역', fields: { requestId: '환불신청ID' } },
  eventApplications: { name: '행사신청', fields: { sourceResponseId: '원본응답ID' } }
};
var tables = {
  eventForms: [{ 행사ID: 'E1' }, { 행사ID: 'E1' }],
  feePayments: [{ 납부신청ID: 'A1' }, { 납부신청ID: 'A1' }],
  feeRefunds: [{ 환불신청ID: 'R1' }, { 환불신청ID: 'R1' }],
  eventApplications: [{ 원본응답ID: '' }, { 원본응답ID: '' }, { 원본응답ID: 'S1' }, { 원본응답ID: 'S1' }]
};
var issues = context.validateOperationDbBusinessKeys_(schema, tables);
assert.strictEqual(issues.length, 4);
assert.ok(issues.every(function (issue) { return issue.code === 'DUPLICATE_BUSINESS_KEY'; }));
assert.deepStrictEqual(issues.map(function (issue) { return issue.table; }).sort(), ['납부내역', '행사신청', '행사폼', '환불내역'].sort());

console.log('OperationDB business-key integrity contract passed.');
