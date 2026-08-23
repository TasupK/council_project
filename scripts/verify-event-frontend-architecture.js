var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var EVENT_ROOT = path.join(ROOT, 'src/600_event');
var failures = [];

function filePath_(relativePath) {
  return path.join(EVENT_ROOT, relativePath);
}

function exists_(relativePath) {
  return fs.existsSync(filePath_(relativePath));
}

function read_(relativePath) {
  return fs.readFileSync(filePath_(relativePath), 'utf8');
}

function requireFile_(relativePath) {
  if (!exists_(relativePath)) failures.push('Missing Event frontend file: ' + relativePath);
}

function forbidPath_(relativePath) {
  if (exists_(relativePath)) failures.push('Legacy Event frontend path still exists: ' + relativePath);
}

var requiredFiles = [
  '600_common/Event_Styles.html',
  '600_common/event_client_js.html',
  '600_common/event_common_js.html',
  '610_home/Event_Home.html',
  '610_home/Event_Home_View.html',
  '610_home/event_home_js.html',
  '620_form/Event_Form.html',
  '620_form/Event_Form_View.html',
  '620_form/event_form_js.html',
  '630_detail/Event_Detail.html',
  '630_detail/Event_Detail_View.html',
  '630_detail/modals/Event_Applicant_Detail_Modal.html',
  '630_detail/event_detail_core_js.html',
  '630_detail/event_detail_applicants_js.html',
  '630_detail/event_detail_attendance_js.html',
  '630_detail/event_detail_refunds_js.html',
  '630_detail/event_form_sync_js.html',
  '630_detail/event_detail_bootstrap_js.html'
];
requiredFiles.forEach(requireFile_);

requiredFiles.filter(function (relativePath) {
  return /_js\.html$/.test(relativePath) && exists_(relativePath);
}).forEach(function (relativePath) {
  var script = read_(relativePath)
    .replace(/^\s*<script>\s*/, '')
    .replace(/\s*<\/script>\s*$/, '');
  try {
    new vm.Script(script, { filename: relativePath });
  } catch (error) {
    failures.push('Event frontend syntax error: ' + relativePath + ' - ' + error.message);
  }
});

['common', '600_home', '610_form', '620_detail', '630_detail/event_detail_js.html'].forEach(forbidPath_);

var detailPage = exists_('630_detail/Event_Detail.html') ? read_('630_detail/Event_Detail.html') : '';
var detailView = exists_('630_detail/Event_Detail_View.html') ? read_('630_detail/Event_Detail_View.html') : '';
var applicantJs = exists_('630_detail/event_detail_applicants_js.html') ? read_('630_detail/event_detail_applicants_js.html') : '';
var applicantModalPath = '630_detail/modals/Event_Applicant_Detail_Modal.html';
var applicantModal = exists_(applicantModalPath) ? read_(applicantModalPath) : '';

if (detailPage) {
  var detailIncludes = [
    '600_event/600_common/event_client_js',
    '600_event/600_common/event_common_js',
    '600_event/630_detail/event_detail_core_js',
    '600_event/630_detail/event_detail_applicants_js',
    '600_event/630_detail/event_detail_attendance_js',
    '600_event/630_detail/event_detail_refunds_js',
    '600_event/630_detail/event_form_sync_js',
    '600_event/630_detail/event_detail_bootstrap_js'
  ];
  var previousIndex = -1;
  detailIncludes.forEach(function (includePath) {
    var includeIndex = detailPage.indexOf("include('" + includePath + "')");
    if (includeIndex < 0) failures.push('Event detail include missing: ' + includePath);
    if (includeIndex >= 0 && includeIndex <= previousIndex) failures.push('Event detail include order mismatch: ' + includePath);
    if (includeIndex >= 0) previousIndex = includeIndex;
  });

  var viewInclude = detailPage.indexOf("include('600_event/630_detail/Event_Detail_View')");
  var modalInclude = detailPage.indexOf("include('600_event/630_detail/modals/Event_Applicant_Detail_Modal')");
  var coreInclude = detailPage.indexOf("include('600_event/630_detail/event_detail_core_js')");
  if (modalInclude < 0) failures.push('Event detail shell must include applicant modal partial.');
  if (viewInclude >= 0 && modalInclude >= 0 && modalInclude <= viewInclude) failures.push('Event applicant modal partial must be included after the View.');
  if (modalInclude >= 0 && coreInclude >= 0 && modalInclude >= coreInclude) failures.push('Event applicant modal partial must be included before detail JavaScript.');
}

