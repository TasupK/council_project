var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SRC = path.join(ROOT, 'src');
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

function relative_(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function source_(file) {
  return fs.readFileSync(file, 'utf8');
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

var businessRulesRoot = path.join(SRC, 'backend/domains');
listFiles_(businessRulesRoot).filter(function (file) {
  return relative_(file).indexOf('/business_rules/') >= 0;
}).forEach(function (file) {
  if (/\b(?:SpreadsheetApp|DriveApp|FormApp|Session|google\.script\.run)\b/.test(source_(file))) {
    failures.push('business rule depends on Apps Script infrastructure: ' + relative_(file));
  }
});

listFiles_(path.join(SRC, 'backend/core')).forEach(function (file) {
  if (/src\/backend\/domains\//.test(source_(file))) {
    failures.push('backend/core references a domain implementation path: ' + relative_(file));
  }
});

listFiles_(path.join(SRC, 'backend/domains')).forEach(function (file) {
  var relativeDomainPath = path.relative(path.join(SRC, 'backend/domains'), file).replace(/\\/g, '/');
  var owner = relativeDomainPath.split('/')[0];
  var crossRepository = new RegExp('(?:src/backend/domains/)?(?!' + owner + '/)([a-z_]+)/repositories/');
  if (crossRepository.test(source_(file))) {
    failures.push('domain references another domain repository: ' + relative_(file));
  }
});

listFiles_(path.join(SRC, 'frontend')).filter(function (file) {
  return /\.(?:html|js)$/.test(file);
}).forEach(function (file) {
  if (!/google\.script\.run/.test(source_(file))) return;
  if (relative_(file) !== 'src/frontend/shared/api/rpc/app_api_runner_js.html') {
    failures.push('direct google.script.run outside shared RPC transport: ' + relative_(file));
  }
});

var routerPath = path.join(SRC, 'backend/app/routing/Code.js');
if (!fs.existsSync(routerPath)) {
  failures.push('missing application router: src/backend/app/routing/Code.js');
} else {
  var router = fs.readFileSync(routerPath, 'utf8');
  var routesBlock = router.match(/var\s+routes\s*=\s*\{([\s\S]*?)\n\s*\};/);
  if (!routesBlock) failures.push('unable to parse routes object in application router');
  var routeTargets = routesBlock ? (routesBlock[1].match(/:\s*['"]([^'"]+)['"]/g) || []) : [];
  routeTargets.forEach(function (match) {
    var targetMatch = match.match(/['"]([^'"]+)['"]/);
    var target = targetMatch ? targetMatch[1] : '';
    if (/^\d{3}_/.test(target) || target.indexOf('100_common/') === 0) {
      failures.push('legacy router target remains: ' + target);
    }
    if (!fs.existsSync(path.join(SRC, target + '.html'))) {
      failures.push('missing router template target: ' + target);
    }
  });
}

listFiles_(path.join(SRC, 'frontend')).filter(function (file) {
  return /\.html$/.test(file);
}).forEach(function (file) {
  var source = source_(file);
  var includePattern = /include\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  var match;
  while ((match = includePattern.exec(source)) !== null) {
    if (!fs.existsSync(path.join(SRC, match[1] + '.html'))) {
      failures.push('missing include target ' + match[1] + ' from ' + relative_(file));
    }
  }
});

[
  'README.md',
  'scripts/audit-function-naming.js',
  'scripts/verify-mypage-architecture.js',
  '.github/workflows/frontend-api-mapping.yml',
  '.github/workflows/student-fee.yml'
].forEach(function (relativePath) {
  var target = path.join(ROOT, relativePath);
  if (!fs.existsSync(target)) {
    failures.push('missing architecture-sensitive file: ' + relativePath);
    return;
  }
  var source = fs.readFileSync(target, 'utf8');
  if (/src\/(?:000_server|100_common|200_login|250_main|270_mypage|300_settings|400_accounting|500_student_fee|600_event)(?:\/|['"])/.test(source)) {
    failures.push('legacy source path remains in architecture-sensitive file: ' + relativePath);
  }
});

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Final project architecture strict verification passed.');
}
