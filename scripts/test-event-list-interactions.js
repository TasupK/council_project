var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var scriptPath = path.join(ROOT, 'src/frontend/features/event_list/event_list_js.html');
var viewPath = path.join(ROOT, 'src/frontend/pages/event_home/Event_Home_View.html');
var script = fs.readFileSync(scriptPath, 'utf8');
var view = fs.readFileSync(viewPath, 'utf8');

function testRenderedStatusAndRowMetadata_() {
  var target = { innerHTML: '' };
  var executable = script
    .replace(/^\s*<script>\s*/, '')
    .replace(/\s*<\/script>\s*$/, '')
    .split('function closeEvent')[0];
  var context = vm.createContext({
    document: { getElementById: function () { return target; } },
    state: { eventFilters: {}, eventPage: 1 },
    escapeHtml: function (value) { return String(value == null ? '' : value); },
    displayDate: function (value) { return String(value || ''); },
    paginationHtml: function () { return ''; }
  });
  vm.runInContext(executable, context, { filename: scriptPath });
  context.renderEventTable({
    items: [{
      id: 'EVT-2026-MT-001',
      name: '새내기 MT',
      managerEmail: 'manager@example.com',
      eventStartAt: '2026-09-01',
      category: 'MT',
      status: '기존상태'
    }],
    options: { eventStatuses: ['예정', '모집', '진행', '종료'] }
  });

  assert.ok(target.innerHTML.indexOf('data-event-id="EVT-2026-MT-001"') >= 0, 'row must retain event id for navigation');
  assert.ok(target.innerHTML.indexOf('manager@example.com') >= 0, 'row must render manager email');
  assert.ok(/<option value="기존상태" selected>기존상태<\/option>/.test(target.innerHTML), 'status dropdown must display the saved status');
}

function testDoubleClickContract_() {
  assert.ok(/addEventListener\('dblclick'/.test(script), 'event list must listen for row double click');
  assert.ok(/closest\('tr\[data-event-id\]'\)/.test(script), 'double click must resolve the event row');
  assert.ok(/goDetail\(row\.dataset\.eventId,\s*'basic'\)/.test(script), 'double click must open event detail');
  assert.ok(/closest\('button, select, input, a'\)/.test(script), 'interactive controls must not trigger row navigation');
}

function testManagerFilterContract_() {
  assert.ok(/name="managerEmail"/.test(view), 'manager filter must use the server field name');
  assert.ok(/state\.eventFilters\.managerEmail/.test(script), 'manager filter state must use managerEmail');
}

testRenderedStatusAndRowMetadata_();
testDoubleClickContract_();
testManagerFilterContract_();
console.log('Event list interaction contract passed.');
