var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var SERVER_ROOT = path.join(ROOT, 'src', '000_server');
var CODE_FILE = path.join(SERVER_ROOT, 'Code.js');

var REQUIRED_PUBLIC_FUNCTIONS = [
  'api_checkLogin',
  'api_getCurrentUser',
  'api_getMyPermissions',
  'api_checkUserDbIntegrity',
  'api_checkOperationDbIntegrity',
  'api_getEventList',
  'api_getEventForEdit',
  'api_getEventDetail',
  'api_createEvent',
  'api_updateEvent',
  'api_updateEventStatus',
  'api_closeEvent',
  'api_getApplicantList',
  'api_getApplicantDetail',
  'api_processApplicant',
  'api_getAttendanceList',
  'api_applyAttendanceChanges',
  'api_getEventRefundList',
  'api_getLedgerDatabaseInfo',
  'api_getLedgerList',
  'api_getLedgerDetail',
  'api_getLedgerEventOptions',
  'api_createLedgerEntry',
  'api_saveLedgerDraft',
  'api_processLedgerEntry',
  'api_getSettlementSummary',
  'api_getEvidenceFileContent',
  'loadSettingsHomeData',
  'loadSettingsUsersData',
  'loadSettingsRolesData',
  'loadSettingsPermissionsData',
  'api_getStudentFeeReferenceData',
  'api_getStudentFeeSummary',
  'api_getFeePayerList',
  'api_getFeePayerDetail',
  'api_createFeePayer',
  'api_updateFeePayer',
  'api_getFeeApplicationList',
  'api_getFeeApplicationDetail',
  'api_processFeeApplications',
  'api_calculateFeeAmount',
  'api_confirmFeePayment',
  'api_getFeeRefundRequestList',
  'api_getFeeRefundRequestDetail',
  'api_processFeeRefundRequests',
  'api_calculateFeeRefund',
  'api_confirmFeeRefund',
  'apiHandler_',
  'requirePermission_',
  'sheetFindAll_',
  'sheetFindById_',
  'sheetInsert_',
  'sheetUpdateById_'
];

var REQUIRED_ROUTES = {
  login: '200_login/Login',
  main: '250_main/Main',
  accounting: '400_accounting/400_home/Accounting_Home',
  accounting_ledger: '400_accounting/410_ledger/Accounting_Ledger',
  accounting_reconciliation: '400_accounting/420_reconciliation/Accounting_Reconciliation',
  accounting_settlement: '400_accounting/430_settlement/Accounting_Settlement',
  student_fee: '500_student_fee/500_home/Student_Fee_Home',
  student_fee_payers: '500_student_fee/510_payers/Student_Fee_Payers',
  student_fee_payments: '500_student_fee/520_payments/Student_Fee_Payments',
  student_fee_refunds: '500_student_fee/530_refunds/Student_Fee_Refunds',
  event: '600_event/600_home/Event_Home',
  event_form: '600_event/610_form/Event_Form',
  event_detail: '600_event/620_detail/Event_Detail',
  settings: '300_settings/300_home/Settings_Home',
  settings_users: '300_settings/310_users/Settings_Users',
  settings_roles: '300_settings/320_roles/Settings_Roles',
  settings_permissions: '300_settings/330_permissions/Settings_Permissions'
};

function listFiles_(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listFiles_(target));
    if (/\.(gs|js)$/.test(entry.name)) files.push(target);
    return files;
  }, []);
}

function readSources_(files) {
  return files.map(function (file) {
    return { file: file, source: fs.readFileSync(file, 'utf8') };
  });
}

function collectFunctions_(sources) {
  var functions = {};
  sources.forEach(function (item) {
    var pattern = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    var match;
    while ((match = pattern.exec(item.source)) !== null) {
      if (!functions[match[1]]) functions[match[1]] = [];
      functions[match[1]].push(path.relative(ROOT, item.file));
    }
  });
  return functions;
}

function verifySyntax_(sources, failures) {
  sources.forEach(function (item) {
    try {
      new vm.Script(item.source, { filename: item.file });
    } catch (error) {
      failures.push('Syntax error: ' + path.relative(ROOT, item.file) + ': ' + error.message);
    }
  });
}

function verifyFunctions_(functions, failures) {
  REQUIRED_PUBLIC_FUNCTIONS.forEach(function (name) {
    if (!functions[name]) failures.push('Missing function: ' + name);
  });
  Object.keys(functions).forEach(function (name) {
    if (functions[name].length > 1) {
      failures.push('Duplicate function: ' + name + ' in ' + functions[name].join(', '));
    }
  });
}

function verifyRoutes_(failures) {
  var code = fs.readFileSync(CODE_FILE, 'utf8');
  Object.keys(REQUIRED_ROUTES).forEach(function (route) {
    var template = REQUIRED_ROUTES[route];
    var routePattern = new RegExp('\\b' + route + '\\s*:\\s*[\'\"]' + template.replace(/\//g, '\\/') + '[\'\"]');
    var templateFile = path.join(ROOT, 'src', template + '.html');
    if (!routePattern.test(code)) failures.push('Missing route mapping: ' + route + ' -> ' + template);
    if (!fs.existsSync(templateFile)) failures.push('Missing route template: ' + template + '.html');
  });
}

function verifyNoArrows_(sources, failures) {
  sources.forEach(function (item) {
    if (item.source.indexOf('=>') !== -1) {
      failures.push('Arrow function found: ' + path.relative(ROOT, item.file));
    }
  });
}

function verifyCoreBoundary_(sources, failures) {
  sources.forEach(function (item) {
    var relative = path.relative(ROOT, item.file).replace(/\\/g, '/');
    if (relative.indexOf('src/000_server/010_core/') !== 0) return;
    if (relative.endsWith('/config.gs')) return;
    if (/\b(event|accounting|settings)\b/i.test(item.source)) {
      failures.push('Domain reference found in Core: ' + relative);
    }
  });
}

function main_() {
  var sources = readSources_(listFiles_(SERVER_ROOT));
  var failures = [];
  verifySyntax_(sources, failures);
  verifyFunctions_(collectFunctions_(sources), failures);
  verifyRoutes_(failures);
  verifyNoArrows_(sources, failures);
  verifyCoreBoundary_(sources, failures);

  if (failures.length) {
    failures.forEach(function (failure) {
      console.error(failure);
    });
    process.exitCode = 1;
    return;
  }
  console.log('Server architecture verification passed.');
}

main_();
