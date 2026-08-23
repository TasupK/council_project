var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var detailDirectory = path.join(ROOT, 'src/600_event/630_detail');
var detailFiles = [
  'event_detail_core_js.html',
  'event_detail_applicants_js.html',
  'event_detail_attendance_js.html',
  'event_detail_refunds_js.html',
  'event_detail_bootstrap_js.html'
];
var syncPath = path.join(detailDirectory, 'event_form_sync_js.html');
var modalPath = path.join(detailDirectory, 'modals/Event_Applicant_Detail_Modal.html');
var commonPath = path.join(ROOT, 'src/600_event/600_common/event_common_js.html');
var servicePath = path.join(ROOT, 'src/000_server/050_event/052_applicants/applicants_service.gs');

var detailSource = detailFiles.map(function (fileName) {
  return fs.readFileSync(path.join(detailDirectory, fileName), 'utf8');
}).join('\n');
var modalSource = fs.existsSync(modalPath) ? fs.readFileSync(modalPath, 'utf8') : '';
var composedDetailSource = detailSource + '\n' + modalSource;
var syncSource = fs.readFileSync(syncPath, 'utf8');
var commonSource = fs.readFileSync(commonPath, 'utf8');
var serviceSource = fs.readFileSync(servicePath, 'utf8');

assert.ok(/detailSections\s*:\s*\{\}/.test(commonSource), 'browser state must reserve detail section cache');
assert.ok(/function\s+cacheEventDetailData_\s*\(/.test(detailSource), 'detail response must be cached once');
['applicants', 'attendance', 'refunds'].forEach(function (section) {
  assert.ok(new RegExp("getCachedDetailItems_\\(['\"]" + section + "['\"]\\)").test(detailSource), section + ' tab must read browser cache');
});
assert.ok(!/eventClient\.(getApplicants|getApplicant|getAttendances|getRefunds)\s*\(/.test(detailSource), 'detail tabs and modal must not make section read requests');
assert.ok(/eventClient\.getOverview\s*\(/.test(detailSource), 'detail entry must use the aggregate detail API');
assert.ok(/cacheEventDetailData_\s*\(detail\)/.test(syncSource), 'Forms synchronization refresh must replace the complete cache');

assert.ok(!/DB 필드 없음/.test(composedDetailSource), 'department missing-field placeholder must be removed');
assert.ok(!/info\s*\(\s*['\"]학과['\"]/.test(detailSource), 'department row must be excluded from applicant modal');
assert.ok(/data-process=["']approve["']/.test(composedDetailSource), 'approve button must exist');
assert.ok(/data-process=["']reject["']/.test(composedDetailSource), 'reject button must exist');
assert.ok(/처리 담당자/.test(composedDetailSource) && /processedAt|ew-applicant-processed-at/.test(composedDetailSource), 'processor details must be displayed');
assert.ok(/context\s*&&\s*context\.email/.test(serviceSource), 'applicant processing must use authenticated API context');
assert.ok(/patch\.managerEmail\s*=\s*actorEmail/.test(serviceSource), 'applicant processing must persist manager email');

console.log('Event detail section cache and applicant actions contract passed.');
