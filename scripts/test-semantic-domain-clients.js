const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
function read(rel) {
  const file = path.join(ROOT, rel);
  assert.ok(fs.existsSync(file), `Missing file: ${rel}`);
  return fs.readFileSync(file, 'utf8');
}

const studentFeeCommon = read('src/frontend/entities/student_fee/ui/student_fee_common_js.html');
const studentFeeClient = read('src/frontend/entities/student_fee/api/student_fee_client_js.html');
const studentFeePayerClient = read('src/frontend/entities/student_fee_payer/api/student_fee_payer_client_js.html');
const studentFeePaymentClient = read('src/frontend/entities/student_fee_payment/api/student_fee_payment_client_js.html');
const studentFeeRefundClient = read('src/frontend/entities/student_fee_refund/api/student_fee_refund_client_js.html');
const studentFeePages = [
  'src/frontend/pages/student_fee_home/student_fee_home_controller_js.html',
  'src/frontend/features/student_fee_payer_manage/student_fee_payer_manage_js.html',
  'src/frontend/pages/student_fee_payers/student_fee_payers_controller_js.html',
  'src/frontend/features/student_fee_payment_manage/student_fee_payment_manage_js.html',
  'src/frontend/pages/student_fee_payments/student_fee_payments_controller_js.html',
  'src/frontend/features/student_fee_refund_manage/student_fee_refund_manage_js.html',
  'src/frontend/pages/student_fee_refunds/student_fee_refunds_controller_js.html'
].map(read).join('\n');

assert.doesNotMatch(studentFeeCommon, /function\s+studentFeeApi\s*\(/, 'studentFeeApi compatibility wrapper must be removed');
assert.doesNotMatch(studentFeePages, /\bstudentFeeApi\s*\(/, 'Student Fee UI code must use semantic clients');
assert.doesNotMatch(studentFeePages, /['"]api_[A-Za-z0-9_]+['"]/, 'Student Fee UI code must not own raw server API names');
assert.match(studentFeeClient, /var\s+studentFeeClient\s*=\s*\{/, 'Student Fee semantic client must exist');
assert.match(studentFeeClient, /getSummary\s*:\s*function/);
assert.doesNotMatch(studentFeeClient, /api_(?:getStudentFeePayers|getStudentFeeApplications|getStudentFeeRefundRequests)/, 'general Student Fee client must only own summary API');
assert.match(studentFeePayerClient, /var\s+studentFeePayerClient\s*=\s*\{/, 'Student Fee payer semantic client must exist');
assert.match(studentFeePayerClient, /getPayers\s*:\s*function/);
assert.match(studentFeePayerClient, /createPayer\s*:\s*function/);
assert.match(studentFeePayerClient, /updatePayer\s*:\s*function/);
assert.match(studentFeePaymentClient, /var\s+studentFeePaymentClient\s*=\s*\{/, 'Student Fee payment semantic client must exist');
assert.match(studentFeePaymentClient, /getApplications\s*:\s*function/);
assert.match(studentFeePaymentClient, /calculateAmount\s*:\s*function/);
assert.match(studentFeePaymentClient, /processApplications\s*:\s*function/);
assert.match(studentFeePaymentClient, /confirmPayment\s*:\s*function/);
assert.match(studentFeeRefundClient, /var\s+studentFeeRefundClient\s*=\s*\{/, 'Student Fee refund semantic client must exist');
assert.match(studentFeeRefundClient, /getRefundRequests\s*:\s*function/);
assert.match(studentFeeRefundClient, /calculateRefund\s*:\s*function/);
assert.match(studentFeeRefundClient, /processRefundRequests\s*:\s*function/);
assert.match(studentFeeRefundClient, /confirmRefund\s*:\s*function/);

const eventCommon = read('src/frontend/entities/event/ui/event_common_js.html');
const eventClient = read('src/frontend/entities/event/api/event_client_js.html');
const eventPages = [
  'src/frontend/features/event_list/event_list_js.html',
  'src/frontend/pages/event_home/event_home_controller_js.html',
  'src/frontend/features/event_form_manage/event_form_manage_js.html',
  'src/frontend/pages/event_form/event_form_controller_js.html',
  'src/frontend/features/event_detail_core/event_detail_core_js.html',
  'src/frontend/features/event_applicant_manage/event_applicant_manage_js.html',
  'src/frontend/features/event_attendance_manage/event_attendance_manage_js.html',
  'src/frontend/features/event_refund_view/event_refund_view_js.html',
  'src/frontend/features/event_form_sync/event_form_sync_js.html',
  'src/frontend/pages/event_detail/event_detail_controller_js.html'
].map(read).join('\n');

assert.doesNotMatch(eventCommon, /function\s+api\s*\(/, 'Event api compatibility wrapper must be removed');
assert.match(eventCommon, /function\s+runEventBusy\s*\(/, 'Event UI loading helper must remain outside the API client');
assert.doesNotMatch(eventPages, /\bapi\s*\(\s*['"]api_/, 'Event pages must call eventClient semantic methods');
assert.doesNotMatch(eventPages, /['"]api_[A-Za-z0-9_]+['"]/, 'Event pages must not own raw server API names');
assert.match(eventClient, /var\s+eventClient\s*=\s*\{/, 'Event semantic client must exist');
assert.doesNotMatch(eventClient, /setLoading\s*\(/, 'Event client must not own UI loading state');

console.log('Semantic domain client contract: PASS');
