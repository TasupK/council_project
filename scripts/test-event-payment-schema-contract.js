var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var schemaPath = path.join(ROOT, 'src/backend/core/db/schema/operation_db_schema.gs');
var source = fs.readFileSync(schemaPath, 'utf8');
var match = source.match(/eventPayments:\s*\{[\s\S]*?fields:\s*\{([\s\S]*?)\}\s*,\s*primaryKey/);
assert.ok(match, 'eventPayments schema must exist');
var fields = match[1];
['id', 'applicationId', 'paidAmount', 'paymentDate', 'depositorName', 'moneyStatus', 'managerEmail', 'confirmedAt'].forEach(function (field) {
  assert.ok(new RegExp('\\b' + field + '\\s*:').test(fields), 'eventPayments must contain ' + field);
});
assert.ok(!/\bexpectedAmount\s*:/.test(fields), 'eventPayments must not contain expectedAmount');
console.log('Event payment schema contract passed.');
