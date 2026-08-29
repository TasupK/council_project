var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var FRONTEND = path.join(ROOT, 'src/frontend');
var failures = [];

function filePath_(relativePath) { return path.join(FRONTEND, relativePath); }
function exists_(relativePath) { return fs.existsSync(filePath_(relativePath)); }
function read_(relativePath) { return fs.readFileSync(filePath_(relativePath), 'utf8'); }
function requireFile_(relativePath) { if (!exists_(relativePath)) failures.push('Missing Event frontend file: ' + relativePath); }

var requiredFiles = [
  'entities/event/ui/Event_Styles.html',
  'entities/event/api/event_client_js.html',
  'entities/event/ui/event_common_js.html',
  'pages/event_home/Event_Home.html',
  'pages/event_home/Event_Home_View.html',
  'pages/event_home/event_home_controller_js.html',
  'features/event_list/event_list_js.html',
  'pages/event_form/Event_Form.html',
  'pages/event_form/Event_Form_View.html',
  'pages/event_form/event_form_controller_js.html',
  'features/event_form_manage/event_form_manage_js.html',
  'pages/event_detail/Event_Detail.html',
  'pages/event_detail/Event_Detail_View.html',
  'pages/event_detail/modals/Event_Applicant_Detail_Modal.html',
  'pages/event_detail/event_detail_controller_js.html',
  'features/event_detail_core/event_detail_core_js.html',
  'features/event_applicant_manage/event_applicant_manage_js.html',
  'features/event_attendance_manage/event_attendance_manage_js.html',
  'features/event_refund_view/event_refund_view_js.html',
  'features/event_form_sync/event_form_sync_js.html'
];
requiredFiles.forEach(requireFile_);

requiredFiles.filter(function (relativePath) {
  return /_js\.html$/.test(relativePath) && exists_(relativePath);
}).forEach(function (relativePath) {
  var script = read_(relativePath).replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
  try { new vm.Script(script, { filename: relativePath }); }
  catch (error) { failures.push('Event frontend syntax error: ' + relativePath + ' - ' + error.message); }
});

if (fs.existsSync(path.join(ROOT, 'src/600_event'))) failures.push('Legacy Event frontend root still exists: src/600_event');

var detailPage = exists_('pages/event_detail/Event_Detail.html') ? read_('pages/event_detail/Event_Detail.html') : '';
var detailView = exists_('pages/event_detail/Event_Detail_View.html') ? read_('pages/event_detail/Event_Detail_View.html') : '';
var applicantJs = exists_('features/event_applicant_manage/event_applicant_manage_js.html') ? read_('features/event_applicant_manage/event_applicant_manage_js.html') : '';
var applicantModalPath = 'pages/event_detail/modals/Event_Applicant_Detail_Modal.html';
var applicantModal = exists_(applicantModalPath) ? read_(applicantModalPath) : '';

if (detailPage) {
  var detailIncludes = [
    'frontend/entities/event/api/event_client_js',
    'frontend/entities/event/ui/event_common_js',
    'frontend/features/event_detail_core/event_detail_core_js',
    'frontend/features/event_applicant_manage/event_applicant_manage_js',
    'frontend/features/event_attendance_manage/event_attendance_manage_js',
    'frontend/features/event_refund_view/event_refund_view_js',
    'frontend/features/event_form_sync/event_form_sync_js',
    'frontend/pages/event_detail/event_detail_controller_js'
  ];
  var previousIndex = -1;
  detailIncludes.forEach(function (includePath) {
    var includeIndex = detailPage.indexOf("include('" + includePath + "')");
    if (includeIndex < 0) failures.push('Event detail include missing: ' + includePath);
    if (includeIndex >= 0 && includeIndex <= previousIndex) failures.push('Event detail include order mismatch: ' + includePath);
    if (includeIndex >= 0) previousIndex = includeIndex;
  });

  var viewInclude = detailPage.indexOf("include('frontend/pages/event_detail/Event_Detail_View')");
  var modalInclude = detailPage.indexOf("include('frontend/pages/event_detail/modals/Event_Applicant_Detail_Modal')");
  var coreInclude = detailPage.indexOf("include('frontend/features/event_detail_core/event_detail_core_js')");
  if (modalInclude < 0) failures.push('Event detail shell must include applicant modal partial.');
  if (viewInclude >= 0 && modalInclude >= 0 && modalInclude <= viewInclude) failures.push('Event applicant modal partial must be included after the View.');
  if (modalInclude >= 0 && coreInclude >= 0 && modalInclude >= coreInclude) failures.push('Event applicant modal partial must be included before detail JavaScript.');
}

