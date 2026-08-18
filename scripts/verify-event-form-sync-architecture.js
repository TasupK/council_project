var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var EVENT = path.join(ROOT, 'src/000_server/050_event');
var DETAIL = path.join(ROOT, 'src/600_event/620_detail');
var failures = [];

function read_(file) { return fs.readFileSync(file, 'utf8'); }
function requireFile_(file) { if (!fs.existsSync(file)) failures.push('Missing file: ' + path.relative(ROOT, file)); }
function forbid_(source, pattern, message) { if (pattern.test(source)) failures.push(message); }

var reader = path.join(EVENT, '052_applicants/applicants_form_reader.gs');
var mapper = path.join(EVENT, '052_applicants/applicants_form_mapper.gs');
var service = path.join(EVENT, '052_applicants/applicants_form_sync_service.gs');
var access = path.join(EVENT, '050_common/event_access.gs');
var api = path.join(EVENT, '052_applicants/applicants_api.gs');
var frontend = path.join(DETAIL, 'event_form_sync_js.html');
var page = path.join(DETAIL, 'Event_Detail.html');
[reader, mapper, service, access, api, frontend, page].forEach(requireFile_);

if (!failures.length) {
  var readerSource = read_(reader);
  var mapperSource = read_(mapper);
  var serviceSource = read_(service);
  var accessSource = read_(access);
  var apiSource = read_(api);
  var frontendSource = read_(frontend);
  var pageSource = read_(page);
  var portSource = [readerSource, mapperSource, serviceSource, accessSource, apiSource, frontendSource].join('\n');

  forbid_(readerSource, /appendOperationTableRow_|updateOperationTableRow_|withOperationWriteLock_|sheetInsert_|sheetUpdateById_/, 'Form reader must not write OperationDB');
  forbid_(mapperSource, /\bFormApp\b|\bSpreadsheetApp\b|appendOperationTableRow_|updateOperationTableRow_|withOperationWriteLock_/, 'Form mapper must be pure from Google/DB persistence');
  forbid_(serviceSource, /\bFormApp\b|\bSpreadsheetApp\b/, 'Sync service must delegate external reads to reader');
  forbid_(serviceSource, /eventPayments|insertEventPayment|appendOperationTableRow_\(['"]eventPayments['"]/, 'Forms sync must never write eventPayments');
  forbid_(portSource, /\bapiV1_|\bEventWelfare_/, 'Legacy EventWelfare/API stack must not be reintroduced');
  forbid_(apiSource, /requireEventEditContext_\s*\(context\)/, 'Sync API must not retain a second Event authorization path');

  if (!/function\s+syncApplicantsFromFormsData_\s*\(/.test(serviceSource)) failures.push('Sync orchestration must live in applicants_form_sync_service.gs');
  if (!/function\s+resolveEventFormResponseSource_\s*\(/.test(readerSource)) failures.push('External source resolution must live in reader');
  if (!/function\s+buildEventFormCandidates_\s*\(/.test(mapperSource)) failures.push('Response mapping must live in mapper');
  if (!/access\s*:\s*\{\s*domain\s*:\s*['"]event['"]\s*,\s*action\s*:\s*['"]edit['"]\s*\}/.test(apiSource)) failures.push('Sync API must use common Event edit access contract');
  if (!/event_form_sync_js/.test(pageSource)) failures.push('Event Detail must include focused Forms module');
  if (!/api\(['"]api_syncApplicantsFromForms['"]/.test(frontendSource)) failures.push('Frontend must call sync API');
}

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Event Form sync architecture verification passed.');
}
