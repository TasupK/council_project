var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SERVER = path.join(ROOT, 'src', '000_server');
var failures = [];

var RENAMED_SYMBOLS = [
  'toUserDto_', 'getRolesById_', 'toRoleDto_', 'toPermissionDto_', 'getPermissionsById_',
  'toDepartmentDto_', 'getDepartmentsById_', 'updateEventStatusData_', 'closeEventData_',
  'findAllEventRows_', 'findAllEventClientRows_', 'getEventFormHeaderAliases_', 'eventFormCell_',
  'stableEventFormResponseId_', 'eventFormQuestionId_', 'extractGoogleResourceId_',
  'selectEventFormResponseSheet_', 'syncApplicantsFromFormsData_',
  'findAllEventApplicationClientRows_', 'findAllEventApplicationSourceResponseIds_',
  'findAllEventPaymentClientRows_', 'findAllEventAttendanceClientRows_', 'findAllEventRefundClientRows_',
  'findAllLedgerRows_', 'findAllLedgerEvidenceRows_', 'findAllBankOcrLogRows_',
  'findAllBankTransactionRows_', 'findAllReconciliationRows_', 'findAllReconciliationItemRows_',
  'findAllSettlementReportRows_', 'findAllFeePayerRows_', 'findAllFeeApplicationRows_',
  'findAllFeePaymentRows_', 'findAllFeeRefundRequestRows_', 'findAllFeeRefundRows_'
];

function listFiles_(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listFiles_(target));
    if (/\.gs$/.test(entry.name)) files.push(target);
    return files;
  }, []);
}

function collectFunctions_(file) {
  var source = fs.readFileSync(file, 'utf8');
  var pattern = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  var names = [];
  var match;
  while ((match = pattern.exec(source)) !== null) names.push(match[1]);
  return names;
}

listFiles_(SERVER).forEach(function (file) {
  var relative = path.relative(ROOT, file).replace(/\\/g, '/');
  collectFunctions_(file).forEach(function (name) {
    if (name.indexOf('api_') === 0) return;
    if (!/_$/.test(name)) return;
    if (/^(handle|execute)[A-Z_]/.test(name)) {
      failures.push('Ambiguous internal verb: ' + name + ' in ' + relative);
    }
    if (/_sheet_dao\.gs$/.test(relative) && /^findAll[A-Z]/.test(name)) {
      failures.push('DAO collection read must use list*: ' + name + ' in ' + relative);
    }
    if (RENAMED_SYMBOLS.indexOf(name) >= 0) {
      failures.push('Legacy internal symbol remains: ' + name + ' in ' + relative);
    }
  });
});

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Internal function naming verification passed.');
}
