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
assert.ok(/access\s*:\s*\{\s*domain\s*:\s*['"]event['"]\s*,\s*action\s*:\s*['"]edit['"]\s*\}/.test(apiSource), 'sync API must use common Event edit access contract');
assert.ok(!/requireEventEditContext_\s*\(context\)/.test(apiSource), 'sync API must not keep a second authorization path');
assert.ok(/syncApplicantsFromFormsData_\s*\(/.test(apiSource), 'sync API must delegate to sync service');

var accessContext = vm.createContext({
  console: console,
  String: String,
  Object: Object,
  Array: Array,
  getPermissionsById_: function () {
    return {
      EV: { id: 'EV', area: '행사복지관리', action: '조회', name: '행사 조회', status: 'active' },
      EE: { id: 'EE', area: '행사복지관리', action: '수정', name: '행사 수정', status: 'active' }
    };
  },
  permissionScreenId_: function (permission) { return 'perm_' + permission.id; },
  actionToPermissionKey_: function (action) {
    if (String(action).indexOf('조회') >= 0) return 'view';
    if (String(action).indexOf('수정') >= 0 || String(action).indexOf('등록') >= 0) return 'edit';
    return 'view';
  },
  throwPermissionError_: function (message) { var error = new Error(message); error.code = 'FORBIDDEN'; throw error; }
});
vm.runInContext(fs.readFileSync(accessPath, 'utf8'), accessContext, { filename: accessPath });
assert.deepStrictEqual(JSON.parse(JSON.stringify(accessContext.resolveEventAccess_({ domain: 'event', action: 'edit' }))), {
  screenId: 'perm_EE',
  action: 'edit'
});

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
