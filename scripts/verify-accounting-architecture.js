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

function readSource_(relativePath) {
  return fs.readFileSync(path.join(ACCOUNTING_ROOT, relativePath), 'utf8');
}

function requireTableAccessIn_(tableName, allowedPath) {
  var pattern = new RegExp("(?:readOperationTableRows_|appendOperationTableRow_|updateOperationTableRow_)\\(\\s*['\\\"]" + tableName + "['\\\"]", 'g');
  listSourceFiles_(ACCOUNTING_ROOT).forEach(function (file) {
    var relativePath = normalize_(path.relative(ACCOUNTING_ROOT, file));
    var source = fs.readFileSync(file, 'utf8');
    if (pattern.test(source) && relativePath !== allowedPath) {
      failures.push('Table access ownership mismatch: ' + tableName + ' accessed from ' + relativePath + ', expected ' + allowedPath);
    }
    pattern.lastIndex = 0;
  });
}

function forbidPatternIn_(relativePath, pattern, message) {
  if (!exists_(relativePath)) return;
  if (pattern.test(readSource_(relativePath))) failures.push(message + ': ' + relativePath);
}

requireFile_('060_common/accounting_common.gs');
requireFile_('060_common/accounting_query_service.gs');
requireFile_('060_common/accounting_event_read_dao.gs');
requireFile_('061_ledger/ledger_api.gs');
requireFile_('061_ledger/ledger_service.gs');
requireFile_('061_ledger/ledger_sheet_dao.gs');
requireFile_('062_evidence/evidence_api.gs');
requireFile_('062_evidence/evidence_service.gs');
requireFile_('062_evidence/evidence_sheet_dao.gs');
requireFile_('062_evidence/evidence_file_service.gs');
forbidFile_('accounting_common.gs');
forbidFile_('ledger.gs');
forbidFile_('evidence.gs');
forbidFile_('accounting_service.gs');
forbidFile_('accounting_sheet_dao.gs');
forbidFile_('settlement.gs');

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
  getLedgerEventOptions_: '060_common/accounting_query_service.gs',
  api_getEvidenceFileContent: '062_evidence/evidence_api.gs',
  saveEvidenceFiles_: '062_evidence/evidence_service.gs',
  findAllLedgerEvidenceRows_: '062_evidence/evidence_sheet_dao.gs',
  insertLedgerEvidenceRow_: '062_evidence/evidence_sheet_dao.gs',
  getEvidenceFileContent_: '062_evidence/evidence_file_service.gs',
  sanitizeFileName_: '062_evidence/evidence_file_service.gs',
  createEvidenceDriveFile_: '062_evidence/evidence_file_service.gs',
  getEvidenceFolder_: '062_evidence/evidence_file_service.gs',
  api_getSettlementSummary: '060_common/accounting_query_service.gs',
  getAccountingSummary_: '060_common/accounting_query_service.gs'
};

Object.keys(ownership).forEach(function (name) {
  requireFunctionIn_(functions, name, ownership[name]);
});

Object.keys(functions).forEach(function (name) {
  if (functions[name].length > 1) {
    failures.push('Duplicate Accounting function: ' + name + ' in ' + functions[name].join(', '));
  }
});

requireTableAccessIn_('ledger', '061_ledger/ledger_sheet_dao.gs');
requireTableAccessIn_('evidence', '062_evidence/evidence_sheet_dao.gs');
requireTableAccessIn_('events', '060_common/accounting_event_read_dao.gs');

forbidPatternIn_(
  '060_common/accounting_event_read_dao.gs',
  /appendOperationTableRow_|updateOperationTableRow_|deleteOperation|DriveApp|withOperationWriteLock_/,
  'Accounting Event adapter must be read-only'
);
forbidPatternIn_(
  '060_common/accounting_query_service.gs',
  /appendOperationTableRow_|updateOperationTableRow_|withOperationWriteLock_|DriveApp|createFile\s*\(/,
  'Accounting Query Service must be read-only'
);

var evidenceKeyLocations = [];
listSourceFiles_(ACCOUNTING_ROOT).forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  if (source.indexOf('LEDGER_EVIDENCE_FOLDER_PROPERTY_KEY') >= 0) {
    evidenceKeyLocations.push(normalize_(path.relative(ACCOUNTING_ROOT, file)));
  }
});
if (evidenceKeyLocations.length !== 1 || evidenceKeyLocations[0] !== '062_evidence/evidence_file_service.gs') {
  failures.push('Evidence folder key ownership mismatch: ' + (evidenceKeyLocations.length ? evidenceKeyLocations.join(', ') : 'none'));
}

['063_reconciliation', '064_audit_export'].forEach(function (relativePath) {
  var target = path.join(ACCOUNTING_ROOT, relativePath);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory() && listSourceFiles_(target).length === 0) {
    failures.push('Empty Accounting feature scaffold exists: ' + relativePath);
  }
});

if (failures.length) {
  failures.forEach(function (failure) { console.error(failure); });
  process.exitCode = 1;
} else {
  console.log('Accounting architecture verification passed.');
}
