var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var view = fs.readFileSync(path.join(ROOT, 'src/600_event/620_form/Event_Form_View.html'), 'utf8');
var script = fs.readFileSync(path.join(ROOT, 'src/600_event/620_form/event_form_js.html'), 'utf8');
var detailScript = fs.readFileSync(path.join(ROOT, 'src/600_event/630_detail/event_detail_core_js.html'), 'utf8');

function testCategoryDropdown_() {
  assert.match(view, /<select[^>]+name="category"[^>]+required/);
  ['개강총회', 'MT', '간식행사', '사물함', '축제', '기타'].forEach(function (category) {
    assert.ok(view.indexOf('<option value="' + category + '">' + category + '</option>') >= 0);
  });
  assert.doesNotMatch(view, /<input[^>]+name="category"/);
}

function testManagementOptionsAndFeeToggle_() {
  ['applicationEnabled', 'feeEnabled', 'attendanceEnabled', 'balanceDistributionEnabled'].forEach(function (name) {
    assert.match(view, new RegExp('<input[^>]+type="checkbox"[^>]+name="' + name + '"'));
  });
  assert.match(view, /id="ew-fee-row"[^>]+hidden/);
  assert.match(script, /function syncEventFeeFields\(form\)/);
  assert.match(script, /input\.disabled = !feeEnabled/);
  assert.match(script, /input\.required = feeEnabled/);
}

function testRequestedFormCleanup_() {
  assert.match(view, /name="eventEndAt"[^>]+type="date"[^>]+required/);
  assert.doesNotMatch(view, /예산안/);
  assert.doesNotMatch(view, /value="취소"/);
}

function testEditableAdditionalFields_() {
  ['department', 'location'].forEach(function (name) {
    assert.match(view, new RegExp('<input[^>]+name="' + name + '"'));
    assert.doesNotMatch(view, new RegExp('<input[^>]+name="' + name + '"[^>]+disabled'));
  });
  assert.match(view, /<textarea[^>]+name="note"/);
  assert.doesNotMatch(view, /<textarea[^>]+name="note"[^>]+disabled/);
  ['department', 'location', 'note'].forEach(function (name) {
    assert.ok(script.indexOf("'" + name + "'") >= 0, name + ' must be populated when editing');
    assert.ok(detailScript.indexOf('event.' + name) >= 0, name + ' must be rendered in event detail');
  });
}

function testManagerUsesCurrentLoginUser_() {
  assert.doesNotMatch(view, /name="managerId"/, 'managerId must not be submitted from the form');
  assert.match(view, /id="ew-manager-display"[^>]+disabled/, 'manager must be rendered as a disabled display field');
  assert.match(script, /managerDisplay\.value\s*=\s*APP_USER_NAME\s*\|\|\s*'-'/, 'manager display must use the current login user name');
}

function testClientScriptSyntax_() {
  var source = script.replace(/^\s*<script>\s*/, '').replace(/\s*<\/script>\s*$/, '');
  assert.doesNotThrow(function () { return new vm.Script(source); });
}

testCategoryDropdown_();
testManagementOptionsAndFeeToggle_();
testRequestedFormCleanup_();
testEditableAdditionalFields_();
testManagerUsesCurrentLoginUser_();
testClientScriptSyntax_();
console.log('Event creation frontend contract tests passed.');
