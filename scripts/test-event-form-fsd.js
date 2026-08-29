const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const required = [
  'src/frontend/pages/event_form/Event_Form.html',
  'src/frontend/pages/event_form/Event_Form_View.html',
  'src/frontend/pages/event_form/event_form_controller_js.html',
  'src/frontend/features/event_form_manage/event_form_manage_js.html',
  'src/frontend/entities/event/api/event_client_js.html',
  'src/frontend/entities/event/ui/event_common_js.html'
];
required.forEach(function (rel) {
  assert.ok(fs.existsSync(path.join(root, rel)), 'missing Event Form FSD file: ' + rel);
});
assert.ok(!fs.existsSync(path.join(root, 'src/600_event/620_form')), 'legacy Event Form slice must be removed');

const shell = fs.readFileSync(path.join(root, required[0]), 'utf8');
const view = fs.readFileSync(path.join(root, required[1]), 'utf8');
const controller = fs.readFileSync(path.join(root, required[2]), 'utf8');
const feature = fs.readFileSync(path.join(root, required[3]), 'utf8');
const router = fs.readFileSync(path.join(root, 'src/backend/app/routing/Code.js'), 'utf8');

[
  "include('frontend/shared/styles/App_Styles')",
  "include('frontend/app/styles/App_Shell_Styles')",
  "include('frontend/shared/api/app_api_runner_js')",
  "include('frontend/entities/user/api/app_client_js')",
  "include('frontend/widgets/app_header/App_Header')",
  "include('frontend/widgets/app_sidebar/App_Sidebar')",
  "include('frontend/app/shell/app_shell_js')",
  "include('frontend/entities/event/api/event_client_js')",
  "include('frontend/entities/event/ui/event_common_js')",
  "include('frontend/features/event_form_manage/event_form_manage_js')",
  "include('frontend/pages/event_form/event_form_controller_js')"
].forEach(function (needle) { assert.ok(shell.includes(needle), 'Event Form shell missing include: ' + needle); });
assert.ok(shell.includes("include('600_event/600_common/Event_Styles')"), 'Event styles may remain legacy until Event final cleanup');
assert.ok(!shell.includes('600_event/620_form/'));
assert.ok(view.includes('id="ew-event-form"'));
assert.ok(view.includes('id="ew-manager-display"'));
assert.ok(view.includes('name="feeEnabled"'));
assert.ok(feature.includes('eventClient.getEvent'));
assert.ok(feature.includes('eventClient.createEvent'));
assert.ok(feature.includes('eventClient.updateEvent'));
assert.ok(feature.includes('5 * 1024 * 1024'));
assert.ok(!feature.includes('google.script.run'));
assert.ok(!/['"]api_[A-Za-z0-9_]+['"]/.test(feature));
assert.ok(feature.includes('function initializeEventForm'));
assert.ok(controller.includes('initializeEventForm()'));
assert.ok(router.includes("event_form: 'frontend/pages/event_form/Event_Form'"));

console.log('Event Form FSD migration contract: PASS');
