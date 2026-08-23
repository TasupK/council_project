const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
function read(rel) {
  const file = path.join(ROOT, rel);
  assert.ok(fs.existsSync(file), `Missing file: ${rel}`);
  return fs.readFileSync(file, 'utf8');
}

const studentFeeCommon = read('src/500_student_fee/common/student_fee_common_js.html');
const studentFeeClient = read('src/500_student_fee/common/student_fee_client_js.html');
const studentFeePages = [
  'src/500_student_fee/500_home/student_fee_home_js.html',
  'src/500_student_fee/510_payers/student_fee_payers_js.html',
  'src/500_student_fee/520_payments/student_fee_payments_js.html',
  'src/500_student_fee/530_refunds/student_fee_refunds_js.html'
].map(read).join('\n');

assert.doesNotMatch(studentFeeCommon, /function\s+studentFeeApi\s*\(/, 'studentFeeApi compatibility wrapper must be removed');
assert.doesNotMatch(studentFeePages, /\bstudentFeeApi\s*\(/, 'Student Fee pages must call studentFeeClient semantic methods');
assert.doesNotMatch(studentFeePages, /['"]api_[A-Za-z0-9_]+['"]/, 'Student Fee pages must not own raw server API names');
assert.match(studentFeeClient, /var\s+studentFeeClient\s*=\s*\{/, 'Student Fee semantic client must exist');

const eventCommon = read('src/600_event/600_common/event_common_js.html');
const eventClient = read('src/600_event/600_common/event_client_js.html');
const eventPages = [
  'src/600_event/610_home/event_home_js.html',
  'src/600_event/620_form/event_form_js.html',
  'src/600_event/630_detail/event_detail_core_js.html',
  'src/600_event/630_detail/event_detail_applicants_js.html',
  'src/600_event/630_detail/event_detail_attendance_js.html',
  'src/600_event/630_detail/event_detail_refunds_js.html',
  'src/600_event/630_detail/event_form_sync_js.html',
  'src/600_event/630_detail/event_detail_bootstrap_js.html'
].map(read).join('\n');

assert.doesNotMatch(eventCommon, /function\s+api\s*\(/, 'Event api compatibility wrapper must be removed');
assert.match(eventCommon, /function\s+runEventBusy\s*\(/, 'Event UI loading helper must remain outside the API client');
assert.doesNotMatch(eventPages, /\bapi\s*\(\s*['"]api_/, 'Event pages must call eventClient semantic methods');
assert.doesNotMatch(eventPages, /['"]api_[A-Za-z0-9_]+['"]/, 'Event pages must not own raw server API names');
assert.match(eventClient, /var\s+eventClient\s*=\s*\{/, 'Event semantic client must exist');
assert.doesNotMatch(eventClient, /setLoading\s*\(/, 'Event client must not own UI loading state');

console.log('Semantic domain client contract: PASS');
