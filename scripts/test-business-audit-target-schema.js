var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var BACKEND_ROOT = path.join(ROOT, 'src', 'backend');
var LEGACY_SERVER_ROOT = path.join(ROOT, 'src', '000_server');

function listGsFiles_(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listGsFiles_(target));
    if (/\.gs$/.test(entry.name)) files.push(target);
    return files;
  }, []);
}

var schemaContext = vm.createContext({ console: console });
vm.runInContext(fs.readFileSync(path.join(BACKEND_ROOT, 'app', 'config', 'config.gs'), 'utf8'), schemaContext);
vm.runInContext(fs.readFileSync(path.join(BACKEND_ROOT, 'core', 'db', 'schema', 'operation_db_schema.gs'), 'utf8'), schemaContext);
var schemaKeys = Object.keys(schemaContext.getOperationDbSchema_());

var invalid = [];
listGsFiles_(BACKEND_ROOT).concat(listGsFiles_(LEGACY_SERVER_ROOT)).forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  if (!/write(?:Business|Accounting|StudentFee)Audit_\s*\(/.test(source)) return;

  var relative = path.relative(ROOT, file).replace(/\\/g, '/');
  var objectPattern = /writeBusinessAudit_\s*\(\s*\{[\s\S]*?targetType\s*:\s*['"]([^'"]+)['"]/g;
  var match;
  while ((match = objectPattern.exec(source)) !== null) {
    if (schemaKeys.indexOf(match[1]) < 0) invalid.push(relative + ': targetType=' + match[1]);
  }

  var wrapperPattern = /write(?:Accounting|StudentFee)Audit_\(\s*[^,]+,\s*['"][^'"]+['"]\s*,\s*['"]([^'"]+)['"]/g;
  while ((match = wrapperPattern.exec(source)) !== null) {
    if (schemaKeys.indexOf(match[1]) < 0) invalid.push(relative + ': wrapper target=' + match[1]);
  }
});

assert.deepStrictEqual(invalid, [], 'all new audit targets must be OperationDB schema keys:\n' + invalid.join('\n'));
console.log('Business audit target/schema alignment: PASS');
