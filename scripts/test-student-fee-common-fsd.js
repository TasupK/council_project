const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const clientPath = 'src/frontend/entities/student_fee/api/student_fee_client_js.html';
const commonPath = 'src/frontend/entities/student_fee/ui/student_fee_common_js.html';
const stylesPath = 'src/frontend/entities/student_fee/ui/Student_Fee_Styles.html';

[clientPath, commonPath, stylesPath].forEach(function (rel) {
  assert.ok(fs.existsSync(path.join(root, rel)), 'missing Student Fee entity common file: ' + rel);
});
assert.ok(!fs.existsSync(path.join(root, 'src/500_student_fee')), 'legacy src/500_student_fee root must be removed');

const client = fs.readFileSync(path.join(root, clientPath), 'utf8');
const common = fs.readFileSync(path.join(root, commonPath), 'utf8');
const styles = fs.readFileSync(path.join(root, stylesPath), 'utf8');

assert.match(client, /var\s+studentFeeClient\s*=\s*\{/);
assert.match(client, /getSummary\s*:\s*function/);
assert.match(client, /api_getStudentFeeSummary/);
[
  'api_getStudentFeePayers', 'api_getStudentFeePayer', 'api_createStudentFeePayer', 'api_updateStudentFeePayer',
  'api_getStudentFeeApplications', 'api_getStudentFeeApplication', 'api_calculateStudentFeeAmount', 'api_processStudentFeeApplications', 'api_confirmStudentFeePayment',
  'api_getStudentFeeRefundRequests', 'api_getStudentFeeRefundRequest', 'api_calculateStudentFeeRefund', 'api_processStudentFeeRefundRequests', 'api_confirmStudentFeeRefund'
].forEach(function (apiName) {
  assert.ok(!client.includes(apiName), 'general Student Fee client must not duplicate domain API: ' + apiName);
});

['studentFeeRunBusy', 'studentFeeSetBusy', 'studentFeeBadge', 'studentFeePaginationHtml', 'studentFeeOpenModal', 'studentFeeCloseModal'].forEach(function (name) {
  assert.ok(common.includes('function ' + name), 'Student Fee UI helper missing: ' + name);
});
assert.ok(!/api_[A-Za-z0-9_]+/.test(common), 'Student Fee UI helpers must not own server API names');
assert.ok(styles.includes('.sf-workspace'));
assert.ok(styles.includes('var(--ui-'));

[
  'src/frontend/pages/student_fee_home/Student_Fee_Home.html',
  'src/frontend/pages/student_fee_payers/Student_Fee_Payers.html',
  'src/frontend/pages/student_fee_payments/Student_Fee_Payments.html',
  'src/frontend/pages/student_fee_refunds/Student_Fee_Refunds.html'
].forEach(function (shellPath) {
  const shell = fs.readFileSync(path.join(root, shellPath), 'utf8');
  assert.ok(shell.includes("include('frontend/entities/student_fee/ui/Student_Fee_Styles')"), shellPath + ' must include migrated Student Fee styles');
  assert.ok(shell.includes("include('frontend/entities/student_fee/ui/student_fee_common_js')"), shellPath + ' must include migrated Student Fee UI helpers');
  assert.ok(!shell.includes('500_student_fee/'), shellPath + ' must not include legacy Student Fee paths');
});

const home = fs.readFileSync(path.join(root, 'src/frontend/pages/student_fee_home/Student_Fee_Home.html'), 'utf8');
assert.ok(home.includes("include('frontend/entities/student_fee/api/student_fee_client_js')"));

console.log('Student Fee common FSD cleanup contract: PASS');
