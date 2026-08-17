var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');

function read_(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function scriptBody_(relativePath) {
  return read_(relativePath)
    .replace(/^\s*<script[^>]*>/, '')
    .replace(/<\/script>\s*$/, '');
}

function createFrontendContext_() {
  var calls = [];
  var runner = {
    withSuccessHandler: function (handler) { runner.success = handler; return runner; },
    withFailureHandler: function (handler) { runner.failure = handler; return runner; }
  };
  return {
    context: vm.createContext({
      console: console,
      Promise: Promise,
      Object: Object,
      Array: Array,
      String: String,
      Number: Number,
      Boolean: Boolean,
      Math: Math,
      Date: Date,
      JSON: JSON,
      isFinite: isFinite,
      URL: URL,
      WEB_APP_URL: 'https://example.test/app',
      window: {
        location: { href: 'https://example.test/app' },
        top: { location: { href: '' } },
        confirm: function () { return true; },
        setTimeout: function (fn) { fn(); return 1; },
        clearTimeout: function () {}
      },
      document: {
        getElementById: function () { return null; },
        querySelectorAll: function () { return []; }
      },
      google: { script: { run: new Proxy(runner, {
        get: function (target, key) {
          if (key in target) return target[key];
          return function (payload) {
            calls.push({ name: key, payload: payload });
            if (target.success) target.success({ ok: true });
          };
        }
      }) } }
    }),
    calls: calls
  };
}

function testStudentFeeApiWrapper_() {
  var fixture = createFrontendContext_();
  vm.runInContext(scriptBody_('src/500_student_fee/common/student_fee_common_js.html'), fixture.context);
  return fixture.context.studentFeeApi('api_getStudentFeeSummary', { page: 1 }).then(function () {
    assert.strictEqual(fixture.calls.length, 1);
    assert.strictEqual(fixture.calls[0].name, 'api_getStudentFeeSummary');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(fixture.calls[0].payload)), { request: { page: 1 } });
  });
}

function testBusyGuardPreventsDoubleSubmit_() {
  var source = read_('src/500_student_fee/common/student_fee_common_js.html');
  assert.match(source, /studentFeeSetBusy|studentFeeWithBusy/);
  assert.match(source, /disabled/);
}

function testStudentFeeRouteHelpers_() {
  var code = read_('src/000_server/Code.js');
  ['student_fee', 'student_fee_payers', 'student_fee_payments', 'student_fee_refunds'].forEach(function (route) {
    assert.match(code, new RegExp('\\b' + route + '\\s*:'));
  });
  var shell = read_('src/100_common/app_shell_js.html');
  assert.match(shell, /appNavStudentFee/);
  assert.match(shell, /student_fee_payers/);
  assert.match(shell, /student_fee_payments/);
  assert.match(shell, /student_fee_refunds/);
}

function testPayerEditUsesLookupKey_() {
  var source = read_('src/500_student_fee/510_payers/student_fee_payers_js.html');
  assert.match(source, /studentIdKey/);
  assert.match(source, /api_getFeePayerDetail/);
  assert.doesNotMatch(source, /textContent\s*=\s*[^;]*studentIdKey/);
}

function testPaymentApprovalCalculatesBeforeMutation_() {
  var source = read_('src/500_student_fee/520_payments/student_fee_payments_js.html');
  var calculateIndex = source.indexOf("'api_calculateFeeAmount'");
  var processIndex = source.indexOf("'api_processFeeApplications'");
  assert.ok(calculateIndex >= 0 && processIndex > calculateIndex);
}

function testRefundApprovalCalculatesBeforeMutation_() {
  var source = read_('src/500_student_fee/530_refunds/student_fee_refunds_js.html');
  var calculateIndex = source.indexOf("'api_calculateFeeRefund'");
  var processIndex = source.indexOf("'api_processFeeRefundRequests'");
  assert.ok(calculateIndex >= 0 && processIndex > calculateIndex);
}

function testBulkRefundApprovalOmitsSharedApprovedAmount_() {
  var source = read_('src/500_student_fee/530_refunds/student_fee_refunds_js.html');
  assert.match(source, /bulkApprove/);
  assert.doesNotMatch(source, /bulkApprove[\s\S]{0,800}approvedAmount\s*:/);
}

function testModalFailureKeepsDialogOpen_() {
  var payer = read_('src/500_student_fee/510_payers/student_fee_payers_js.html');
  var payment = read_('src/500_student_fee/520_payments/student_fee_payments_js.html');
  var refund = read_('src/500_student_fee/530_refunds/student_fee_refunds_js.html');
  [payer, payment, refund].forEach(function (source) {
    assert.match(source, /catch\s*\(/);
    assert.match(source, /studentFeeHandleError/);
  });
}

Promise.resolve()
  .then(testStudentFeeApiWrapper_)
  .then(function () { testBusyGuardPreventsDoubleSubmit_(); })
  .then(function () { testStudentFeeRouteHelpers_(); })
  .then(function () { testPayerEditUsesLookupKey_(); })
  .then(function () { testPaymentApprovalCalculatesBeforeMutation_(); })
  .then(function () { testRefundApprovalCalculatesBeforeMutation_(); })
  .then(function () { testBulkRefundApprovalOmitsSharedApprovedAmount_(); })
  .then(function () { testModalFailureKeepsDialogOpen_(); })
  .then(function () { console.log('Student Fee frontend regression tests passed.'); })
  .catch(function (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