if (/ui-modal-overlay|ew-applicant-detail-modal/.test(detailView)) {
  failures.push('Event Detail View must not own applicant modal shell.');
}
if (/modalRoot\.innerHTML\s*=\s*['"`][\s\S]*ui-modal-overlay/.test(applicantJs) || /class=[\\'\"][^\\'\"]*ui-modal[^\\'\"]*[\\'\"]/.test(applicantJs)) {
  failures.push('Event applicant JS must not construct a complete modal shell.');
}

if (applicantModal) {
  [
    'ew-modal-root',
    'ew-applicant-detail-modal',
    'ew-applicant-modal-title',
    'ew-applicant-name',
    'ew-applicant-student-id',
    'ew-applicant-phone',
    'ew-applicant-fee-status',
    'ew-applicant-payment-status',
    'ew-applicant-approval-status',
    'ew-applicant-manager',
    'ew-applicant-processed-at',
    'ew-applicant-extra-answers',
    'ew-applicant-reject',
    'ew-applicant-approve'
  ].forEach(function (id) {
    if (applicantModal.indexOf('id="' + id + '"') < 0) failures.push('Event applicant modal missing id=' + id);
  });
  ['ui-modal-overlay', 'ui-modal', 'role="dialog"', 'aria-modal="true"', 'data-action="close-modal"', 'data-modal-stop'].forEach(function (needle) {
    if (applicantModal.indexOf(needle) < 0) failures.push('Event applicant modal missing contract: ' + needle);
  });
  if (/<script\b/i.test(applicantModal)) failures.push('Event applicant modal partial must not contain script blocks.');
  if (/include\s*\(/.test(applicantModal)) failures.push('Event applicant modal partial must not contain nested includes.');
}

var ownership = {
  '630_detail/event_detail_core_js.html': ['cacheEventDetailData_', 'renderActiveTab', 'renderBasicTab'],
  '630_detail/event_detail_applicants_js.html': ['loadApplicants', 'openApplicantModal', 'processApplicant'],
  '630_detail/event_detail_attendance_js.html': ['loadAttendance', 'updateCachedAttendance_', 'applyAttendance'],
  '630_detail/event_detail_refunds_js.html': ['loadRefunds', 'renderRefundTable'],
  '630_detail/event_form_sync_js.html': ['currentFormSync_', 'syncEventFormResponses_']
};
Object.keys(ownership).forEach(function (relativePath) {
  if (!exists_(relativePath)) return;
  var source = read_(relativePath);
  ownership[relativePath].forEach(function (functionName) {
    if (!new RegExp('function\\s+' + functionName + '\\s*\\(').test(source)) {
      failures.push('Event frontend function ownership mismatch: ' + functionName + ' not in ' + relativePath);
    }
  });
});

if (exists_('600_common/event_common_js.html') && exists_('620_form/event_form_js.html')) {
  var commonSource = read_('600_common/event_common_js.html');
  var formSource = read_('620_form/event_form_js.html');
  if (!/function\s+safeRelatedMaterialLink\s*\(/.test(commonSource)) {
    failures.push('Shared related-material renderer must live in 600_common');
  }
  if (/function\s+safeRelatedMaterialLink\s*\(/.test(formSource)) {
    failures.push('Form module must not duplicate shared related-material renderer');
  }
}

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Event frontend architecture verification passed.');
}
