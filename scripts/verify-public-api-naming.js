var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SERVER = path.join(ROOT, 'src', '000_server');
var failures = [];

var LEGACY_PUBLIC_SYMBOLS = [
  'api_getEventList', 'api_getEventForEdit', 'api_getEventDetail',
  'api_getApplicantList', 'api_getApplicantDetail', 'api_processApplicant',
  'api_syncApplicantsFromForms', 'api_getAttendanceList', 'api_applyAttendanceChanges',
  'api_getEventRefundList',
  'api_getLedgerList', 'api_getLedgerDetail', 'api_saveLedgerDraft',
  'api_getEvidenceFileContent', 'api_getEvidenceAuditList',
  'api_uploadBankTransactions', 'api_runReconciliation', 'api_getReconciliationList',
  'api_getReconciliationDetail', 'api_linkReconciliation',
  'api_createLedgerFromReconciliation', 'api_generateSettlementReport',
  'api_getSettlementReportList',
  'api_getStudentFeeReferenceData', 'api_getFeePayerList', 'api_getFeePayerDetail',
  'api_createFeePayer', 'api_updateFeePayer', 'api_getFeeApplicationList',
  'api_getFeeApplicationDetail', 'api_processFeeApplications', 'api_calculateFeeAmount',
  'api_confirmFeePayment', 'api_getFeeRefundRequestList', 'api_getFeeRefundRequestDetail',
  'api_processFeeRefundRequests', 'api_calculateFeeRefund', 'api_confirmFeeRefund',
  'loadSettingsHomeData', 'loadSettingsUsersData', 'saveSettingsUserDepartment',
  'loadSettingsRolesData', 'loadSettingsPermissionsData', 'loadSettingsDepartmentsData'
];

var NON_API_PUBLIC_ALLOWLIST = {
  authorizeApp: true
};

function listFiles_(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listFiles_(target));
    if (/\.gs$/.test(entry.name)) files.push(target);
    return files;
  }, []);
}

function collectFunctions_(source) {
  var pattern = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  var names = [];
  var match;
  while ((match = pattern.exec(source)) !== null) names.push(match[1]);
  return names;
}

listFiles_(SERVER).forEach(function (file) {
  var relative = path.relative(ROOT, file).replace(/\\/g, '/');
  var source = fs.readFileSync(file, 'utf8');

  LEGACY_PUBLIC_SYMBOLS.forEach(function (name) {
    if (source.indexOf(name) >= 0) {
      failures.push('Legacy public API symbol remains: ' + name + ' in ' + relative);
    }
  });

  collectFunctions_(source).forEach(function (name) {
    if (NON_API_PUBLIC_ALLOWLIST[name]) return;
    if (!/^api_/.test(name)) return;

    if (/(List|Detail|Data)$/.test(name)) {
      failures.push('Public API must use resource semantics instead of output suffix: ' + name + ' in ' + relative);
    }
    if (/^api_(load|save|run|generate)[A-Z_]/.test(name)) {
      failures.push('Disallowed generic public API verb: ' + name + ' in ' + relative);
    }
  });
});

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Public API naming verification passed.');
}
