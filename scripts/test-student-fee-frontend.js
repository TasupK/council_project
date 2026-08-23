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
  var proxy;
  var runner = {
    withSuccessHandler: function (handler) { runner.success = handler; return proxy; },
    withFailureHandler: function (handler) { runner.failure = handler; return proxy; }
  };
  proxy = new Proxy(runner, {
    get: function (target, key) {
      if (key in target) return target[key];
      return function (payload) {
        calls.push({ name: key, payload: payload });
        if (target.success) target.success({ ok: true, data: {} });
      };
    }
  });
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
      Error: Error,
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
      google: { script: { run: proxy } }
    }),
    calls: calls
  };
}

function loadCommon_(fixture) {
  vm.runInContext(scriptBody_('src/100_common/app_api_runner_js.html'), fixture.context);
  vm.runInContext(scriptBody_('src/500_student_fee/common/student_fee_client_js.html'), fixture.context);
  vm.runInContext(scriptBody_('src/500_student_fee/common/student_fee_common_js.html'), fixture.context);
}

function testStudentFeeSemanticClient_() {
  var fixture = createFrontendContext_();
  loadCommon_(fixture);
  return fixture.context.studentFeeClient.getApplications({ page: 1 }).then(function () {
    assert.strictEqual(fixture.calls.length, 1);
    assert.strictEqual(fixture.calls[0].name, 'api_getStudentFeeApplications');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(fixture.calls[0].payload)), { request: { page: 1 } });
  });
}

function testBusyGuardPreventsDoubleSubmit_() {
  var fixture = createFrontendContext_();
  loadCommon_(fixture);
  var button = { disabled: false, dataset: {} };
  assert.strictEqual(fixture.context.studentFeeSetBusy(button, true), true);
  assert.strictEqual(button.disabled, true);
  assert.strictEqual(button.dataset.busy, 'true');
  assert.strictEqual(fixture.context.studentFeeSetBusy(button, true), false);
  assert.strictEqual(fixture.context.studentFeeSetBusy(button, false), true);
  assert.strictEqual(button.disabled, false);
  assert.strictEqual(button.dataset.busy, undefined);
}

function testStudentFeeRouteHelpers_() {
  var code = read_('src/000_server/Code.js');
  ['student_fee', 'student_fee_payers', 'student_fee_payments', 'student_fee_refunds'].forEach(function (route) {
    assert.match(code, new RegExp('\\b' + route + '\\s*:'));
  });
  assert.match(code, /page\.indexOf\(['"]student_fee['"]\)\s*===\s*0/);
  var shell = read_('src/100_common/app_shell_js.html');
  assert.match(shell, /appNavStudentFee/);
  assert.match(shell, /student_fee_payers/);
  assert.match(shell, /student_fee_payments/);
  assert.match(shell, /student_fee_refunds/);
}

function testPayerEditUsesLookupKey_() {
  var source = read_('src/500_student_fee/510_payers/student_fee_payers_js.html');
  var client = read_('src/500_student_fee/common/student_fee_client_js.html');
  assert.match(source, /studentIdKey/);
  assert.match(source, /studentFeeClient\.getPayer/);
  assert.match(client, /api_getStudentFeePayer/);
  assert.doesNotMatch(source, /textContent\s*=\s*[^;]*studentIdKey/);
}

function testPaymentApprovalCalculatesBeforeMutation_() {
  var source = read_('src/500_student_fee/520_payments/student_fee_payments_js.html');
  var calculateIndex = source.indexOf('studentFeeClient.calculateAmount');
  var processIndex = source.indexOf('studentFeeClient.processApplications');
  assert.ok(calculateIndex >= 0 && processIndex > calculateIndex);
}

function testRefundApprovalCalculatesBeforeMutation_() {
  var source = read_('src/500_student_fee/530_refunds/student_fee_refunds_js.html');
  var calculateIndex = source.indexOf('studentFeeClient.calculateRefund');
  var processIndex = source.indexOf('studentFeeClient.processRefundRequests');
  assert.ok(calculateIndex >= 0 && processIndex > calculateIndex);
}

function testBulkRefundApprovalOmitsSharedApprovedAmount_() {
  var source = read_('src/500_student_fee/530_refunds/student_fee_refunds_js.html');
  assert.match(source, /bulkApproveSfRefunds_/);
  var start = source.indexOf('function bulkApproveSfRefunds_');
  var end = source.indexOf('function bulkRejectSfRefunds_', start);
  var block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(block, /approvedAmount\s*:/);
  assert.match(block, /studentFeeClient\.processRefundRequests/);
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

function testStudentFeeViewsDoNotOwnModalsAfterMigration_() {
  [
    'src/500_student_fee/510_payers/Student_Fee_Payers_View.html',
    'src/500_student_fee/520_payments/Student_Fee_Payments_View.html',
    'src/500_student_fee/530_refunds/Student_Fee_Refunds_View.html'
  ].forEach(function (file) {
    assert.doesNotMatch(read_(file), /ui-modal-overlay/);
  });
}

Promise.resolve()
  .then(testStudentFeeSemanticClient_)
  .then(function () { testBusyGuardPreventsDoubleSubmit_(); })
  .then(function () { testStudentFeeRouteHelpers_(); })
  .then(function () { testPayerEditUsesLookupKey_(); })
  .then(function () { testPaymentApprovalCalculatesBeforeMutation_(); })
  .then(function () { testRefundApprovalCalculatesBeforeMutation_(); })
  .then(function () { testBulkRefundApprovalOmitsSharedApprovedAmount_(); })
  .then(function () { testModalFailureKeepsDialogOpen_(); })
  .then(function () { testStudentFeeViewsDoNotOwnModalsAfterMigration_(); })
  .then(function () { console.log('Student Fee frontend regression tests passed.'); })
  .catch(function (error) {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
