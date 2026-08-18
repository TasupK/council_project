var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');

function walk_(dir) {
  var result = [];
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (entry) {
    var full = path.join(dir, entry.name);
    if (entry.isDirectory()) result = result.concat(walk_(full));
    else result.push(full);
  });
  return result;
}

function source_(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8');
}

function apiBlocks_(text) {
  var starts = [];
  var regex = /function\s+(api_[A-Za-z0-9_]+)\s*\(/g;
  var match;
  while ((match = regex.exec(text))) starts.push({ name: match[1], index: match.index });
  return starts.map(function (item, index) {
    var end = index + 1 < starts.length ? starts[index + 1].index : text.length;
    return { name: item.name, source: text.slice(item.index, end) };
  });
}

var domainDirs = [
  'src/000_server/050_event',
  'src/000_server/060_accounting',
  'src/000_server/080_student_fee'
];

domainDirs.forEach(function (relativeDir) {
  walk_(path.join(ROOT, relativeDir)).filter(function (file) {
    return /_api\.gs$/.test(file);
  }).forEach(function (file) {
    var text = fs.readFileSync(file, 'utf8');
    apiBlocks_(text).forEach(function (block) {
      if (!/requireLogin\s*:\s*true/.test(block.source)) return;
      assert.ok(/\b(access|permission)\s*:/.test(block.source), block.name + ' must declare access or legacy permission in ' + path.relative(ROOT, file));
    });
  });
});

var coreFiles = walk_(path.join(ROOT, 'src/000_server/010_core')).filter(function (file) { return /\.(gs|js)$/.test(file); });
coreFiles.forEach(function (file) {
  var text = fs.readFileSync(file, 'utf8');
  assert.ok(!/perm_[A-Za-z0-9_-]+/.test(text), 'Core must not hard-code business permission screen IDs: ' + path.relative(ROOT, file));
  assert.ok(!/(행사복지관리|회계관리|학생회비관리)/.test(text), 'Core must not hard-code domain permission areas: ' + path.relative(ROOT, file));
});

[
  'src/000_server/050_event/050_common/event_access.gs',
  'src/000_server/060_accounting/060_common/accounting_access.gs',
  'src/000_server/080_student_fee/080_common/student_fee_access.gs'
].forEach(function (file) {
  var text = source_(file);
  assert.ok(!/(readOperationTable|appendOperationTable|updateOperationTable|openOperationSpreadsheet|SpreadsheetApp)/.test(text), file + ' must not access persistence directly');
});

var paymentService = source_('src/000_server/080_student_fee/082_payments/fee_payments_service.gs');
var refundService = source_('src/000_server/080_student_fee/083_refunds/fee_refunds_service.gs');
assert.ok(/processFeeApplicationsData_[\s\S]*withOperationWriteLock_/.test(paymentService), 'fee application processing must use write lock');
assert.ok(/processFeeRefundRequestsData_[\s\S]*withOperationWriteLock_/.test(refundService), 'fee refund processing must use write lock');

var formSync = source_('src/000_server/050_event/052_applicants/applicants_form_sync_service.gs');
assert.ok(/withOperationWriteLock_[\s\S]*findEventFormByEventId_/.test(formSync), 'eventForms upsert decision must re-read inside write lock');

var allServer = walk_(path.join(ROOT, 'src/000_server')).filter(function (file) { return /\.(gs|js)$/.test(file); });
allServer.forEach(function (file) {
  var text = fs.readFileSync(file, 'utf8');
  assert.ok(!/class\s+(Abstract|Base|Generic).*(Repository|Service|Command|Strategy|Factory)/.test(text), 'generic class infrastructure is not allowed: ' + path.relative(ROOT, file));
});

console.log('System consistency architecture guardrails passed.');
