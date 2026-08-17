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
requireFile_('061_ledger/ledger_api.gs');
requireFile_('061_ledger/ledger_service.gs');
requireFile_('061_ledger/ledger_sheet_dao.gs');
forbidFile_('accounting_common.gs');
forbidFile_('ledger.gs');

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
  findAllAccountingEventRows_: '060_common/accounting_event_read_dao.gs',
  api_getLedgerDatabaseInfo: '061_ledger/ledger_api.gs',
  api_getLedgerList: '061_ledger/ledger_api.gs',
  api_getLedgerDetail: '061_ledger/ledger_api.gs',
  api_getLedgerEventOptions: '061_ledger/ledger_api.gs',
  api_createLedgerEntry: '061_ledger/ledger_api.gs',
  api_saveLedgerDraft: '061_ledger/ledger_api.gs',
  api_processLedgerEntry: '061_ledger/ledger_api.gs',
  saveLedgerEntry_: '061_ledger/ledger_service.gs',
  processLedgerEntry_: '061_ledger/ledger_service.gs',
  findAllLedgerRows_: '061_ledger/ledger_sheet_dao.gs',
  insertLedgerRow_: '061_ledger/ledger_sheet_dao.gs',
  updateLedgerRowById_: '061_ledger/ledger_sheet_dao.gs',
  getLedgerDatabaseInfo_: '060_common/accounting_query_service.gs',
  getLedgerEventOptions_: '060_common/accounting_query_service.gs'
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
