var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var failures = [];

function readOptional_(relativePath) {
  var target = path.join(ROOT, relativePath);
  return fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
}

var pages = [
  {
    name: 'Accounting Ledger',
    shell: 'src/frontend/pages/accounting_ledger/Accounting_Ledger.html',
    view: 'src/frontend/pages/accounting_ledger/Accounting_Ledger_View.html',
    partials: [
      'src/frontend/pages/accounting_ledger/modals/Accounting_Ledger_Register_Modal.html',
      'src/frontend/pages/accounting_ledger/modals/Accounting_Ledger_Detail_Modal.html'
    ]
  },
  {
    name: 'Student Fee Payers',
    shell: 'src/frontend/pages/student_fee_payers/Student_Fee_Payers.html',
    view: 'src/frontend/pages/student_fee_payers/Student_Fee_Payers_View.html',
    partials: ['src/frontend/pages/student_fee_payers/modals/Student_Fee_Payer_Edit_Modal.html']
  },
  {
    name: 'Student Fee Payments',
    shell: 'src/frontend/pages/student_fee_payments/Student_Fee_Payments.html',
    view: 'src/frontend/pages/student_fee_payments/Student_Fee_Payments_View.html',
    partials: [
      'src/frontend/pages/student_fee_payments/modals/Student_Fee_Payment_Detail_Modal.html',
      'src/frontend/pages/student_fee_payments/modals/Student_Fee_Payment_Confirm_Modal.html'
    ]
  },
  {
    name: 'Student Fee Refunds',
    shell: 'src/frontend/pages/student_fee_refunds/Student_Fee_Refunds.html',
    view: 'src/frontend/pages/student_fee_refunds/Student_Fee_Refunds_View.html',
    partials: [
      'src/frontend/pages/student_fee_refunds/modals/Student_Fee_Refund_Detail_Modal.html',
      'src/frontend/pages/student_fee_refunds/modals/Student_Fee_Refund_Approval_Modal.html',
      'src/frontend/pages/student_fee_refunds/modals/Student_Fee_Refund_Transfer_Modal.html'
    ]
  },
  {
    name: 'Event Detail',
    shell: 'src/600_event/630_detail/Event_Detail.html',
    view: 'src/600_event/630_detail/Event_Detail_View.html',
    partials: ['src/600_event/630_detail/modals/Event_Applicant_Detail_Modal.html']
  }
];

pages.forEach(function (page) {
  var shell = readOptional_(page.shell);
  var view = readOptional_(page.view);
  if (!shell) failures.push(page.name + ' shell is missing: ' + page.shell);
  if (!view) failures.push(page.name + ' View is missing: ' + page.view);
  if (/ui-modal-overlay/.test(view)) failures.push(page.name + ' View must not own modal overlay markup.');

  page.partials.forEach(function (partialPath) {
    var source = readOptional_(partialPath);
    if (!source) {
      failures.push(page.name + ' modal partial is missing: ' + partialPath);
      return;
    }
    var includePath = partialPath.replace(/^src\//, '').replace(/\.html$/, '');
    if (shell.indexOf("include('" + includePath + "')") < 0) {
      failures.push(page.name + ' shell must include modal partial: ' + includePath);
    }
    if (source.indexOf('ui-modal-overlay') < 0 || source.indexOf('ui-modal') < 0) {
      failures.push(page.name + ' modal partial must use shared ui-modal primitives: ' + partialPath);
    }
    if (/<script\b/i.test(source)) failures.push(page.name + ' modal partial must not contain scripts: ' + partialPath);
    if (/include\s*\(/.test(source)) failures.push(page.name + ' modal partial must not contain nested includes: ' + partialPath);
  });
});

var eventApplicantJs = readOptional_('src/600_event/630_detail/event_detail_applicants_js.html');
var eventCoreJs = readOptional_('src/600_event/630_detail/event_detail_core_js.html');
var eventBootstrapJs = readOptional_('src/600_event/630_detail/event_detail_bootstrap_js.html');
var eventJs = [eventApplicantJs, eventCoreJs, eventBootstrapJs].join('\n');
if (/ui-modal-overlay/.test(eventJs) || /<section[^>]+ui-modal/.test(eventJs)) {
  failures.push('Migrated Event JS must not construct a complete modal shell.');
}
if (/modalRoot\.innerHTML\s*=/.test(eventJs)) {
  failures.push('Migrated Event JS must not clear or replace the modal root with innerHTML.');
}

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Page-owned modal architecture verification passed.');
}
