var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var EVENT_ROOT = path.join(ROOT, 'src', '000_server', '050_event');
var failures = [];

function exists_(relativePath) {
  return fs.existsSync(path.join(EVENT_ROOT, relativePath));
}

function requireFile_(relativePath) {
  if (!exists_(relativePath)) failures.push('Missing Event architecture file: ' + relativePath);
}

function forbidFile_(relativePath) {
  if (exists_(relativePath)) failures.push('Legacy Event architecture file still exists: ' + relativePath);
}

requireFile_('053_payment/payment_service.gs');
requireFile_('053_payment/payment_sheet_dao.gs');
requireFile_('054_attendance/attendance.gs');
requireFile_('054_attendance/attendance_sheet_dao.gs');
requireFile_('054_attendance/event_attendance.gs');
requireFile_('055_refunds/refunds.gs');
requireFile_('055_refunds/refunds_sheet_dao.gs');
requireFile_('055_refunds/event_refunds.gs');
requireFile_('056_files/event_files.gs');

forbidFile_('050_common/event_payments.gs');
forbidFile_('050_common/event_payment_sheet_dao.gs');
forbidFile_('053_attendance/attendance.gs');
forbidFile_('053_attendance/attendance_sheet_dao.gs');
forbidFile_('053_attendance/event_attendance.gs');
forbidFile_('054_refunds/refunds.gs');
forbidFile_('054_refunds/refunds_sheet_dao.gs');
forbidFile_('054_refunds/event_refunds.gs');
forbidFile_('055_files/event_files.gs');

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Event architecture verification passed.');
}