if (/ui-modal-overlay|ew-applicant-detail-modal/.test(detailView)) failures.push('Event Detail View must not own applicant modal shell.');
if (/modalRoot\.innerHTML\s*=\s*['"`][\s\S]*ui-modal-overlay/.test(applicantJs) || /class=[\\'\"][^\\'\"]*ui-modal[^\\'\"]*[\\'\"]/.test(applicantJs)) failures.push('Event applicant JS must not construct a complete modal shell.');

if (applicantModal) {
  ['ew-modal-root','ew-applicant-detail-modal','ew-applicant-modal-title','ew-applicant-name','ew-applicant-student-id','ew-applicant-phone','ew-applicant-fee-status','ew-applicant-payment-status','ew-applicant-approval-status','ew-applicant-manager','ew-applicant-processed-at','ew-applicant-extra-answers','ew-applicant-reject','ew-applicant-approve'].forEach(function (id) {
    if (applicantModal.indexOf('id="' + id + '"') < 0) failures.push('Event applicant modal missing id=' + id);
  });
  ['ui-modal-overlay','ui-modal','role="dialog"','aria-modal="true"','data-action="close-modal"','data-modal-stop'].forEach(function (needle) {
    if (applicantModal.indexOf(needle) < 0) failures.push('Event applicant modal missing contract: ' + needle);
  });
  if (/<script\b/i.test(applicantModal)) failures.push('Event applicant modal partial must not contain script blocks.');
  if (/include\s*\(/.test(applicantModal)) failures.push('Event applicant modal partial must not contain nested includes.');
}

var ownership = {
  'features/event_detail_core/event_detail_core_js.html': ['cacheEventDetailData_', 'renderActiveTab', 'renderBasicTab'],
  'features/event_applicant_manage/event_applicant_manage_js.html': ['loadApplicants', 'openApplicantModal', 'processApplicant'],
  'features/event_attendance_manage/event_attendance_manage_js.html': ['loadAttendance', 'updateCachedAttendance_', 'applyAttendance'],
  'features/event_refund_view/event_refund_view_js.html': ['loadRefunds', 'renderRefundTable'],
  'features/event_form_sync/event_form_sync_js.html': ['currentFormSync_', 'syncEventFormResponses_']
};
Object.keys(ownership).forEach(function (relativePath) {
  if (!exists_(relativePath)) return;
  var source = read_(relativePath);
  ownership[relativePath].forEach(function (functionName) {
    if (!new RegExp('function\\s+' + functionName + '\\s*\\(').test(source)) failures.push('Event frontend function ownership mismatch: ' + functionName + ' not in ' + relativePath);
  });
});

if (exists_('entities/event/ui/event_common_js.html') && exists_('features/event_form_manage/event_form_manage_js.html')) {
  var commonSource = read_('entities/event/ui/event_common_js.html');
  var formSource = read_('features/event_form_manage/event_form_manage_js.html');
  if (!/function\s+safeRelatedMaterialLink\s*\(/.test(commonSource)) failures.push('Shared related-material renderer must live in Event entity UI.');
  if (/function\s+safeRelatedMaterialLink\s*\(/.test(formSource)) failures.push('Form feature must not duplicate shared related-material renderer.');
}

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Event frontend FSD architecture verification passed.');
}
