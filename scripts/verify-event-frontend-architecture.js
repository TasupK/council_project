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

if (!failures.length) {
  var detailPage = read_('630_detail/Event_Detail.html');
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

  var ownership = {
    '630_detail/event_detail_core_js.html': ['cacheEventDetailData_', 'renderActiveTab', 'renderBasicTab'],
    '630_detail/event_detail_applicants_js.html': ['loadApplicants', 'openApplicantModal', 'processApplicant'],
    '630_detail/event_detail_attendance_js.html': ['loadAttendance', 'updateCachedAttendance_', 'applyAttendance'],
    '630_detail/event_detail_refunds_js.html': ['loadRefunds', 'renderRefundTable'],
    '630_detail/event_form_sync_js.html': ['currentFormSync_', 'syncEventFormResponses_']
  };
  Object.keys(ownership).forEach(function (relativePath) {
    var source = read_(relativePath);
    ownership[relativePath].forEach(function (functionName) {
      if (!new RegExp('function\\s+' + functionName + '\\s*\\(').test(source)) {
        failures.push('Event frontend function ownership mismatch: ' + functionName + ' not in ' + relativePath);
      }
    });
  });

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
