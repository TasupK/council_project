var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SRC = path.join(ROOT, 'src');
var BACKEND_ROOTS = ['src/backend/'];
var ALLOWED_DIRECT_GAS = [
  'src/frontend/shared/api/app_api_runner_js.html'
];
var failures = [];

function listFiles_(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listFiles_(target));
    if (/\.(html|js)$/.test(entry.name)) files.push(target);
    return files;
  }, []);
}

listFiles_(SRC).forEach(function (file) {
  var relative = path.relative(ROOT, file).replace(/\\/g, '/');
  if (BACKEND_ROOTS.some(function (prefix) { return relative.indexOf(prefix) === 0; })) return;
  var source = fs.readFileSync(file, 'utf8');
  if (/google\.script\.run/.test(source) && ALLOWED_DIRECT_GAS.indexOf(relative) < 0) failures.push('Direct google.script.run outside shared runner: ' + relative);
});

[
  'src/frontend/shared/api/app_api_runner_js.html',
  'src/frontend/entities/user/api/app_client_js.html',
  'src/frontend/entities/iam/api/settings_client_js.html',
  'src/frontend/entities/ledger/api/ledger_client_js.html',
  'src/frontend/entities/reconciliation/api/reconciliation_client_js.html',
  'src/frontend/entities/settlement/api/settlement_client_js.html',
  'src/frontend/entities/student_fee/api/student_fee_client_js.html',
  'src/frontend/entities/student_fee_payer/api/student_fee_payer_client_js.html',
  'src/frontend/entities/student_fee_payment/api/student_fee_payment_client_js.html',
  'src/frontend/entities/student_fee_refund/api/student_fee_refund_client_js.html',
  'src/frontend/entities/event/api/event_client_js.html'
].forEach(function (relative) {
  if (!fs.existsSync(path.join(ROOT, relative))) failures.push('Missing API contract file: ' + relative);
});

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Frontend API Contract v1 verification passed.');
}
