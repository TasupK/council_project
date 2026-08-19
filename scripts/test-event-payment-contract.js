var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var servicePath = path.join(ROOT, 'src/000_server/050_event/053_payment/payment_service.gs');
var queryPath = path.join(ROOT, 'src/000_server/050_event/053_payment/payment_query_service.gs');

function load_(context, file) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

var payments = [];
var audits = [];
var context = vm.createContext({
  console: console,
  String: String,
  Number: Number,
  Object: Object,
  Array: Array,
  Math: Math,
  Date: Date,
  JSON: JSON,
  isFinite: isFinite,
  Utilities: { getUuid: function () { return 'PAY-UUID-1'; } },
  getCurrentIsoDateTime_: function () { return '2026-08-20T03:45:00+09:00'; },
  readActiveUserEmailFromSession_: function () { return ''; },
  withOperationWriteLock_: function (fn) { return fn(); },
  findEventApplicationRowById_: function (id) {
    return id === 'APP-1' ? { id: 'APP-1', eventId: 'EVENT-1', appliedFee: 12000 } : null;
  },
  listEventApplicationClientRows_: function () {
    return [{ id: 'APP-1', eventId: 'EVENT-1', appliedFee: 12000 }];
  },
  listEventPaymentClientRows_: function () { return payments.map(function (row) { return Object.assign({}, row); }); },
  findEventPaymentRowById_: function (id) { return payments.filter(function (row) { return row.id === id; })[0] || null; },
  insertEventPaymentRow_: function (row) { payments.push(Object.assign({}, row)); return row; },
  updateEventPaymentRowById_: function (id, patch) {
    var row = payments.filter(function (item) { return item.id === id; })[0];
    if (!row) return null;
    Object.keys(patch).forEach(function (key) { row[key] = patch[key]; });
    return row;
  },
  writeBusinessAudit_: function (entry) { audits.push(entry); return entry; },
  withoutInternalRowNumber_: function (row) { return row ? Object.assign({}, row) : row; },
  throwEventError_: function (code, message) { var error = new Error(message); error.code = code; throw error; }
});

load_(context, servicePath);
load_(context, queryPath);

assert.throws(function () {
  context.createEventPaymentData_({ applicationId: '' }, { email: 'staff@example.com' });
});
assert.throws(function () {
  context.createEventPaymentData_({ applicationId: 'APP-1', paidAmount: 0, paymentDate: '2026-08-20' }, { email: 'staff@example.com' });
});

var created = context.createEventPaymentData_({
  applicationId: 'APP-1',
  paidAmount: 12000,
  paymentDate: '2026-08-20',
  depositorName: '김학생',
  bankTransactionId: 'MUST-NOT-PERSIST',
  expectedAmount: 99999
}, { email: 'staff@example.com' });

assert.strictEqual(created.id, 'PAY-UUID-1');
assert.strictEqual(created.applicationId, 'APP-1');
assert.strictEqual(created.paidAmount, 12000);
assert.strictEqual(created.paymentDate, '2026-08-20');
assert.strictEqual(created.depositorName, '김학생');
assert.strictEqual(created.moneyStatus, '확인');
assert.strictEqual(created.managerEmail, 'staff@example.com');
assert.strictEqual(created.confirmedAt, '2026-08-20T03:45:00+09:00');
['expectedAmount', 'bankTransactionId', 'ledgerId', 'reconciliationId'].forEach(function (key) {
  assert.ok(!Object.prototype.hasOwnProperty.call(created, key), key + ' must not persist');
});
assert.strictEqual(audits.length, 1);
assert.strictEqual(audits[0].targetType, 'eventPayments');
assert.strictEqual(audits[0].actionType, 'CREATE');

var updated = context.updateEventPaymentData_({
  id: 'PAY-UUID-1',
  paidAmount: 10000,
  depositorName: '김학생2',
  bankTransactionId: 'IGNORE'
}, { email: 'staff2@example.com' });
assert.strictEqual(updated.paidAmount, 10000);
assert.strictEqual(updated.depositorName, '김학생2');
assert.strictEqual(updated.managerEmail, 'staff2@example.com');
assert.ok(!Object.prototype.hasOwnProperty.call(updated, 'bankTransactionId'));
assert.strictEqual(audits.length, 2);
assert.strictEqual(audits[1].actionType, 'UPDATE');

var facts = context.buildEventPaymentAccountingFacts_();
assert.deepStrictEqual(JSON.parse(JSON.stringify(facts)), [{
  paymentId: 'PAY-UUID-1',
  applicationId: 'APP-1',
  eventId: 'EVENT-1',
  paidAmount: 10000,
  paymentDate: '2026-08-20',
  depositorName: '김학생2',
  moneyStatus: '확인',
  confirmedAt: '2026-08-20T03:45:00+09:00'
}]);

console.log('Event payment runtime contract passed.');
