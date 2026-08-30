var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var EVENT_CREATION_FILES = [
  'src/backend/domains/event/business_rules/event_constants.gs',
  'src/backend/domains/event/controllers/event_request.gs',
  'src/backend/domains/event/business_rules/events_rules.gs',
  'src/backend/domains/event/application/events_mutation.gs'
];

function load_(context, relativePath) {
  var file = path.join(ROOT, relativePath);
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

function createContext_(initialRows) {
  var rows = (initialRows || []).map(function (row) { return Object.assign({}, row); });
  var audits = [];
  var context = vm.createContext({
    console: console,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Math: Math,
    Date: Date,
    JSON: JSON,
    RegExp: RegExp,
    isFinite: isFinite
  });

  context.throwEventError_ = function (code, message, details) {
    var error = new Error(message);
    error.code = code;
    error.details = details;
    throw error;
  };
  context.readActiveUserEmailFromSession_ = function () { return 'fallback@example.com'; };
  context.withOperationWriteLock_ = function (callback) { return callback(); };
  context.listEventRows_ = function () { return rows.map(function (row) { return Object.assign({}, row); }); };
  context.findEventRowById_ = function (id) {
    return rows.filter(function (row) { return row.id === id; })[0] || null;
  };
  context.insertEventRow_ = function (row) { rows.push(Object.assign({}, row)); return row; };
  context.getCurrentIsoDateTime_ = function () { return '2026-08-20T10:00:00+09:00'; };
  context.resolveEventMaterialFolder_ = function () { return { getId: function () { return 'folder-1'; } }; };
  context.uploadEventRelatedMaterial_ = function () { throw new Error('Unexpected file upload'); };
  context.withoutInternalRowNumber_ = function (row) { return Object.assign({}, row); };
  context.writeBusinessAudit_ = function (audit) { audits.push(audit); };
  context.updateEventRowById_ = function () { throw new Error('Unexpected update'); };

  EVENT_CREATION_FILES.forEach(function (file) { load_(context, file); });
  context.__rows = rows;
  context.__audits = audits;
  return context;
}

function validPayload_(overrides) {
  return Object.assign({
    name: '새내기 MT',
    category: 'MT',
    status: '예정',
    applicationEnabled: true,
    feeEnabled: false,
    attendanceEnabled: true,
    balanceDistributionEnabled: false,
    applicationStartAt: '2026-08-20',
    applicationEndAt: '2026-08-31',
    eventStartAt: '2026-09-12',
    eventEndAt: '2026-09-13',
    capacity: 80,
    payerFee: 10000,
    nonPayerFee: 15000,
    description: '신입생 친목 행사',
    department: '학생복지국',
    location: '학생회관',
    note: '우천 시 장소 변경'
  }, overrides || {});
}

function testEventIdSequenceAndOptions_() {
  var context = createContext_([
    { id: 'EVT-2026-MT-001' },
    { id: 'EVT-2026-MT-007' },
    { id: 'EVT-2025-MT-099' },
    { id: 'EVT-2026-GC-020' },
    { id: 'legacy-uuid-event' }
  ]);
  var saved = context.createEventData_({ payload: validPayload_() }, { email: 'manager@example.com' });

  assert.strictEqual(saved.id, 'EVT-2026-MT-008');
  assert.strictEqual(saved.eventEndAt, '2026-09-13');
  assert.strictEqual(saved.applicationEnabled, true);
  assert.strictEqual(saved.feeEnabled, false);
  assert.strictEqual(saved.attendanceEnabled, true);
  assert.strictEqual(saved.balanceDistributionEnabled, false);
  assert.strictEqual(saved.payerFee, 0);
  assert.strictEqual(saved.nonPayerFee, 0);
  assert.strictEqual(saved.department, '학생복지국');
  assert.strictEqual(saved.location, '학생회관');
  assert.strictEqual(saved.note, '우천 시 장소 변경');
  assert.strictEqual(context.__audits[0].targetId, 'EVT-2026-MT-008');
}

function testCategoryCodes_() {
  var context = createContext_([]);
  var cases = [
    ['개강총회', 'GC'],
    ['MT', 'MT'],
    ['간식행사', 'SN'],
    ['사물함', 'LK'],
    ['축제', 'FS'],
    ['기타', 'ET']
  ];

  cases.forEach(function (item) {
    assert.strictEqual(context.buildNextEventId_(item[0], '2027-01-02'), 'EVT-2027-' + item[1] + '-001');
  });
}

function testPaidEventFees_() {
  var context = createContext_([]);
  var saved = context.createEventData_({
    payload: validPayload_({
      feeEnabled: true,
      payerFee: 7000,
      nonPayerFee: 12000,
      applicationEnabled: false,
      attendanceEnabled: false,
      balanceDistributionEnabled: true
    })
  }, { email: 'manager@example.com' });

  assert.strictEqual(saved.payerFee, 7000);
  assert.strictEqual(saved.nonPayerFee, 12000);
  assert.strictEqual(saved.applicationEnabled, false);
  assert.strictEqual(saved.attendanceEnabled, false);
  assert.strictEqual(saved.balanceDistributionEnabled, true);
}

function testDuplicateDetection_() {
  var context = createContext_([{ id: 'EVT-2026-MT-001' }]);
  context.findEventRowById_ = function (id) {
    return id === 'EVT-2026-MT-002' ? { id: id } : null;
  };

  assert.throws(function () {
    context.createEventData_({ payload: validPayload_({ feeEnabled: true }) }, { email: 'manager@example.com' });
  }, function (error) {
    return error.code === 'CONFLICT' && /EVT-2026-MT-002/.test(error.message);
  });
  assert.strictEqual(context.__rows.length, 1);
}

function testValidation_() {
  var context = createContext_([]);

  assert.throws(function () {
    context.buildEventPayload_(validPayload_({ category: '임의유형' }), true);
  }, function (error) { return error.code === 'VALIDATION_FAILED'; });
  assert.throws(function () {
    context.buildEventPayload_(validPayload_({ status: '취소' }), true);
  }, function (error) { return error.code === 'INVALID_STATUS'; });
  assert.throws(function () {
    context.buildEventPayload_(validPayload_({ eventEndAt: '2026-09-11' }), true);
  }, function (error) { return error.code === 'VALIDATION_FAILED' && /행사 종료일/.test(error.message); });
  assert.throws(function () {
    context.buildEventPayload_(validPayload_({ applicationEnabled: 'yes' }), true);
  }, function (error) { return error.code === 'VALIDATION_FAILED'; });

  var patch = context.buildEventPayload_({ id: 'EVT-2099-MT-999', name: '수정 행사' }, false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(patch, 'id'), false);
}

testEventIdSequenceAndOptions_();
testCategoryCodes_();
testPaidEventFees_();
testDuplicateDetection_();
testValidation_();
console.log('Event creation behavior tests passed.');
