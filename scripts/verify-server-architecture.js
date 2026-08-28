var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var SERVER_ROOT = path.join(ROOT, 'src', 'backend');
var CODE_FILE = path.join(SERVER_ROOT, 'app', 'routing', 'Code.js');

var REQUIRED_PUBLIC_FUNCTIONS = [
  'api_checkLogin','api_getCurrentUser','api_getMyPermissions','api_checkUserDbIntegrity','api_checkOperationDbIntegrity',
  'api_getEvents','api_getEvent','api_getEventOverview','api_createEvent','api_updateEvent','api_updateEventStatus','api_closeEvent',
  'api_getEventApplicants','api_getEventApplicant','api_processEventApplicant','api_getEventAttendances','api_applyEventAttendanceChanges','api_getEventRefunds',
  'api_getLedgerDatabaseInfo','api_getLedgerEntries','api_getLedgerEntry','api_getLedgerEventOptions','api_createLedgerEntry','api_createLedgerDraft','api_processLedgerEntry','api_getSettlementSummary','api_getLedgerEvidenceFileContent',
  'api_getSettingsHome','api_getSettingsUsers','api_getSettingsRoles','api_getSettingsPermissions',
  'api_getStudentFeeReference','api_getStudentFeeSummary','api_getStudentFeePayers','api_getStudentFeePayer','api_createStudentFeePayer','api_updateStudentFeePayer','api_getStudentFeeApplications','api_getStudentFeeApplication','api_processStudentFeeApplications','api_calculateStudentFeeAmount','api_confirmStudentFeePayment','api_getStudentFeeRefundRequests','api_getStudentFeeRefundRequest','api_processStudentFeeRefundRequests','api_calculateStudentFeeRefund','api_confirmStudentFeeRefund',
  'apiHandler_','requirePermission_','listSheetCrudItems_','findSheetCrudItemById_','insertSheetCrudItem_','updateSheetCrudItemById_'
];

var REQUIRED_ROUTES = {
  login: '200_login/Login',
  main: 'frontend/pages/main/Main',
  mypage: 'frontend/pages/mypage/MyPage',
  accounting_ledger: 'frontend/pages/accounting_ledger/Accounting_Ledger',
  accounting_reconciliation: 'frontend/pages/accounting_reconciliation/Accounting_Reconciliation',
  accounting_settlement: 'frontend/pages/accounting_settlement/Accounting_Settlement',
  student_fee: 'frontend/pages/student_fee_home/Student_Fee_Home',
  student_fee_payers: 'frontend/pages/student_fee_payers/Student_Fee_Payers',
  student_fee_payments: 'frontend/pages/student_fee_payments/Student_Fee_Payments',
  student_fee_refunds: '500_student_fee/530_refunds/Student_Fee_Refunds',
  event: '600_event/610_home/Event_Home',
  event_form: '600_event/620_form/Event_Form',
  event_detail: '600_event/630_detail/Event_Detail',
  settings: 'frontend/pages/settings_home/Settings_Home',
  settings_departments: 'frontend/pages/settings_departments/Settings_Departments',
  settings_users: 'frontend/pages/settings_users/Settings_Users',
  settings_roles: 'frontend/pages/settings_roles/Settings_Roles',
  settings_permissions: 'frontend/pages/settings_permissions/Settings_Permissions'
};

function listFiles_(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listFiles_(target));
    if (/\.(gs|js)$/.test(entry.name)) files.push(target);
    return files;
  }, []);
}
function readSources_(files) { return files.map(function (file) { return { file: file, source: fs.readFileSync(file, 'utf8') }; }); }
function collectFunctions_(sources) {
  var functions = {};
  sources.forEach(function (item) {
    var pattern = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    var match;
    while ((match = pattern.exec(item.source)) !== null) {
      if (!functions[match[1]]) functions[match[1]] = [];
      functions[match[1]].push(path.relative(ROOT, item.file).replace(/\\/g, '/'));
    }
  });
  return functions;
}
function verifySyntax_(sources, failures) { sources.forEach(function (item) { try { new vm.Script(item.source, { filename: item.file }); } catch (error) { failures.push('Syntax error: ' + path.relative(ROOT, item.file) + ': ' + error.message); } }); }
function verifyFunctions_(functions, failures) {
  REQUIRED_PUBLIC_FUNCTIONS.forEach(function (name) { if (!functions[name]) failures.push('Missing function: ' + name); });
  Object.keys(functions).forEach(function (name) { if (functions[name].length > 1) failures.push('Duplicate function: ' + name + ' in ' + functions[name].join(', ')); });
}
function verifyRoutes_(failures) {
  if (!fs.existsSync(CODE_FILE)) { failures.push('Missing routing entrypoint: src/backend/app/routing/Code.js'); return; }
  var code = fs.readFileSync(CODE_FILE, 'utf8');
  Object.keys(REQUIRED_ROUTES).forEach(function (route) {
    var template = REQUIRED_ROUTES[route];
    var routePattern = new RegExp('\\b' + route + '\\s*:\\s*[\'\"]' + template.replace(/\//g, '\\/') + '[\'\"]');
    var templateFile = path.join(ROOT, 'src', template + '.html');
    if (!routePattern.test(code)) failures.push('Missing route mapping: ' + route + ' -> ' + template);
    if (!fs.existsSync(templateFile)) failures.push('Missing route template: ' + template + '.html');
  });
}
function verifyNoArrows_(sources, failures) { sources.forEach(function (item) { if (item.source.indexOf('=>') !== -1) failures.push('Arrow function found: ' + path.relative(ROOT, item.file)); }); }
function verifyCoreBoundary_(sources, failures) {
  sources.forEach(function (item) {
    var relative = path.relative(ROOT, item.file).replace(/\\/g, '/');
    if (relative.indexOf('src/backend/core/') !== 0) return;
    if (relative.endsWith('/config.gs') || relative.endsWith('/business_audit.gs')) return;
    if (/\b(?:accounting|student[_ ]?fee|event)\b/i.test(item.source)) failures.push('Business-domain reference found in Core: ' + relative);
  });
}
function verifyLayerRoots_(failures) {
  ['app','core','domains'].forEach(function (name) { var target = path.join(SERVER_ROOT, name); if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) failures.push('Missing backend architecture root: src/backend/' + name); });
  ['accounting','event','iam','student_fee'].forEach(function (domain) { var target = path.join(SERVER_ROOT, 'domains', domain); if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) failures.push('Missing backend domain: src/backend/domains/' + domain); });
}
function main_() {
  var failures = [];
  verifyLayerRoots_(failures);
  var sources = readSources_(listFiles_(SERVER_ROOT));
  if (!sources.length) failures.push('No backend source files found under src/backend.');
  verifySyntax_(sources, failures); verifyFunctions_(collectFunctions_(sources), failures); verifyRoutes_(failures); verifyNoArrows_(sources, failures); verifyCoreBoundary_(sources, failures);
  if (failures.length) { failures.forEach(function (failure) { console.error(failure); }); process.exitCode = 1; return; }
  console.log('Migrated backend architecture verification passed.');
}
main_();
