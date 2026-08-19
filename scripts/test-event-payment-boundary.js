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
  var queryPath = 'src/000_server/050_event/053_payment/payment_query_service.gs';
  assert.ok(fs.existsSync(path.join(ROOT, queryPath)), 'payment_query_service.gs must exist');

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
    JSON.parse(JSON.stringify(context.getEventPaymentTotalsByApplicationId_())),
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
  var dao = read_('src/000_server/050_event/053_payment/payment_sheet_dao.gs');
  assert.match(dao, /listEventPaymentClientRows_/);
  assert.match(dao, /findEventPaymentRowsByApplicationId_/);
  assert.match(dao, /insertEventPaymentRow_/);
  assert.match(dao, /updateEventPaymentRowById_/);
}

function testConsumersUsePaymentQueryInterface_() {
  [
    'src/000_server/050_event/051_events/events_query_service.gs',
    'src/000_server/050_event/052_applicants/applicants_query_service.gs',
    'src/000_server/050_event/054_attendance/attendance_query_service.gs'
  ].forEach(function (relativePath) {
    var source = read_(relativePath);
    assert.ok(source.indexOf('buildEventPaymentTotalsByApplicationId_') === -1, relativePath + ' must not call payment implementation helper');
    assert.ok(source.indexOf('getEventPaymentTotalsByApplicationId_') >= 0, relativePath + ' must use payment query interface');
  });
}

testPaymentQueryServiceOwnsPaymentReadModel_();
testPaymentDaoOwnsEventPaymentTableAccess_();
testConsumersUsePaymentQueryInterface_();
console.log('Event payment boundary contract passed.');
