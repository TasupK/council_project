var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var file = path.join(ROOT, 'src/600_event/620_detail/event_detail_js.html');
var source = fs.readFileSync(file, 'utf8');

assert.ok(/id=["']ew-form-sync-form["']/.test(source), 'basic tab must render form sync controls');
assert.ok(/name=["']googleFormId["']/.test(source), 'Form ID input must exist');
assert.ok(/name=["']responseSheetId["']/.test(source), 'response Sheet ID input must exist');
assert.ok(/api\(['"]api_syncApplicantsFromForms['"]/.test(source), 'frontend must call sync API');
assert.ok(/data-action=["']sync-forms["']/.test(source), 'applicant tab must expose explicit sync action');
assert.ok(/importedCount/.test(source) && /duplicateCount/.test(source) && /invalidCount/.test(source), 'sync result counts must be rendered');
assert.ok(/lastSyncedAt/.test(source), 'last sync time must be rendered from detail state');
assert.ok(!/Google Forms 연동 계약 확인 필요/.test(source), 'legacy disabled Forms placeholder must be removed');

console.log('Event Form sync frontend contract passed.');
