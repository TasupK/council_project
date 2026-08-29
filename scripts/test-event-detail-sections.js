var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var detailFiles = [
  'src/frontend/features/event_detail_core/event_detail_core_js.html',
  'src/frontend/features/event_applicant_manage/event_applicant_manage_js.html',
  'src/frontend/features/event_attendance_manage/event_attendance_manage_js.html',
  'src/frontend/features/event_refund_view/event_refund_view_js.html',
  'src/frontend/pages/event_detail/event_detail_controller_js.html'
];
var syncPath = path.join(ROOT, 'src/frontend/features/event_form_sync/event_form_sync_js.html');
var modalPath = path.join(ROOT, 'src/frontend/pages/event_detail/modals/Event_Applicant_Detail_Modal.html');
var commonPath = path.join(ROOT, 'src/frontend/entities/event/ui/event_common_js.html');
var servicePath = path.join(ROOT, 'src/backend/domains/event/application/applicants_mutation.gs');

var detailSource = detailFiles.map(function (relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
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
