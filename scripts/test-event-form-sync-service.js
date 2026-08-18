var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var servicePath = path.join(ROOT, 'src/000_server/050_event/052_applicants/applicants_form_sync_service.gs');
assert.ok(fs.existsSync(servicePath), 'applicants_form_sync_service.gs must exist');

var insertedApplications = [];
var insertedAnswers = [];
var insertedForms = [];
var updatedForms = [];
var paymentWrites = 0;
var lockCalls = 0;
var context = vm.createContext({
  console: console,
  Object: Object,
  Array: Array,
  String: String,
  Number: Number,
  Boolean: Boolean,
  JSON: JSON,
  Utilities: { getUuid: (function () { var n = 0; return function () { n += 1; return 'uuid-' + n; }; })() },
  getCurrentIsoDateTime_: function () { return '2026-08-18T20:20:00+09:00'; },
  throwEventError_: function (code, message) { var error = new Error(message); error.code = code; throw error; },
  findEventRowById_: function (id) { return id === 'EVT-1' ? { id: 'EVT-1', feeEnabled: false, payerFee: 0, nonPayerFee: 0 } : null; },
  findEventFormByEventId_: function () { return { id: 'FORM-1', eventId: 'EVT-1', googleFormId: 'old-form', responseSheetId: 'old-sheet' }; },
  resolveEventFormResponseSource_: function (formId, sheetId) {
    assert.strictEqual(formId, 'new-form');
    assert.strictEqual(sheetId, 'old-sheet');
    return { googleFormId: 'new-form', responseSheetId: 'old-sheet', sheetName: '응답1', sheetId: 9, headers: [], rows: [] };
  },
  buildEventFormCandidates_: function () {
    return {
      items: [
        { applicant: { id: 'A1', eventId: 'EVT-1', sourceResponseId: 'SRC-1' }, extraAnswers: [{ id: 'X1', applicationId: 'A1' }] },
        { applicant: { id: 'A2', eventId: 'EVT-1', sourceResponseId: 'SRC-2' }, extraAnswers: [{ id: 'X2', applicationId: 'A2' }] },
        { applicant: { id: 'A3', eventId: 'EVT-1', sourceResponseId: 'SRC-2' }, extraAnswers: [] }
      ],
      invalidRows: [{ row: 5, reason: '학번 또는 성명 누락' }]
    };
  },
  findAllEventApplicationSourceResponseIds_: function () { return ['SRC-1']; },
  withOperationWriteLock_: function (callback) { lockCalls += 1; return callback(); },
  insertEventApplicationRow_: function (item) { insertedApplications.push(item); return item; },
  insertEventExtraAnswerRow_: function (item) { insertedAnswers.push(item); return item; },
  insertEventFormRow_: function (item) { insertedForms.push(item); return item; },
  updateEventFormRowById_: function (id, changes) { updatedForms.push({ id: id, changes: changes }); return true; },
  insertEventPaymentRow_: function () { paymentWrites += 1; }
});
vm.runInContext(fs.readFileSync(servicePath, 'utf8'), context, { filename: servicePath });

var result = context.syncApplicantsFromFormsData_({ id: 'EVT-1', payload: { googleFormId: 'new-form' } }, { email: 'manager@example.com' });
assert.strictEqual(lockCalls, 1);
assert.strictEqual(result.importedCount, 1);
assert.strictEqual(result.duplicateCount, 2);
assert.strictEqual(result.invalidCount, 1);
assert.deepStrictEqual(insertedApplications.map(function (item) { return item.sourceResponseId; }), ['SRC-2']);
assert.strictEqual(insertedAnswers.length, 1);
assert.strictEqual(updatedForms.length, 1);
assert.strictEqual(updatedForms[0].id, 'FORM-1');
assert.strictEqual(updatedForms[0].changes.googleFormId, 'new-form');
assert.strictEqual(updatedForms[0].changes.responseSheetId, 'old-sheet');
assert.strictEqual(updatedForms[0].changes.status, '연동');
assert.strictEqual(paymentWrites, 0, 'Forms sync must never write eventPayments');

assert.throws(function () {
  context.syncApplicantsFromFormsData_({ id: 'MISSING', payload: { googleFormId: 'x' } }, {});
}, function (error) { return error.code === 'NOT_FOUND'; });

console.log('Event Form sync service contract passed.');
