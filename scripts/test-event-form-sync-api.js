var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var accessPath = path.join(ROOT, 'src/000_server/050_event/050_common/event_access.gs');
var apiPath = path.join(ROOT, 'src/000_server/050_event/052_applicants/applicants_api.gs');
var queryPath = path.join(ROOT, 'src/000_server/050_event/051_events/events_query_service.gs');
assert.ok(fs.existsSync(accessPath), 'event_access.gs must exist');

var apiSource = fs.readFileSync(apiPath, 'utf8');
assert.ok(/function\s+api_syncApplicantsFromForms\s*\(/.test(apiSource), 'sync API must exist');
assert.ok(/requireEventEditContext_\s*\(context\)/.test(apiSource), 'sync API must enforce Event edit context');
assert.ok(/syncApplicantsFromFormsData_\s*\(/.test(apiSource), 'sync API must delegate to sync service');

var accessContext = vm.createContext({
  console: console,
  String: String,
  Object: Object,
  Array: Array,
  buildEffectivePermissionDetails_: function (permissions) { return permissions.details || []; },
  normalizeAccessToken_: function (value) { return String(value || '').toLowerCase().replace(/[\s_-]+/g, ''); },
  throwPermissionError_: function (message) { var error = new Error(message); error.code = 'FORBIDDEN'; throw error; }
});
vm.runInContext(fs.readFileSync(accessPath, 'utf8'), accessContext, { filename: accessPath });
assert.strictEqual(accessContext.requireEventEditContext_({ ok: true, isAdmin: true }), true);
assert.strictEqual(accessContext.requireEventEditContext_({
  ok: true,
  isAdmin: false,
  permissions: { details: [{ area: '행사복지관리', grants: { edit: true } }] }
}), true);
assert.throws(function () {
  accessContext.requireEventEditContext_({
    ok: true,
    isAdmin: false,
    permissions: { details: [{ area: '행사복지관리', grants: { view: true, edit: false } }] }
  });
}, function (error) { return error.code === 'FORBIDDEN'; });

var queryContext = vm.createContext({
  console: console,
  String: String,
  Number: Number,
  Object: Object,
  Array: Array,
  EVENT_STATUSES: [],
  normalizeEventText_: function (value) { return String(value || '').trim(); },
  paginateEventItems_: function (items) { return { items: items }; },
  findAllEventClientRows_: function () { return []; },
  requireEventRequestId_: function (request) { return String(request.id); },
  findEventRowById_: function () { return { id: 'EVT-1', name: '행사' }; },
  withoutInternalRowNumber_: function (row) { return row; },
  findAllEventApplicationClientRows_: function () { return []; },
  findAllEventAttendanceClientRows_: function () { return []; },
  getEventPaymentTotalsByApplicationId_: function () { return {}; },
  findEventFormByEventId_: function () {
    return { id: 'FORM-1', eventId: 'EVT-1', googleFormId: 'FORM-ID', responseSheetId: 'SHEET-ID', status: '연동', lastSyncedAt: '2026-08-18T20:00:00+09:00' };
  },
  throwEventError_: function (code, message) { var error = new Error(message); error.code = code; throw error; }
});
vm.runInContext(fs.readFileSync(queryPath, 'utf8'), queryContext, { filename: queryPath });
var detail = queryContext.getEventDetailData_({ id: 'EVT-1' });
assert.deepStrictEqual(JSON.parse(JSON.stringify(detail.formSync)), {
  configured: true,
  googleFormId: 'FORM-ID',
  responseSheetId: 'SHEET-ID',
  status: '연동',
  lastSyncedAt: '2026-08-18T20:00:00+09:00'
});

console.log('Event Form sync API/access contract passed.');
