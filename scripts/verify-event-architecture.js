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
forbidFile_('050_common/event_payments.gs');
forbidFile_('050_common/event_payment_sheet_dao.gs');

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Event architecture verification passed.');
}
