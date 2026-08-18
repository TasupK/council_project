var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var QUERY_SERVICE_FILES = [
  'src/000_server/050_event/051_events/events_query_service.gs',
  'src/000_server/050_event/052_applicants/applicants_query_service.gs',
  'src/000_server/050_event/054_attendance/attendance_query_service.gs',
  'src/000_server/050_event/055_refunds/refunds_query_service.gs'
];

function load_(context, relativePath) {
  var file = path.join(ROOT, relativePath);
  var source = fs.readFileSync(file, 'utf8');
  vm.runInContext(source, context, { filename: file });
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
    isFinite: isFinite,
    EVENT_STATUSES: ['예정', '모집', '진행', '종료']
  });
}

function installCommonStubs_(context) {
  context.normalizeEventText_ = function (value) {
    return value === null || typeof value === 'undefined' ? '' : String(value).trim();
  };
  context.requireEventRequestId_ = function (request) {
    return String((request && (request.id || request.eventId || request.applicationId)) || '').trim();
  };
  context.withoutInternalRowNumber_ = function (item) {
    if (!item) return item;
    var copy = Object.assign({}, item);
    delete copy.__rowNumber;
    return copy;
  };
  context.paginateEventItems_ = function (items, request) {
    var page = Number(request && request.page || 1);
    var pageSize = Number(request && request.pageSize || items.length || 1);
    var start = (page - 1) * pageSize;
    return {
      items: items.slice(start, start + pageSize),
      page: page,
      pageSize: pageSize,
      total: items.length
    };
  };
}

function createQueryContext_() {
  var context = createContext_();
  installCommonStubs_(context);
  QUERY_SERVICE_FILES.forEach(function (file) { load_(context, file); });
  return context;
}

function testPaymentTotals_() {
  var context = createContext_();
  context.listEventPaymentClientRows_ = function () {
    return [
      { applicationId: 'app-1', paidAmount: 1000 },
      { applicationId: 'app-1', paidAmount: 500 },
      { applicationId: 'app-2', paidAmount: '700' },
      { applicationId: '', paidAmount: 9999 }
    ];
  };
  load_(context, 'src/000_server/050_event/053_payment/payment_service.gs');

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(context.getEventPaymentTotalsByApplicationId_())),
    { 'app-1': 1500, 'app-2': 700 }
  );
}

function testEventData_() {
  var context = createQueryContext_();
  context.findEventRowById_ = function (id) {
    return id === 'event-1' ? { id: 'event-1', name: '행사', __rowNumber: 2 } : null;
  };
  context.throwEventError_ = function (code, message) {
    var error = new Error(message);
    error.code = code;
    throw error;
  };

  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(context.getEventData_({ id: 'event-1' }))),
    { id: 'event-1', name: '행사' }
  );
  assert.throws(function () {
    context.getEventData_({ id: 'missing' });
  }, function (error) {
    return error.code === 'NOT_FOUND';
  });
}

function testEventList_() {
  var context = createQueryContext_();
  var rows = [
    { id: 'event-1', name: '개강 행사', managerId: 'manager-a', category: '복지', status: '모집', eventStartAt: '2026-09-02' },
    { id: 'event-2', name: '종강 행사', managerId: 'manager-b', category: '문화', status: '종료', eventStartAt: '2026-06-20' },
    { id: 'event-3', name: '체육 행사', managerId: 'manager-a', category: '체육', status: '예정', eventStartAt: '2026-10-01' }
  ];
  context.listEventClientRows_ = function () { return rows.map(function (row) { return Object.assign({}, row); }); };

  var result = context.getEventListData_({
    filter: { managerId: 'manager-a', includeClosed: false },
    page: 1,
    pageSize: 10
  });

  assert.deepStrictEqual(result.items.map(function (item) { return item.id; }), ['event-3', 'event-1']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.summary)), {
    total: 3,
    scheduled: 1,
    recruiting: 1,
    inProgress: 0,
    closed: 1
  });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.options)), {
    managers: ['manager-a', 'manager-b'],
    eventTypes: ['문화', '복지', '체육'],
    eventStatuses: ['예정', '모집', '진행', '종료']
  });
}

function testEventDetail_() {
  var context = createQueryContext_();
  context.getEventData_ = function () { return { id: 'event-1', name: '행사' }; };
  context.listEventApplicationClientRows_ = function () {
    return [
      { id: 'app-1', eventId: 'event-1', status: '승인', appliedFee: 1000 },
      { id: 'app-2', eventId: 'event-1', status: '대기', appliedFee: 2000 },
      { id: 'app-3', eventId: 'event-2', status: '승인', appliedFee: 1000 }
    ];
  };
  context.listEventAttendanceClientRows_ = function () {
    return [
      { applicationId: 'app-1', status: '출석' },
      { applicationId: 'app-2', status: '결석' }
    ];
  };
  context.getEventPaymentTotalsByApplicationId_ = function () {
    return { 'app-1': 1000, 'app-2': 1500 };
  };

  var result = context.getEventDetailData_({ id: 'event-1' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), {
    event: { id: 'event-1', name: '행사' },
    summary: {
      totalApplicants: 2,
      approvedApplicants: 1,
      paidApplicants: 1,
      actualAttendees: 1,
      currentBalance: null
    }
  });
}

