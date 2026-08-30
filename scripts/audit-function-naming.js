var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SERVER = path.join(ROOT, 'src/backend');
var candidatesOnly = process.argv.indexOf('--candidates') >= 0;

function listFiles_(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).reduce(function (all, entry) {
    var target = path.join(dir, entry.name);
    if (entry.isDirectory()) return all.concat(listFiles_(target));
    if (/\.gs$/.test(entry.name)) all.push(target);
    return all;
  }, []);
}

function collectFunctions_(file) {
  var source = fs.readFileSync(file, 'utf8');
  var pattern = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  var out = [];
  var match;
  while ((match = pattern.exec(source)) !== null) out.push(match[1]);
  return out;
}

function candidateReasons_(relative, name) {
  var reasons = [];
  var isApi = /^api_/.test(name);
  var isPublicSettings = /\/domains\/iam\/controllers\/settings_/.test('/' + relative) && /^(loadSettings|saveSettings)/.test(name);
  if (!isApi && !isPublicSettings && name !== 'authorizeApp' && !/_$/.test(name)) reasons.push('private-missing-trailing-underscore');
  if (/^findAll/.test(name)) reasons.push('findAll-collection-read');
  if (/_query_service\.gs$/.test(relative) && /^list/.test(name)) reasons.push('query-service-list-prefix');
  if (/_query_service\.gs$/.test(relative) && /^get[A-Z].*Dto_$/.test(name)) reasons.push('query-service-dto-builder-uses-get');
  if (/_service\.gs$/.test(relative) && /^save[A-Z]/.test(name)) reasons.push('service-save-prefix');
  if (/_mapper\.gs$/.test(relative) && /^find[A-Z]/.test(name)) reasons.push('mapper-find-prefix');
  if (/^build[A-Z].*Data_$/.test(name)) reasons.push('builder-uses-data-suffix');
  if (/^make[A-Z]/.test(name)) reasons.push('vague-make-prefix');
  if (/^in[A-Z]/.test(name)) reasons.push('predicate-missing-is-prefix');
  if (/^memberSort_$/.test(name)) reasons.push('vague-comparator-name');
  if (/DuplicateKey_$/.test(name) && !/^build/.test(name)) reasons.push('derived-key-missing-build-prefix');
  if (/^get(EventPaymentTotalsByApplicationId|PermissionIdsByRoleId|ActiveRoleIdsByEmail)_$/.test(name)) reasons.push('derived-index-uses-get-prefix');
  if (/^processEvent(Status|Closure)Data_$/.test(name)) reasons.push('simple-event-update-uses-process');
  return reasons;
}

listFiles_(SERVER).sort().forEach(function (file) {
  var relative = path.relative(ROOT, file).replace(/\\/g, '/');
  collectFunctions_(file).forEach(function (name) {
    var reasons = candidateReasons_(relative, name);
    if (candidatesOnly && !reasons.length) return;
    console.log(relative + '\t' + name + '\t' + reasons.join(','));
  });
});
