var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');

function read_(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function load_(context, relativePath) {
  vm.runInContext(read_(relativePath), context, { filename: relativePath });
}

function createContext_() {
  return vm.createContext({
    console: console,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Math: Math,
    Date: Date,
    JSON: JSON,
    isFinite: isFinite
  });
}

function testPaymentQueryServiceOwnsPaymentReadModel_() {
  var queryPath = 'src/backend/domains/event/application/payment_query.gs';
  assert.ok(fs.existsSync(path.join(ROOT, queryPath)), 'payment_query.gs must exist');

  var context = createContext_();
  context.listEventPaymentClientRows_ = function () {
    return [
      { id: 'pay-1', applicationId: 'app-1', paidAmount: 1000 },
      { id: 'pay-2', applicationId: 'app-1', paidAmount: 500 },
      { id: 'pay-3', applicationId: 'app-2', paidAmount: '700' },
      { id: 'pay-4', applicationId: '', paidAmount: 9999 }
    ];
  };
  load_(context, queryPath);

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(context.buildEventPaymentTotalsByApplicationId_())),
    { 'app-1': 1500, 'app-2': 700 }
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(context.getEventPaymentRowsByApplicationId_('app-1'))),
    [
      { id: 'pay-1', applicationId: 'app-1', paidAmount: 1000 },
      { id: 'pay-2', applicationId: 'app-1', paidAmount: 500 }
    ]
  );
}

function testPaymentDaoOwnsEventPaymentTableAccess_() {
  var dao = read_('src/backend/domains/event/repositories/payment_repository.gs');
  assert.match(dao, /listEventPaymentClientRows_/);
  assert.match(dao, /findEventPaymentRowsByApplicationId_/);
  assert.match(dao, /insertEventPaymentRow_/);
  assert.match(dao, /updateEventPaymentRowById_/);
}

function testConsumersUsePaymentQueryInterface_() {
  var paymentService = read_('src/backend/domains/event/application/payment_mutation.gs');
  assert.ok(paymentService.indexOf('buildEventPaymentTotalsByApplicationId_') === -1, 'payment mutation service must not own payment totals');

  [
    'src/backend/domains/event/application/events_query.gs',
    'src/backend/domains/event/application/applicants_query.gs',
    'src/backend/domains/event/application/attendance_query.gs'
  ].forEach(function (relativePath) {
    var source = read_(relativePath);
    assert.ok(source.indexOf('buildEventPaymentTotalsByApplicationId_') >= 0, relativePath + ' must use payment query interface');
  });
}

testPaymentQueryServiceOwnsPaymentReadModel_();
testPaymentDaoOwnsEventPaymentTableAccess_();
testConsumersUsePaymentQueryInterface_();
console.log('Event payment boundary contract passed.');
