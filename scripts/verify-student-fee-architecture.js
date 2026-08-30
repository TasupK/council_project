var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var DOMAIN_ROOT = path.join(ROOT, 'src', 'backend', 'domains', 'student_fee');
var FORM_READER = 'repositories/fee_form_reader.gs';
var FORM_SETTINGS_REPOSITORY = 'repositories/student_fee_form_settings_repository.gs';
var FORM_IMPORT = 'application/fee_form_import.gs';

var REQUIRED_FILES = [
  'controllers/student_fee_request.gs',
  'controllers/student_fee_reference_controller.gs',
  'application/student_fee_reference_query.gs',
  'application/student_fee_access.gs',
  'repositories/student_fee_audit_repository.gs',
  'business_rules/student_fee_coverage_policy.gs',
  FORM_SETTINGS_REPOSITORY,
  'controllers/fee_payers_controller.gs',
  'application/fee_payers_mutation.gs',
  'application/fee_payers_query.gs',
  'repositories/fee_payers_repository.gs',
  'controllers/fee_payments_controller.gs',
  'application/fee_payments_mutation.gs',
  'application/fee_payments_query.gs',
  'repositories/fee_applications_repository.gs',
  'repositories/fee_payments_repository.gs',
  FORM_READER,
  'repositories/fee_form_mapper.gs',
  FORM_IMPORT,
  'controllers/fee_refunds_controller.gs',
  'application/fee_refunds_mutation.gs',
  'application/fee_refunds_query.gs',
  'repositories/fee_refund_requests_repository.gs',
  'repositories/fee_refunds_repository.gs'
];

var FUNCTION_OWNERS = {
  api_getStudentFeeReference: 'controllers/student_fee_reference_controller.gs',
  readStudentFeeSemesterRows_: 'application/student_fee_reference_query.gs',
  getStudentFeeReferenceData_: 'application/student_fee_reference_query.gs',
  calculateStudentFeeCoverage_: 'business_rules/student_fee_coverage_policy.gs',
  getStudentFeeFormSettings_: FORM_SETTINGS_REPOSITORY,
  updateStudentFeeFormLastSyncedAt_: FORM_SETTINGS_REPOSITORY,
  api_getStudentFeePayers: 'controllers/fee_payers_controller.gs',
  api_getStudentFeePayer: 'controllers/fee_payers_controller.gs',
  api_createStudentFeePayer: 'controllers/fee_payers_controller.gs',
  api_updateStudentFeePayer: 'controllers/fee_payers_controller.gs',
  api_getStudentFeeSummary: 'controllers/fee_payments_controller.gs',
  api_getStudentFeeApplications: 'controllers/fee_payments_controller.gs',
  api_getStudentFeeApplication: 'controllers/fee_payments_controller.gs',
  api_syncStudentFeeFormApplications: 'controllers/fee_payments_controller.gs',
  api_processStudentFeeApplications: 'controllers/fee_payments_controller.gs',
  api_calculateStudentFeeAmount: 'controllers/fee_payments_controller.gs',
  api_confirmStudentFeePayment: 'controllers/fee_payments_controller.gs',
  readStudentFeeFormResponses_: FORM_READER,
  mapStudentFeeFormResponse_: 'repositories/fee_form_mapper.gs',
  syncStudentFeeFormApplicationsData_: FORM_IMPORT,
  api_getStudentFeeRefundRequests: 'controllers/fee_refunds_controller.gs',
  api_getStudentFeeRefundRequest: 'controllers/fee_refunds_controller.gs',
  api_processStudentFeeRefundRequests: 'controllers/fee_refunds_controller.gs',
  api_calculateStudentFeeRefund: 'controllers/fee_refunds_controller.gs',
  api_confirmStudentFeeRefund: 'controllers/fee_refunds_controller.gs'
};

var API_OWNERS = {};
Object.keys(FUNCTION_OWNERS).forEach(function (name) {
  if (name.indexOf('api_') === 0) API_OWNERS[name] = FUNCTION_OWNERS[name];
});

var REPOSITORY_TABLES = {
  'repositories/fee_payers_repository.gs': 'feePayers',
  'repositories/fee_applications_repository.gs': 'feeApplications',
  'repositories/fee_payments_repository.gs': 'feePayments',
  'repositories/fee_refund_requests_repository.gs': 'feeRefundRequests',
  'repositories/fee_refunds_repository.gs': 'feeRefunds'
};

var OPERATION_TABLES = [
  'settings', 'businessAuditLogs', 'semesters', 'feeRates', 'feePayers',
  'feeApplications', 'feePayments', 'feeRefundRequests', 'feeRefunds',
  'events', 'eventForms', 'eventApplications', 'eventExtraAnswers',
  'eventPayments', 'eventAttendances', 'eventRefunds', 'ledger', 'evidence'
];

