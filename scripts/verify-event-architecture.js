var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var EVENT_ROOT = path.join(ROOT, 'src', '000_server', '050_event');
var failures = [];

function normalize_(value) { return value.replace(/\\/g, '/'); }
function exists_(relativePath) { return fs.existsSync(path.join(EVENT_ROOT, relativePath)); }
function requireFile_(relativePath) { if (!exists_(relativePath)) failures.push('Missing Event architecture file: ' + relativePath); }
function forbidFile_(relativePath) { if (exists_(relativePath)) failures.push('Legacy Event architecture file still exists: ' + relativePath); }
function listSourceFiles_(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listSourceFiles_(target));
    if (/\.gs$/.test(entry.name)) files.push(target);
    return files;
  }, []);
}
function collectFunctions_() {
  var functions = {};
  listSourceFiles_(EVENT_ROOT).forEach(function (file) {
    var source = fs.readFileSync(file, 'utf8');
    var pattern = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    var match;
    while ((match = pattern.exec(source)) !== null) {
      if (!functions[match[1]]) functions[match[1]] = [];
      functions[match[1]].push(normalize_(path.relative(EVENT_ROOT, file)));
    }
  });
  return functions;
}
function requireFunctionIn_(functions, name, relativePath) {
  var locations = functions[name] || [];
  if (locations.length !== 1 || locations[0] !== relativePath) {
    failures.push('Function ownership mismatch: ' + name + ' expected ' + relativePath + ', found ' + (locations.length ? locations.join(', ') : 'none'));
  }
}
function forbidPatternIn_(relativePath, pattern, message) {
  if (!exists_(relativePath)) return;
  var source = fs.readFileSync(path.join(EVENT_ROOT, relativePath), 'utf8');
  if (pattern.test(source)) failures.push(message + ': ' + relativePath);
}

[
  '050_common/event_constants.gs','050_common/event_error.gs','050_common/event_request.gs','050_common/event_pagination.gs',
  '051_events/events_api.gs','051_events/events_service.gs','051_events/events_query_service.gs','051_events/events_validator.gs','051_events/events_sheet_dao.gs',
  '052_applicants/applicants_api.gs','052_applicants/applicants_service.gs','052_applicants/applicants_query_service.gs','052_applicants/applicants_sheet_dao.gs',
  '053_payment/payment_api.gs','053_payment/payment_service.gs','053_payment/payment_query_service.gs','053_payment/payment_sheet_dao.gs',
  '054_attendance/attendance_api.gs','054_attendance/attendance_service.gs','054_attendance/attendance_query_service.gs','054_attendance/attendance_sheet_dao.gs',
  '055_refunds/refunds_api.gs','055_refunds/refunds_query_service.gs','055_refunds/refunds_sheet_dao.gs','056_files/event_file_service.gs'
].forEach(requireFile_);

[
  '050_common/event_query_service.gs','050_common/event_payments.gs','050_common/event_payment_sheet_dao.gs','051_events/events.gs','051_events/event_events.gs',
  '052_applicants/applicants.gs','052_applicants/event_applicants.gs','053_attendance/attendance.gs','053_attendance/attendance_sheet_dao.gs','053_attendance/event_attendance.gs',
  '054_attendance/attendance.gs','054_attendance/event_attendance.gs','054_attendance/attendance_validator.gs','054_refunds/refunds.gs','054_refunds/refunds_sheet_dao.gs',
  '054_refunds/event_refunds.gs','055_refunds/refunds.gs','055_refunds/refunds_service.gs','055_refunds/event_refunds.gs','055_files/event_files.gs','056_files/event_files.gs'
].forEach(forbidFile_);

