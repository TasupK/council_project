var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var DOMAIN_ROOT = path.join(ROOT, 'src', '000_server', '080_student_fee');

var REQUIRED_FILES = [
  '080_common/student_fee_request.gs',
  '080_common/student_fee_reference_query_service.gs',
  '080_common/student_fee_reference_api.gs',
  '080_common/student_fee_audit_sheet_dao.gs',
  '081_payers/fee_payers_api.gs',
  '081_payers/fee_payers_service.gs',
  '081_payers/fee_payers_query_service.gs',
  '081_payers/fee_payers_sheet_dao.gs',
  '082_payments/fee_payments_api.gs',
  '082_payments/fee_payments_service.gs',
  '082_payments/fee_payments_query_service.gs',
  '082_payments/fee_applications_sheet_dao.gs',
  '082_payments/fee_payments_sheet_dao.gs',
  '083_refunds/fee_refunds_api.gs',
  '083_refunds/fee_refunds_service.gs',
  '083_refunds/fee_refunds_query_service.gs',
  '083_refunds/fee_refund_requests_sheet_dao.gs',
  '083_refunds/fee_refunds_sheet_dao.gs'
];

var FUNCTION_OWNERS = {
  api_getStudentFeeReferenceData: '080_common/student_fee_reference_api.gs',
  findAllStudentFeeSemesterRows_: '080_common/student_fee_reference_query_service.gs',
  getStudentFeeReferenceData_: '080_common/student_fee_reference_query_service.gs',
  api_getFeePayerList: '081_payers/fee_payers_api.gs',
  api_getFeePayerDetail: '081_payers/fee_payers_api.gs',
  api_createFeePayer: '081_payers/fee_payers_api.gs',
  api_updateFeePayer: '081_payers/fee_payers_api.gs',
  api_getStudentFeeSummary: '082_payments/fee_payments_api.gs',
  api_getFeeApplicationList: '082_payments/fee_payments_api.gs',
  api_getFeeApplicationDetail: '082_payments/fee_payments_api.gs',
  api_processFeeApplications: '082_payments/fee_payments_api.gs',
  api_calculateFeeAmount: '082_payments/fee_payments_api.gs',
  api_confirmFeePayment: '082_payments/fee_payments_api.gs',
  api_getFeeRefundRequestList: '083_refunds/fee_refunds_api.gs',
  api_getFeeRefundRequestDetail: '083_refunds/fee_refunds_api.gs',
  api_processFeeRefundRequests: '083_refunds/fee_refunds_api.gs',
  api_calculateFeeRefund: '083_refunds/fee_refunds_api.gs',
  api_confirmFeeRefund: '083_refunds/fee_refunds_api.gs'
};

var API_OWNERS = {};
Object.keys(FUNCTION_OWNERS).forEach(function (name) {
  if (name.indexOf('api_') === 0) API_OWNERS[name] = FUNCTION_OWNERS[name];
});

var DAO_TABLES = {
  '080_common/student_fee_audit_sheet_dao.gs': 'businessAuditLogs',
  '081_payers/fee_payers_sheet_dao.gs': 'feePayers',
  '082_payments/fee_applications_sheet_dao.gs': 'feeApplications',
  '082_payments/fee_payments_sheet_dao.gs': 'feePayments',
  '083_refunds/fee_refund_requests_sheet_dao.gs': 'feeRefundRequests',
  '083_refunds/fee_refunds_sheet_dao.gs': 'feeRefunds'
};

var OPERATION_TABLES = [
  'settings', 'businessAuditLogs', 'semesters', 'feeRates', 'feePayers',
  'feeApplications', 'feePayments', 'feeRefundRequests', 'feeRefunds',
  'events', 'eventForms', 'eventApplications', 'eventExtraAnswers',
  'eventPayments', 'eventAttendances', 'eventRefunds', 'ledger', 'evidence'
];

function filePath_(relative) {
  return path.join(DOMAIN_ROOT, relative);
}

function read_(relative) {
  return fs.readFileSync(filePath_(relative), 'utf8');
}

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
    if (!fs.existsSync(file)) {
      failures.push('Missing required file: ' + relative);
      return;
    }
    if (!fs.readFileSync(file, 'utf8').trim()) failures.push('Required file is empty: ' + relative);
  });
  if (fs.existsSync(path.join(DOMAIN_ROOT, '084_forms'))) failures.push('084_forms must not exist in this phase.');
}

function verifySyntaxAndDuplicates_(files, failures) {
  files.forEach(function (file) {
    try {
      new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file });
    } catch (error) {
      failures.push('Syntax error: ' + path.relative(ROOT, file) + ': ' + error.message);
    }
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
    { pattern: /\bFormApp\b/, label: 'FormApp' },
    { pattern: /\.newTrigger\s*\(/, label: 'newTrigger' }
  ];
  files.forEach(function (file) {
    var source = fs.readFileSync(file, 'utf8');
    forbidden.forEach(function (rule) {
      if (rule.pattern.test(source)) failures.push('Forbidden pattern ' + rule.label + ': ' + path.relative(DOMAIN_ROOT, file));
    });
  });
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
    if (/\b(sheetFindAll_|sheetFindById_|sheetInsert_|sheetUpdateById_|readOperationTableRows_|readOperationTableClientRows_|findOperationTableRowById_|appendOperationTableRow_|updateOperationTableRow_)\s*\(/.test(block)) {
      failures.push(name + ' performs direct Sheet/data primitive access.');
    }
  });
}

function verifyQueryServices_(files, failures) {
  files.forEach(function (file) {
    var relative = path.relative(DOMAIN_ROOT, file).replace(/\\/g, '/');
    if (relative.indexOf('_query_service.gs') < 0) return;
    var source = fs.readFileSync(file, 'utf8');
    if (/\b(sheetInsert_|sheetUpdateById_|appendOperationTableRow_|updateOperationTableRow_|insert[A-Za-z0-9_]*Row_|update[A-Za-z0-9_]*RowById_)\s*\(/.test(source)) {
      failures.push('Query Service performs write: ' + relative);
    }
  });
}

function verifyDaoOwnership_(failures) {
  Object.keys(DAO_TABLES).forEach(function (relative) {
    if (!fs.existsSync(filePath_(relative))) return;
    var source = read_(relative);
    var expected = DAO_TABLES[relative];
    if (source.indexOf("'" + expected + "'") < 0 && source.indexOf('"' + expected + '"') < 0) {
      failures.push('DAO does not reference owned table ' + expected + ': ' + relative);
    }
    OPERATION_TABLES.forEach(function (table) {
      if (table === expected) return;
      var single = "'" + table + "'";
      var double = '"' + table + '"';
      if (source.indexOf(single) >= 0 || source.indexOf(double) >= 0) {
        failures.push('DAO references foreign table ' + table + ': ' + relative);
      }
    });
  });
}

function main_() {
  var failures = [];
  verifyRequired_(failures);
  var files = listGs_(DOMAIN_ROOT);
  verifySyntaxAndDuplicates_(files, failures);
  verifyForbiddenPatterns_(files, failures);
  verifyApiFiles_(failures);
  verifyQueryServices_(files, failures);
  verifyDaoOwnership_(failures);

  if (failures.length) {
    failures.forEach(function (failure) { console.error(failure); });
    process.exitCode = 1;
    return;
  }
  console.log('Student Fee architecture verification passed.');
}

main_();
