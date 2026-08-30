var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var EVENT_ROOT = path.join(ROOT, 'src', 'backend', 'domains', 'event');
var failures = [];

function normalize_(value) { return value.replace(/\\/g, '/'); }
function exists_(relativePath) { return fs.existsSync(path.join(EVENT_ROOT, relativePath)); }
function requireFile_(relativePath) { if (!exists_(relativePath)) failures.push('Missing Event architecture file: ' + relativePath); }
function requireDirectory_(relativePath) {
  var target = path.join(EVENT_ROOT, relativePath);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) failures.push('Missing Event architecture directory: ' + relativePath);
}
function listSourceFiles_(directory) {
  if (!fs.existsSync(directory)) return [];
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

['controllers', 'application', 'business_rules', 'repositories'].forEach(requireDirectory_);
[
  'business_rules/event_constants.gs', 'business_rules/event_error.gs', 'business_rules/events_rules.gs',
  'controllers/event_request.gs', 'controllers/events_controller.gs', 'controllers/applicants_controller.gs',
  'controllers/payment_controller.gs', 'controllers/attendance_controller.gs', 'controllers/refunds_controller.gs',
  'application/event_pagination.gs', 'application/events_mutation.gs', 'application/events_query.gs',
  'application/applicants_mutation.gs', 'application/applicants_query.gs',
  'application/payment_mutation.gs', 'application/payment_query.gs',
  'application/attendance_mutation.gs', 'application/attendance_query.gs', 'application/refunds_query.gs',
  'repositories/events_repository.gs', 'repositories/applicants_repository.gs', 'repositories/payment_repository.gs',
  'repositories/attendance_repository.gs', 'repositories/refunds_repository.gs', 'repositories/event_file_repository.gs'
].forEach(requireFile_);

var functions = collectFunctions_();
var ownership = {
  buildEventPayload_: 'business_rules/events_rules.gs',
  createEventData_: 'application/events_mutation.gs', updateEventData_: 'application/events_mutation.gs',
  updateEventStatusData_: 'application/events_mutation.gs', updateEventClosureData_: 'application/events_mutation.gs',
  getEventForEditData_: 'application/events_query.gs', getEventListData_: 'application/events_query.gs',
  buildUniqueEventValues_: 'application/events_query.gs', getEventDetailData_: 'application/events_query.gs',
  buildEventDetailSection_: 'application/events_query.gs', attachEventDetailApplicantRelations_: 'application/events_query.gs',
  processApplicantData_: 'application/applicants_mutation.gs', getApplicantListData_: 'application/applicants_query.gs',
  getApplicantDetailData_: 'application/applicants_query.gs', buildEventExtraAnswersByApplicationId_: 'application/applicants_query.gs',
  buildEventApplicantSectionRows_: 'application/applicants_query.gs', listEventExtraAnswerClientRows_: 'repositories/applicants_repository.gs',
  createEventPaymentData_: 'application/payment_mutation.gs', updateEventPaymentData_: 'application/payment_mutation.gs',
  resolveEventPaymentActorEmail_: 'application/payment_mutation.gs', buildEventPaymentTotalsByApplicationId_: 'application/payment_query.gs',
  getEventPaymentRowsByApplicationId_: 'application/payment_query.gs', buildEventPaymentAccountingFacts_: 'application/payment_query.gs',
  buildEventPaymentSectionRows_: 'application/payment_query.gs', listEventPaymentClientRows_: 'repositories/payment_repository.gs',
  findEventPaymentRowById_: 'repositories/payment_repository.gs', findEventPaymentRowsByApplicationId_: 'repositories/payment_repository.gs',
  insertEventPaymentRow_: 'repositories/payment_repository.gs', updateEventPaymentRowById_: 'repositories/payment_repository.gs',
  applyAttendanceChangesData_: 'application/attendance_mutation.gs', getAttendanceListData_: 'application/attendance_query.gs',
  buildEventAttendanceSectionRows_: 'application/attendance_query.gs', findEventAttendanceRowByApplicationId_: 'repositories/attendance_repository.gs',
  getEventRefundListData_: 'application/refunds_query.gs', buildEventRefundSectionRows_: 'application/refunds_query.gs',
  uploadEventRelatedMaterial_: 'repositories/event_file_repository.gs', resolveEventMaterialFolder_: 'repositories/event_file_repository.gs',
  sanitizeEventDriveFileName_: 'repositories/event_file_repository.gs'
};
Object.keys(ownership).forEach(function (name) { requireFunctionIn_(functions, name, ownership[name]); });

Object.keys(functions).forEach(function (name) {
  var locations = functions[name];
  if (locations.length > 1) failures.push('Duplicate Event function: ' + name + ' in ' + locations.join(', '));
  if (/^api_/.test(name)) {
    locations.forEach(function (location) {
      if (location.indexOf('controllers/') !== 0) failures.push('Event public API must be owned by controllers: ' + name + ' in ' + location);
    });
  }
});

['application/events_query.gs', 'application/applicants_query.gs', 'application/payment_query.gs', 'application/attendance_query.gs', 'application/refunds_query.gs'].forEach(function (relativePath) {
  forbidPatternIn_(relativePath, /withOperationWriteLock_|appendOperationTableRow_|updateOperationTableRow_|DriveApp|createFile\s*\(/, 'Event query application must be read-only');
});

listSourceFiles_(EVENT_ROOT).forEach(function (file) {
  var relativePath = normalize_(path.relative(EVENT_ROOT, file));
  var source = fs.readFileSync(file, 'utf8');
  var forbiddenAccounting = /bankTransactions|findBankTransaction[A-Za-z0-9_]*|createLedgerEntryData_|linkLedgerBankTransactionData_|processReconciliationData_|createLedgerFromReconciliationData_/;
  if (forbiddenAccounting.test(source)) failures.push('Event must not depend on Accounting internals: ' + relativePath);

  if (relativePath.indexOf('repositories/') !== 0 && /(?:readOperationTableRows_|appendOperationTableRow_|updateOperationTableRow_|findOperationTableRowById_)\s*\(/.test(source)) {
    failures.push('Event raw OperationDB access must stay in repositories: ' + relativePath);
  }
});

listSourceFiles_(path.join(EVENT_ROOT, 'business_rules')).forEach(function (file) {
  var relativePath = normalize_(path.relative(EVENT_ROOT, file));
  var source = fs.readFileSync(file, 'utf8');
  if (/\b(?:SpreadsheetApp|DriveApp|DocumentApp|HtmlService|Session|LockService)\b|(?:readOperationTableRows_|appendOperationTableRow_|updateOperationTableRow_|findOperationTableRowById_)\s*\(/.test(source)) {
    failures.push('Event business rules must be platform/persistence independent: ' + relativePath);
  }
});

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Event layered architecture verification passed.');
}
