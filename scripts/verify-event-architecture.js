var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var EVENT_ROOT = path.join(ROOT, 'src', '000_server', '050_event');
var failures = [];

function normalize_(value) {
  return value.replace(/\\/g, '/');
}

function exists_(relativePath) {
  return fs.existsSync(path.join(EVENT_ROOT, relativePath));
}

function requireFile_(relativePath) {
  if (!exists_(relativePath)) failures.push('Missing Event architecture file: ' + relativePath);
}

function forbidFile_(relativePath) {
  if (exists_(relativePath)) failures.push('Legacy Event architecture file still exists: ' + relativePath);
}

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
    failures.push(
      'Function ownership mismatch: ' + name +
      ' expected ' + relativePath +
      ', found ' + (locations.length ? locations.join(', ') : 'none')
    );
  }
}

requireFile_('050_common/event_query_service.gs');
requireFile_('051_events/events_api.gs');
requireFile_('051_events/events_service.gs');
requireFile_('051_events/events_validator.gs');
requireFile_('052_applicants/applicants_api.gs');
requireFile_('052_applicants/applicants_service.gs');
requireFile_('053_payment/payment_service.gs');
requireFile_('053_payment/payment_sheet_dao.gs');
requireFile_('054_attendance/attendance_api.gs');
requireFile_('054_attendance/attendance_service.gs');
requireFile_('054_attendance/attendance_sheet_dao.gs');
requireFile_('055_refunds/refunds_api.gs');
requireFile_('055_refunds/refunds_sheet_dao.gs');
requireFile_('056_files/event_file_service.gs');

forbidFile_('050_common/event_payments.gs');
forbidFile_('050_common/event_payment_sheet_dao.gs');
forbidFile_('051_events/events.gs');
forbidFile_('051_events/event_events.gs');
forbidFile_('052_applicants/applicants.gs');
forbidFile_('052_applicants/event_applicants.gs');
forbidFile_('053_attendance/attendance.gs');
forbidFile_('053_attendance/attendance_sheet_dao.gs');
forbidFile_('053_attendance/event_attendance.gs');
forbidFile_('054_attendance/attendance.gs');
forbidFile_('054_attendance/event_attendance.gs');
forbidFile_('054_refunds/refunds.gs');
forbidFile_('054_refunds/refunds_sheet_dao.gs');
forbidFile_('054_refunds/event_refunds.gs');
forbidFile_('055_refunds/refunds.gs');
forbidFile_('055_refunds/event_refunds.gs');
forbidFile_('055_files/event_files.gs');
forbidFile_('056_files/event_files.gs');

var functions = collectFunctions_();
var ownership = {
  buildEventPayload_: '051_events/events_validator.gs',
  createEventData_: '051_events/events_service.gs',
  updateEventData_: '051_events/events_service.gs',
  updateEventStatusData_: '051_events/events_service.gs',
  closeEventData_: '051_events/events_service.gs',
  getEventData_: '051_events/events_service.gs',
  processApplicantData_: '052_applicants/applicants_service.gs',
  getEventPaymentTotalsByApplicationId_: '053_payment/payment_service.gs',
  findAllEventPaymentClientRows_: '053_payment/payment_sheet_dao.gs',
  applyAttendanceChangesData_: '054_attendance/attendance_service.gs',
  findEventAttendanceByApplicationId_: '054_attendance/attendance_service.gs',
  getEventListData_: '050_common/event_query_service.gs',
  getUniqueEventValues_: '050_common/event_query_service.gs',
  getEventDetailData_: '050_common/event_query_service.gs',
  getApplicantListData_: '050_common/event_query_service.gs',
  getApplicantDetailData_: '050_common/event_query_service.gs',
  getAttendanceListData_: '050_common/event_query_service.gs',
  getEventRefundListData_: '050_common/event_query_service.gs',
  uploadEventRelatedMaterial_: '056_files/event_file_service.gs',
  getEventMaterialFolder_: '056_files/event_file_service.gs',
  sanitizeEventDriveFileName_: '056_files/event_file_service.gs'
};

Object.keys(ownership).forEach(function (name) {
  requireFunctionIn_(functions, name, ownership[name]);
});

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Event architecture verification passed.');
}
