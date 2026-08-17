var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var ACCOUNTING_ROOT = path.join(ROOT, 'src', '000_server', '060_accounting');
var failures = [];

function normalize_(value) {
  return value.replace(/\\/g, '/');
}

function exists_(relativePath) {
  return fs.existsSync(path.join(ACCOUNTING_ROOT, relativePath));
}

function requireFile_(relativePath) {
  if (!exists_(relativePath)) failures.push('Missing Accounting architecture file: ' + relativePath);
}

function forbidFile_(relativePath) {
  if (exists_(relativePath)) failures.push('Legacy Accounting architecture file still exists: ' + relativePath);
}

function listSourceFiles_(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listSourceFiles_(target));
    if (/\.gs$/.test(entry.name)) files.push(target);
    return files;
  }, []);
}

function collectFunctions_() {
  var functions = {};
  listSourceFiles_(ACCOUNTING_ROOT).forEach(function (file) {
    var source = fs.readFileSync(file, 'utf8');
    var pattern = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    var match;
    while ((match = pattern.exec(source)) !== null) {
      if (!functions[match[1]]) functions[match[1]] = [];
      functions[match[1]].push(normalize_(path.relative(ACCOUNTING_ROOT, file)));
    }
  });
  return functions;
}

function requireFunctionIn_(functions, name, relativePath) {
  var locations = functions[name] || [];
  if (locations.length !== 1 || locations[0] !== relativePath) {
    failures.push(
      'Function ownership mismatch: ' + name +
      ' expected ' + relativePath +
      ', found ' + (locations.length ? locations.join(', ') : 'none')
    );
  }
}

requireFile_('060_common/accounting_common.gs');
requireFile_('060_common/accounting_query_service.gs');
requireFile_('060_common/accounting_event_read_dao.gs');
forbidFile_('accounting_common.gs');

var functions = collectFunctions_();
var ownership = {
  makeId_: '060_common/accounting_common.gs',
  getCurrentUserName_: '060_common/accounting_common.gs',
  groupBy_: '060_common/accounting_query_service.gs',
  getLedgerEntries_: '060_common/accounting_query_service.gs',
  getLedgerEntryDto_: '060_common/accounting_query_service.gs',
  getEvidenceDto_: '060_common/accounting_query_service.gs',
  filterLedgerEntries_: '060_common/accounting_query_service.gs',
  normalizeFilter_: '060_common/accounting_query_service.gs',
  findLedgerEntryDtoById_: '060_common/accounting_query_service.gs',
  findAllAccountingEventRows_: '060_common/accounting_event_read_dao.gs'
};

Object.keys(ownership).forEach(function (name) {
  requireFunctionIn_(functions, name, ownership[name]);
});

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Accounting architecture verification passed.');
}