function filePath_(relative) { return path.join(DOMAIN_ROOT, relative); }
function read_(relative) { return fs.readFileSync(filePath_(relative), 'utf8'); }
function listGs_(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listGs_(target));
    if (/\.gs$/.test(entry.name)) files.push(target);
    return files;
  }, []);
}

function collectFunctions_(files) {
  var found = {};
  files.forEach(function (file) {
    var source = fs.readFileSync(file, 'utf8');
    var regex = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    var match;
    while ((match = regex.exec(source)) !== null) {
      if (!found[match[1]]) found[match[1]] = [];
      found[match[1]].push(path.relative(DOMAIN_ROOT, file).replace(/\\/g, '/'));
    }
  });
  return found;
}

function verifyRequired_(failures) {
  REQUIRED_FILES.forEach(function (relative) {
    var file = filePath_(relative);
    if (!fs.existsSync(file)) failures.push('Missing required file: ' + relative);
    else if (!fs.readFileSync(file, 'utf8').trim()) failures.push('Required file is empty: ' + relative);
  });
}

function verifySyntaxAndDuplicates_(files, failures) {
  files.forEach(function (file) {
    try { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }); }
    catch (error) { failures.push('Syntax error: ' + path.relative(ROOT, file) + ': ' + error.message); }
  });
  var functions = collectFunctions_(files);
  Object.keys(functions).forEach(function (name) {
    if (functions[name].length > 1) failures.push('Duplicate function: ' + name + ' in ' + functions[name].join(', '));
  });
  Object.keys(FUNCTION_OWNERS).forEach(function (name) {
    var owners = functions[name] || [];
    if (owners.length !== 1 || owners[0] !== FUNCTION_OWNERS[name]) {
      failures.push('Function owner mismatch: ' + name + ' expected ' + FUNCTION_OWNERS[name] + ' got ' + (owners.join(', ') || 'missing'));
    }
  });
}

