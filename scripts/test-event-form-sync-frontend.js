var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var detailPath = path.join(ROOT, 'src/600_event/630_detail/Event_Detail.html');
var syncPath = path.join(ROOT, 'src/600_event/630_detail/event_form_sync_js.html');
var clientPath = path.join(ROOT, 'src/600_event/600_common/event_client_js.html');
assert.ok(fs.existsSync(syncPath), 'focused event_form_sync_js.html module must exist');
var detailSource = fs.readFileSync(detailPath, 'utf8');
var source = fs.readFileSync(syncPath, 'utf8');
var clientSource = fs.readFileSync(clientPath, 'utf8');

assert.ok(/include\(['"]600_event\/630_detail\/event_form_sync_js['"]\)/.test(detailSource), 'Event Detail must include focused Forms module');
assert.ok(/include\(['"]600_event\/600_common\/event_client_js['"]\)/.test(detailSource), 'Event Detail must load semantic Event client');
assert.ok(/id=["']ew-form-sync-form["']/.test(source), 'basic tab must render form sync controls');
assert.ok(/name=["']googleFormId["']/.test(source), 'Form ID input must exist');
assert.ok(/name=["']responseSheetId["']/.test(source), 'response Sheet ID input must exist');
assert.ok(/eventClient\.syncApplicantsFromForms\s*\(/.test(source), 'frontend must call semantic Forms sync method');
assert.ok(/api_syncEventApplicantsFromForms/.test(clientSource), 'Event client must own Forms sync API name');
assert.ok(/eventClient\.getOverview\s*\(/.test(source), 'Forms sync must refresh Event overview through semantic client');
assert.ok(/data-action=["']sync-forms["']/.test(source), 'applicant tab must expose explicit sync action');
assert.ok(/importedCount/.test(source) && /duplicateCount/.test(source) && /invalidCount/.test(source), 'sync result counts must be rendered');
assert.ok(/lastSyncedAt/.test(source), 'last sync time must be rendered from detail state');
assert.ok(!/Google Forms 연동 계약 확인 필요/.test(source), 'new Forms module must not contain legacy disabled placeholder');

console.log('Event Form sync frontend contract passed.');