function testApplicantListAndDetail_() {
  var context = createQueryContext_();
  context.listEventApplicationClientRows_ = function () {
    return [
      { id: 'app-1', eventId: 'event-1', name: '김학생', studentId: '6001', phone: '010-1111', accountHolder: '김학생', applicantType: '재학생', status: '승인', sourceResponseAt: '2026-08-03', appliedFee: 1000 },
      { id: 'app-2', eventId: 'event-1', name: '이학생', studentId: '6002', phone: '010-2222', accountHolder: '이학생', applicantType: '재학생', status: '대기', sourceResponseAt: '2026-08-04', appliedFee: 2000 },
      { id: 'app-3', eventId: 'event-2', name: '박학생', studentId: '6003', phone: '010-3333', accountHolder: '박학생', applicantType: '졸업생', status: '승인', sourceResponseAt: '2026-08-05', appliedFee: 3000 }
    ];
  };
  context.findEventApplicationRowById_ = function () {
    return { id: 'app-1', eventId: 'event-1', name: '김학생', appliedFee: 1000, __rowNumber: 2 };
  };
  context.findEventAttendanceByApplicationId_ = function () {
    return { id: 'attendance-1', applicationId: 'app-1', status: '출석', __rowNumber: 4 };
  };
  context.getEventPaymentTotalsByApplicationId_ = function () {
    return { 'app-1': 1000, 'app-2': 500 };
  };

  var list = context.getApplicantListData_({ eventId: 'event-1', filter: {}, page: 1, pageSize: 10 });
  assert.deepStrictEqual(list.items.map(function (item) { return [item.id, item.paidAmount]; }), [
    ['app-2', 500],
    ['app-1', 1000]
  ]);

  var detail = context.getApplicantDetailData_({ applicationId: 'app-1' });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(detail)), {
    applicant: { id: 'app-1', eventId: 'event-1', name: '김학생', appliedFee: 1000, paidAmount: 1000 },
    attendance: { id: 'attendance-1', applicationId: 'app-1', status: '출석' }
  });
}

function testAttendanceList_() {
  var context = createQueryContext_();
  context.listEventAttendanceClientRows_ = function () {
    return [{ applicationId: 'app-1', confirmedAt: '2026-08-01T10:00:00', status: '출석', managerId: 'staff@example.com' }];
  };
  context.listEventApplicationClientRows_ = function () {
    return [
      { id: 'app-1', eventId: 'event-1', studentId: '6001', name: '김학생', phone: '010-1111', applicantType: '재학생', appliedFee: 1000 },
      { id: 'app-2', eventId: 'event-1', studentId: '6002', name: '이학생', phone: '010-2222', applicantType: '재학생', appliedFee: 2000 }
    ];
  };
  context.getEventPaymentTotalsByApplicationId_ = function () {
    return { 'app-1': 1000, 'app-2': 500 };
  };

  var result = context.getAttendanceListData_({ eventId: 'event-1', filter: { feeStatus: 'paid' }, page: 1, pageSize: 10 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.items)), [{
    applicationId: 'app-1',
    studentId: '6001',
    name: '김학생',
    phone: '010-1111',
    applicantType: '재학생',
    appliedFee: 1000,
    paidAmount: 1000,
    confirmedAt: '2026-08-01T10:00:00',
    status: '출석',
    managerId: 'staff@example.com'
  }]);
}

function testRefundList_() {
  var context = createQueryContext_();
  context.listEventApplicationClientRows_ = function () {
    return [
      { id: 'app-1', eventId: 'event-1', name: '김학생', studentId: '6001' },
      { id: 'app-2', eventId: 'event-2', name: '이학생', studentId: '6002' }
    ];
  };
  context.listEventRefundClientRows_ = function () {
    return [
      { id: 'refund-1', applicationId: 'app-1', amount: 1000 },
      { id: 'refund-2', applicationId: 'app-2', amount: 2000 }
    ];
  };

  var result = context.getEventRefundListData_({ eventId: 'event-1', page: 1, pageSize: 10 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result.items)), [{
    id: 'refund-1',
    applicationId: 'app-1',
    amount: 1000,
    name: '김학생',
    studentId: '6001'
  }]);
}

testPaymentTotals_();
testEventData_();
testEventList_();
testEventDetail_();
testApplicantListAndDetail_();
testAttendanceList_();
testRefundList_();
console.log('Event behavior regression tests passed.');