var functions = collectFunctions_();
var ownership = {
  buildEventPayload_: '051_events/events_validator.gs', createEventData_: '051_events/events_service.gs', updateEventData_: '051_events/events_service.gs',
  updateEventStatusData_: '051_events/events_service.gs', updateEventClosureData_: '051_events/events_service.gs', getEventForEditData_: '051_events/events_query_service.gs',
  getEventListData_: '051_events/events_query_service.gs', buildUniqueEventValues_: '051_events/events_query_service.gs', getEventDetailData_: '051_events/events_query_service.gs',
  buildEventDetailSection_: '051_events/events_query_service.gs', attachEventDetailApplicantRelations_: '051_events/events_query_service.gs',
  processApplicantData_: '052_applicants/applicants_service.gs', getApplicantListData_: '052_applicants/applicants_query_service.gs', getApplicantDetailData_: '052_applicants/applicants_query_service.gs',
  buildEventExtraAnswersByApplicationId_: '052_applicants/applicants_query_service.gs', buildEventApplicantSectionRows_: '052_applicants/applicants_query_service.gs',
  listEventExtraAnswerClientRows_: '052_applicants/applicants_sheet_dao.gs',
  createEventPaymentData_: '053_payment/payment_service.gs', updateEventPaymentData_: '053_payment/payment_service.gs', resolveEventPaymentActorEmail_: '053_payment/payment_service.gs',
  buildEventPaymentTotalsByApplicationId_: '053_payment/payment_query_service.gs', getEventPaymentRowsByApplicationId_: '053_payment/payment_query_service.gs',
  buildEventPaymentAccountingFacts_: '053_payment/payment_query_service.gs', buildEventPaymentSectionRows_: '053_payment/payment_query_service.gs', listEventPaymentClientRows_: '053_payment/payment_sheet_dao.gs',
  findEventPaymentRowById_: '053_payment/payment_sheet_dao.gs', findEventPaymentRowsByApplicationId_: '053_payment/payment_sheet_dao.gs',
  insertEventPaymentRow_: '053_payment/payment_sheet_dao.gs', updateEventPaymentRowById_: '053_payment/payment_sheet_dao.gs',
  applyAttendanceChangesData_: '054_attendance/attendance_service.gs', getAttendanceListData_: '054_attendance/attendance_query_service.gs', buildEventAttendanceSectionRows_: '054_attendance/attendance_query_service.gs',
  findEventAttendanceRowByApplicationId_: '054_attendance/attendance_sheet_dao.gs', getEventRefundListData_: '055_refunds/refunds_query_service.gs', buildEventRefundSectionRows_: '055_refunds/refunds_query_service.gs',
  uploadEventRelatedMaterial_: '056_files/event_file_service.gs', resolveEventMaterialFolder_: '056_files/event_file_service.gs', sanitizeEventDriveFileName_: '056_files/event_file_service.gs'
};
Object.keys(ownership).forEach(function (name) { requireFunctionIn_(functions, name, ownership[name]); });
Object.keys(functions).forEach(function (name) { if (functions[name].length > 1) failures.push('Duplicate Event function: ' + name + ' in ' + functions[name].join(', ')); });

['051_events/events_query_service.gs','052_applicants/applicants_query_service.gs','053_payment/payment_query_service.gs','054_attendance/attendance_query_service.gs','055_refunds/refunds_query_service.gs'].forEach(function (relativePath) {
  forbidPatternIn_(relativePath, /withOperationWriteLock_|appendOperationTableRow_|updateOperationTableRow_|DriveApp|createFile\s*\(/, 'Event Query Service must be read-only');
});

listSourceFiles_(EVENT_ROOT).forEach(function (file) {
  var relativePath = normalize_(path.relative(EVENT_ROOT, file));
  var source = fs.readFileSync(file, 'utf8');
  var forbidden = /bankTransactions|findBankTransaction[A-Za-z0-9_]*|createLedgerEntryData_|linkLedgerBankTransactionData_|processReconciliationData_|createLedgerFromReconciliationData_/;
  if (forbidden.test(source)) failures.push('Event must not depend on Accounting internals: ' + relativePath);
});

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Event architecture verification passed.');
}
