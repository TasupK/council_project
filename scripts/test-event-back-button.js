var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var views = [
  'src/frontend/pages/event_home/Event_Home_View.html',
  'src/600_event/620_form/Event_Form_View.html',
  'src/600_event/630_detail/Event_Detail_View.html'
];

views.forEach(function (relativePath) {
  var source = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
  assert.ok(/class=["'][^"']*ew-page-title-row/.test(source), relativePath + ' must group back button with page title');
  assert.ok(/data-action=["']go-back["']/.test(source), relativePath + ' must render back action');
  assert.ok(/aria-label=["']이전 페이지로 이동["']/.test(source), relativePath + ' back button must be accessible');
  assert.ok(/title=["']뒤로가기["']/.test(source), relativePath + ' back button must expose a tooltip');
  assert.ok(/<button[^>]+data-action=["']go-back["'][^>]*>\s*←\s*<\/button>/.test(source), relativePath + ' back button must be icon-only');
  assert.ok(source.indexOf('← 뒤로') < 0, relativePath + ' back button must not render a text label');
});

var commonSource = fs.readFileSync(path.join(ROOT, 'src/frontend/entities/event/ui/event_common_js.html'), 'utf8');
var stylesSource = fs.readFileSync(path.join(ROOT, 'src/600_event/600_common/Event_Styles.html'), 'utf8');
assert.ok(/function\s+goEventBack_\s*\(/.test(commonSource), 'Event common client must own back navigation');
assert.ok(/window\.history\.back\s*\(/.test(commonSource), 'back action must use browser history');
assert.ok(/APP_CURRENT_PAGE\s*===\s*['"]event['"]\s*\?\s*['"]main['"]\s*:\s*['"]event['"]/.test(commonSource), 'direct-entry fallback must route safely');
assert.ok(/\[data-action=["']go-back["']\]/.test(commonSource), 'back action click handler must exist');
assert.ok(/\.ew-page-title-row\s*\{/.test(stylesSource) && /\.ew-back-btn\s*\{/.test(stylesSource), 'Event back button styles must exist');

console.log('Event page back button contract passed.');
