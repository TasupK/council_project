var assert = require('assert');
var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
function digestBytes(text) {
  return Array.prototype.slice.call(crypto.createHash('sha256').update(String(text)).digest()).map(function (v) { return v > 127 ? v - 256 : v; });
}

(function testStableIdentityIgnoresEditedNonIdentityAnswers() {
  var ctx = vm.createContext({
    console: console,
    String: String, Number: Number, Object: Object, Array: Array, Error: Error,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      computeDigest: function (_, text) { return digestBytes(text); },
      getUuid: (function () { var i = 0; return function () { i += 1; return 'UUID-' + i; }; })()
    },
    getCurrentIsoDateTime_: function () { return '2026-08-18T21:00:00+09:00'; },
    throwEventError_: function (code, message) { var e = new Error(message); e.code = code; throw e; }
  });
  var file = path.join(ROOT, 'src/000_server/050_event/052_applicants/applicants_form_mapper.gs');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  var source = {
    responseSheetId: 'SHEET-1', sheetId: 10,
    headers: ['타임스탬프', '학번', '성명', '연락처'],
    rows: [
      ['2026-08-18 20:00:00', '60201234', '김학생', '010-1111-1111'],
      ['2026-08-18 20:00:00', '60201234', '김학생', '010-2222-2222']
    ]
  };
  var built = ctx.buildEventFormCandidates_(source, { id: 'EVT-1', feeEnabled: false });
  assert.strictEqual(built.items.length, 2);
  assert.strictEqual(built.items[0].applicant.sourceResponseId, built.items[1].applicant.sourceResponseId, 'non-identity answer edits must not change fallback response identity');
})();

(function testFormUpsertRereadsInsideLock() {
  var findCalls = 0;
  var updated = [];
  var inserted = [];
  var audits = [];
  var inLock = false;
  var ctx = vm.createContext({
    console: console,
    String: String, Number: Number, Object: Object, Array: Array, Error: Error,
    Utilities: { getUuid: function () { return 'NEW-FORM'; } },
    requireEventRequestId_: function () { return 'EVT-1'; },
    findEventRowById_: function () { return { id: 'EVT-1' }; },
    findEventFormByEventId_: function () {
      findCalls += 1;
      if (findCalls === 1) return null;
      assert.ok(inLock, 'upsert re-read must occur inside write lock');
      return { id: 'FORM-EXISTING', eventId: 'EVT-1' };
    },
    resolveEventFormResponseSource_: function () { return { googleFormId: 'FORM', responseSheetId: 'SHEET', sheetName: 'responses' }; },
    buildEventFormCandidates_: function () { return { items: [], invalidRows: [] }; },
    withOperationWriteLock_: function (fn) { inLock = true; try { return fn(); } finally { inLock = false; } },
    listEventApplicationSourceResponseIds_: function () { return []; },
    insertEventApplicationRow_: function () {},
    insertEventExtraAnswerRow_: function () {},
    getCurrentIsoDateTime_: function () { return '2026-08-18T21:00:00+09:00'; },
    updateEventFormRowById_: function (id, patch) { updated.push([id, patch]); },
    insertEventFormRow_: function (row) { inserted.push(row); },
    withoutInternalRowNumber_: function (value) { return value && Object.assign({}, value); },
    writeBusinessAudit_: function (event) { audits.push(event); return event; },
    throwEventError_: function (code, message) { var e = new Error(message); e.code = code; throw e; }
  });
  var file = path.join(ROOT, 'src/000_server/050_event/052_applicants/applicants_form_sync_service.gs');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  ctx.applyApplicantFormSyncData_({ id: 'EVT-1', payload: { googleFormId: 'FORM', responseSheetId: 'SHEET' } }, { email: 'staff@example.com' });
  assert.ok(findCalls >= 2, 'form row must be re-read after entering lock');
  assert.strictEqual(updated.length, 1, 'concurrent existing form must be updated');
  assert.strictEqual(updated[0][0], 'FORM-EXISTING');
  assert.strictEqual(inserted.length, 0, 'must not create a duplicate eventForms row');
  assert.strictEqual(audits.length, 2, 'form sync must emit form and import audit events');
})();

(function testRejectRecordsProcessedAt() {
  var row = { id: 'APP-1', status: '대기' };
  var audits = [];
  var ctx = vm.createContext({
    console: console,
    String: String, Object: Object, Array: Array, Error: Error,
    requireEventRequestId_: function () { return 'APP-1'; },
    requireEventText_: function (value) { return String(value); },
    withOperationWriteLock_: function (fn) { return fn(); },
    findEventApplicationRowById_: function () { return row; },
    updateEventApplicationRowById_: function (_, patch) { row = Object.assign({}, row, patch); },
    getCurrentIsoDateTime_: function () { return '2026-08-18T21:00:00+09:00'; },
    readActiveUserEmailFromSession_: function () { return 'fallback@example.com'; },
    withoutInternalRowNumber_: function (value) { return value; },
    writeBusinessAudit_: function (event) { audits.push(event); return event; },
    throwEventError_: function (code, message) { var e = new Error(message); e.code = code; throw e; }
  });
  var file = path.join(ROOT, 'src/000_server/050_event/052_applicants/applicants_service.gs');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  var result = ctx.processApplicantData_({ id: 'APP-1', action: 'reject' }, { email: 'staff@example.com' });
  assert.strictEqual(result.status, '반려');
  assert.strictEqual(result.processedAt, '2026-08-18T21:00:00+09:00');
  assert.strictEqual(result.managerEmail, 'staff@example.com');
  assert.strictEqual(audits.length, 1);
  assert.strictEqual(audits[0].actionType, 'REJECT');
  assert.strictEqual(audits[0].afterValue.managerEmail, 'staff@example.com');
})();

console.log('Event consistency hardening contract passed.');
