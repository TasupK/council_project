var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SRC = path.join(ROOT, 'src');
var strict = process.env.ARCHITECTURE_FINAL === '1';

if (!strict) {
  console.log('Final project architecture verification skipped (set ARCHITECTURE_FINAL=1 for strict mode).');
  process.exit(0);
}

var failures = [];
var expectedTopLevel = ['appsscript.json', 'backend', 'frontend'];
var actualTopLevel = fs.readdirSync(SRC).sort();
if (JSON.stringify(actualTopLevel) !== JSON.stringify(expectedTopLevel)) {
  failures.push('src top-level must be exactly: ' + expectedTopLevel.join(', ') + '; found: ' + actualTopLevel.join(', '));
}

function listFiles_(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    return entry.isDirectory() ? files.concat(listFiles_(target)) : files.concat(target);
  }, []);
}

var forbiddenLegacyRoots = [
  '000_server', '100_common', '200_login', '250_main', '270_mypage',
  '300_settings', '400_accounting', '500_student_fee', '600_event'
];
forbiddenLegacyRoots.forEach(function (name) {
  if (fs.existsSync(path.join(SRC, name))) failures.push('legacy src root exists: src/' + name);
});

var legacyReference = /(?:include|createTemplateFromFile|createHtmlOutputFromFile)\s*\(\s*['"](?:\d{3}_[^/'"]+|100_common)(?:\/|['"])/;
listFiles_(SRC).filter(function (file) {
  return /\.(?:html|js|gs)$/.test(file);
}).forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  if (legacyReference.test(source)) {
    failures.push('legacy Apps Script template reference: ' + path.relative(ROOT, file).replace(/\\/g, '/'));
  }
});

var routerPath = path.join(SRC, 'backend/app/routing/Code.js');
if (!fs.existsSync(routerPath)) {
  failures.push('missing application router: src/backend/app/routing/Code.js');
} else {
  var router = fs.readFileSync(routerPath, 'utf8');
  var routeTargets = router.match(/:\s*['"]([^'"]+)['"]/g) || [];
  routeTargets.forEach(function (match) {
    var targetMatch = match.match(/['"]([^'"]+)['"]/);
    var target = targetMatch ? targetMatch[1] : '';
    if (/^\d{3}_/.test(target) || target.indexOf('100_common/') === 0) {
      failures.push('legacy router target remains: ' + target);
    }
  });
}

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Final project architecture strict verification passed.');
}