function verifyForbiddenPatterns_(files, failures) {
  var forbidden = [
    { pattern: /Session\.getActiveUser\s*\(/, label: 'Session.getActiveUser' },
    { pattern: /\bapiV1_/, label: 'apiV1_' },
    { pattern: /\bAPI_REGISTRY\b/, label: 'API_REGISTRY' },
    { pattern: /\bcallApi_\b/, label: 'callApi_' },
    { pattern: /\bSCHEMA\b/, label: 'SCHEMA' },
    { pattern: /\breadAll_\b/, label: 'readAll_' },
    { pattern: /\binsertRow_\b/, label: 'insertRow_' },
    { pattern: /\bupdateRow_\b/, label: 'updateRow_' },
    { pattern: /\.newTrigger\s*\(/, label: 'newTrigger' },
    { pattern: /\b(?:BaseRepository|BaseService)\b/, label: 'inheritance base abstraction' }
  ];
  files.forEach(function (file) {
    var relative = path.relative(DOMAIN_ROOT, file).replace(/\\/g, '/');
    var source = fs.readFileSync(file, 'utf8');
    forbidden.forEach(function (rule) {
      if (rule.pattern.test(source)) failures.push('Forbidden pattern ' + rule.label + ': ' + relative);
    });
    if (relative !== FORM_READER && /\bFormApp\b/.test(source)) failures.push('FormApp access must be isolated to ' + FORM_READER + ': ' + relative);
  });
}

function verifyBusinessRules_(failures) {
  listGs_(path.join(DOMAIN_ROOT, 'business_rules')).forEach(function (file) {
    var relative = path.relative(DOMAIN_ROOT, file).replace(/\\/g, '/');
    var source = fs.readFileSync(file, 'utf8');
    ['SpreadsheetApp', 'DriveApp', 'FormApp', 'Session', 'LockService'].forEach(function (symbol) {
      if (source.indexOf(symbol) >= 0) failures.push('Business Rule uses infrastructure ' + symbol + ': ' + relative);
    });
  });
}

function verifyFormReaderBoundary_(failures) {
  if (!fs.existsSync(filePath_(FORM_READER))) return;
  var source = read_(FORM_READER);
  if (!/FormApp\.openById\s*\(/.test(source) || !/\.getResponses\s*\(/.test(source)) failures.push('Student Fee Form reader must open the configured Form and read responses.');
  var forbiddenWrites = [/\.deleteResponse\s*\(/, /\.submitGrades\s*\(/, /\.setDestination\s*\(/, /\.createResponse\s*\(/, /\.newTrigger\s*\(/];
  if (forbiddenWrites.some(function (pattern) { return pattern.test(source); })) failures.push('Student Fee Form reader must remain read-only: ' + FORM_READER);
}

function verifyFormSettingsRepository_(failures) {
  if (!fs.existsSync(filePath_(FORM_SETTINGS_REPOSITORY))) return;
  var source = read_(FORM_SETTINGS_REPOSITORY);
  ['학생회비GoogleFormID', '학생회비Form연동활성여부', '학생회비Form마지막동기화일시', '학생회비현재학기ID'].forEach(function (key) {
    if (source.indexOf(key) < 0) failures.push('Missing Student Fee Form setting key: ' + key);
  });
  if (source.indexOf("'settings'") < 0 && source.indexOf('"settings"') < 0) failures.push('Student Fee Form settings repository must use OperationDB settings.');
  if (/\bFormApp\b/.test(source)) failures.push('Student Fee Form settings repository must not access FormApp.');
}

function verifyFormImportBoundary_(failures) {
  if (!fs.existsSync(filePath_(FORM_IMPORT))) return;
  var source = read_(FORM_IMPORT);
  if (source.indexOf('findFeeApplicationRowBySourceResponseId_(') < 0) failures.push('Student Fee Form import must enforce source-response idempotency.');
  if (source.indexOf("'IMPORT'") < 0 || source.indexOf("'feeApplications'") < 0) failures.push('Student Fee Form import must write IMPORT / feeApplications audit.');
  if (source.indexOf('updateStudentFeeFormLastSyncedAt_(') < 0) failures.push('Student Fee Form import must update last sync time after successful sync.');
  if (/\bFormApp\b/.test(source)) failures.push('Student Fee Form import must use the reader boundary instead of FormApp.');
}

function verifyApiFiles_(failures) {
  Object.keys(API_OWNERS).forEach(function (name) {
    var relative = API_OWNERS[name];
    if (!fs.existsSync(filePath_(relative))) return;
    var source = read_(relative);
    var start = source.indexOf('function ' + name + '(');
    if (start < 0) return;
    var next = source.indexOf('\nfunction ', start + 1);
    var block = source.slice(start, next < 0 ? source.length : next);
    if (block.indexOf('apiHandler_') < 0) failures.push(name + ' must use apiHandler_.');
    if (!/requireLogin\s*:\s*true/.test(block)) failures.push(name + ' must set requireLogin: true.');
    if (/\b(listSheetCrudItems_|findSheetCrudItemById_|insertSheetCrudItem_|updateSheetCrudItemById_|readOperationTableRows_|readOperationTableClientRows_|findOperationTableRowById_|appendOperationTableRow_|updateOperationTableRow_)\s*\(/.test(block)) failures.push(name + ' performs direct Sheet/data primitive access.');
  });
}

function verifyQueriesReadOnly_(files, failures) {
  files.forEach(function (file) {
    var relative = path.relative(DOMAIN_ROOT, file).replace(/\\/g, '/');
    if (!/^application\/.*_query\.gs$/.test(relative)) return;
    var source = fs.readFileSync(file, 'utf8');
    if (/\b(insertSheetCrudItem_|updateSheetCrudItemById_|appendOperationTableRow_|updateOperationTableRow_|insert[A-Za-z0-9_]*Row_|update[A-Za-z0-9_]*RowById_)\s*\(/.test(source)) failures.push('Query Application performs write: ' + relative);
  });
}

function verifyRepositoryOwnership_(failures) {
  Object.keys(REPOSITORY_TABLES).forEach(function (relative) {
    if (!fs.existsSync(filePath_(relative))) return;
    var source = read_(relative);
    var expected = REPOSITORY_TABLES[relative];
    if (source.indexOf("'" + expected + "'") < 0 && source.indexOf('"' + expected + '"') < 0) failures.push('Repository does not reference owned table ' + expected + ': ' + relative);
    OPERATION_TABLES.forEach(function (table) {
      if (table === expected) return;
      if (source.indexOf("'" + table + "'") >= 0 || source.indexOf('"' + table + '"') >= 0) failures.push('Repository references foreign table ' + table + ': ' + relative);
    });
  });
}

function verifyAuditRepository_(failures) {
  var relative = 'repositories/student_fee_audit_repository.gs';
  if (!fs.existsSync(filePath_(relative))) return;
  var source = read_(relative);
  if (source.indexOf('writeBusinessAudit_(') < 0) failures.push('Student Fee audit repository must delegate to writeBusinessAudit_: ' + relative);
  if (/appendOperationTableRow_\(\s*['\"]businessAuditLogs['\"]/.test(source)) failures.push('Student Fee audit repository must not append businessAuditLogs directly: ' + relative);
}

function main_() {
  var failures = [];
  verifyRequired_(failures);
  var files = listGs_(DOMAIN_ROOT);
  verifySyntaxAndDuplicates_(files, failures);
  verifyForbiddenPatterns_(files, failures);
  verifyBusinessRules_(failures);
  verifyFormReaderBoundary_(failures);
  verifyFormSettingsRepository_(failures);
  verifyFormImportBoundary_(failures);
  verifyApiFiles_(failures);
  verifyQueriesReadOnly_(files, failures);
  verifyRepositoryOwnership_(failures);
  verifyAuditRepository_(failures);

  if (failures.length) {
    failures.forEach(function (failure) { console.error(failure); });
    process.exitCode = 1;
    return;
  }
  console.log('Student Fee architecture verification passed.');
}

main_();
