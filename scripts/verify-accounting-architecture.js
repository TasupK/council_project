var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var ACCOUNTING_ROOT = path.join(ROOT, 'src', '000_server', '060_accounting');
var failures = [];

function normalize_(v) { return v.replace(/\\/g, '/'); }
function exists_(p) { return fs.existsSync(path.join(ACCOUNTING_ROOT, p)); }
function requireFile_(p) { if (!exists_(p)) failures.push('Missing Accounting architecture file: ' + p); }
function listSourceFiles_(d) {
  return fs.readdirSync(d, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(d, entry.name);
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
function requireFunctionIn_(functions, name, p) {
  var locations = functions[name] || [];
  if (locations.length !== 1 || locations[0] !== p) {
    failures.push('Function ownership mismatch: ' + name + ' expected ' + p + ', found ' + (locations.length ? locations.join(', ') : 'none'));
  }
}
function requireTableAccessIn_(tableName, allowedPath) {
  var pattern = new RegExp("(?:readOperationTableRows_|appendOperationTableRow_|updateOperationTableRow_|findOperationTableRowById_)\\(\\s*['\\\"]" + tableName + "['\\\"]", 'g');
  listSourceFiles_(ACCOUNTING_ROOT).forEach(function (file) {
    var relativePath = normalize_(path.relative(ACCOUNTING_ROOT, file));
    var source = fs.readFileSync(file, 'utf8');
    if (pattern.test(source) && relativePath !== allowedPath) {
      failures.push('Table access ownership mismatch: ' + tableName + ' accessed from ' + relativePath + ', expected ' + allowedPath);
    }
    pattern.lastIndex = 0;
  });
}
function requireNoDirectAuditAppend_() {
  listSourceFiles_(ACCOUNTING_ROOT).forEach(function (file) {
    var relativePath = normalize_(path.relative(ACCOUNTING_ROOT, file));
    var source = fs.readFileSync(file, 'utf8');
    if (/appendOperationTableRow_\(\s*['\"]businessAuditLogs['\"]/.test(source)) {
      failures.push('Accounting must use common business audit service, direct append found: ' + relativePath);
    }
  });
}

[
  '060_common/accounting_common.gs','060_common/accounting_audit_sheet_dao.gs','060_common/accounting_query_service.gs','060_common/accounting_event_read_dao.gs',
  '061_ledger/ledger_api.gs','061_ledger/ledger_service.gs','061_ledger/ledger_sheet_dao.gs',
  '062_evidence/evidence_api.gs','062_evidence/evidence_service.gs','062_evidence/evidence_sheet_dao.gs','062_evidence/evidence_file_service.gs','062_evidence/evidence_ocr_service.gs',
  '063_reconciliation/reconciliation_api.gs','063_reconciliation/reconciliation_service.gs','063_reconciliation/reconciliation_query_service.gs','063_reconciliation/reconciliation_sheet_dao.gs',
  '063_reconciliation/bank_transaction_sheet_dao.gs','063_reconciliation/bank_transaction_parser.gs','063_reconciliation/bank_transaction_file_service.gs','063_reconciliation/bank_transaction_import_service.gs',
  '064_settlement/settlement_api.gs','064_settlement/settlement_service.gs','064_settlement/settlement_query_service.gs','064_settlement/settlement_sheet_dao.gs'
].forEach(requireFile_);

var functions = collectFunctions_();
var ownership = {
  api_getLedgerSummary: '061_ledger/ledger_api.gs',
  api_updateLedgerEntry: '061_ledger/ledger_api.gs',
  api_deleteLedgerEntry: '061_ledger/ledger_api.gs',
  createLedgerDraftData_: '061_ledger/ledger_service.gs',
  updateLedgerEntryData_: '061_ledger/ledger_service.gs',
  deleteLedgerEntryData_: '061_ledger/ledger_service.gs',
  assertLedgerBusinessSourceAvailable_: '061_ledger/ledger_service.gs',

  api_getLedgerEvidenceAudits: '062_evidence/evidence_api.gs',
  getEvidenceAuditListData_: '062_evidence/evidence_service.gs',
  validateEvidenceOcrData_: '062_evidence/evidence_service.gs',
  extractEvidenceOcrText_: '062_evidence/evidence_ocr_service.gs',
  parseEvidenceOcrCandidate_: '062_evidence/evidence_ocr_service.gs',

  parseTossBankTransactionRows_: '063_reconciliation/bank_transaction_parser.gs',
  buildBankTransactionSourceHash_: '063_reconciliation/bank_transaction_parser.gs',
  readTossBankTransactionRowsFromFile_: '063_reconciliation/bank_transaction_file_service.gs',
  processBankTransactionUploadData_: '063_reconciliation/bank_transaction_import_service.gs',
  buildReconciliationSnapshotItems_: '063_reconciliation/reconciliation_query_service.gs',
  buildEventPaymentReconciliationCandidates_: '063_reconciliation/reconciliation_query_service.gs',
  processReconciliationData_: '063_reconciliation/reconciliation_service.gs',
  applyReconciliationLinkData_: '063_reconciliation/reconciliation_service.gs',
  createLedgerFromReconciliationData_: '063_reconciliation/reconciliation_service.gs',
  createLedgerFromEventPaymentReconciliationData_: '063_reconciliation/reconciliation_service.gs',
  api_processBankTransactionUpload: '063_reconciliation/reconciliation_api.gs',
  api_processReconciliation: '063_reconciliation/reconciliation_api.gs',
  api_getReconciliations: '063_reconciliation/reconciliation_api.gs',
  api_getReconciliation: '063_reconciliation/reconciliation_api.gs',
  api_getReconciliationCandidates: '063_reconciliation/reconciliation_api.gs',
  api_applyReconciliationLink: '063_reconciliation/reconciliation_api.gs',
  api_createLedgerEntryFromReconciliation: '063_reconciliation/reconciliation_api.gs',

  api_getSettlementSummary: '064_settlement/settlement_api.gs',
  api_createSettlementReport: '064_settlement/settlement_api.gs',
  api_getSettlementReports: '064_settlement/settlement_api.gs',
  api_getSettlementReport: '064_settlement/settlement_api.gs',
  api_exportSettlementReport: '064_settlement/settlement_api.gs',
  createSettlementReportData_: '064_settlement/settlement_service.gs'
};
Object.keys(ownership).forEach(function (name) { requireFunctionIn_(functions, name, ownership[name]); });
Object.keys(functions).forEach(function (name) {
  if (functions[name].length > 1) failures.push('Duplicate Accounting function: ' + name + ' in ' + functions[name].join(', '));
});

requireTableAccessIn_('ledger', '061_ledger/ledger_sheet_dao.gs');
requireTableAccessIn_('evidence', '062_evidence/evidence_sheet_dao.gs');
requireTableAccessIn_('events', '060_common/accounting_event_read_dao.gs');
requireTableAccessIn_('bankTransactions', '063_reconciliation/bank_transaction_sheet_dao.gs');
requireTableAccessIn_('reconciliation', '063_reconciliation/reconciliation_sheet_dao.gs');
requireTableAccessIn_('reconciliationItems', '063_reconciliation/reconciliation_sheet_dao.gs');
requireTableAccessIn_('settlementReports', '064_settlement/settlement_sheet_dao.gs');
requireNoDirectAuditAppend_();

var reconciliationFiles = listSourceFiles_(path.join(ACCOUNTING_ROOT, '063_reconciliation'));
reconciliationFiles.forEach(function (file) {
  var rel = normalize_(path.relative(ACCOUNTING_ROOT, file));
  var source = fs.readFileSync(file, 'utf8');
  if (/appendOperationTableRow_\(\s*['\"]ledger['\"]/.test(source)) {
    failures.push('Reconciliation must not write ledger table directly: ' + rel);
  }
});

listSourceFiles_(ACCOUNTING_ROOT).forEach(function (file) {
  var rel = normalize_(path.relative(ACCOUNTING_ROOT, file));
  var source = fs.readFileSync(file, 'utf8');
  if (/listEventPaymentClientRows_|findEventPaymentRowById_|findEventPaymentRowsByApplicationId_|insertEventPaymentRow_|updateEventPaymentRowById_/.test(source)) {
    failures.push('Accounting must consume Event payments only through buildEventPaymentAccountingFacts_: ' + rel);
  }
});

var documentAppLocations = [];
var spreadsheetImportLocations = [];
listSourceFiles_(ACCOUNTING_ROOT).forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  var rel = normalize_(path.relative(ACCOUNTING_ROOT, file));
  if (/DocumentApp\./.test(source)) documentAppLocations.push(rel);
  if (/SpreadsheetApp\.openById/.test(source)) spreadsheetImportLocations.push(rel);
});
if (documentAppLocations.length !== 1 || documentAppLocations[0] !== '062_evidence/evidence_ocr_service.gs') {
  failures.push('Evidence OCR Document ownership mismatch: ' + (documentAppLocations.length ? documentAppLocations.join(', ') : 'none'));
}
if (spreadsheetImportLocations.length !== 1 || spreadsheetImportLocations[0] !== '063_reconciliation/bank_transaction_file_service.gs') {
  failures.push('Bank Excel import ownership mismatch: ' + (spreadsheetImportLocations.length ? spreadsheetImportLocations.join(', ') : 'none'));
}

if (failures.length) {
  failures.forEach(function (f) { console.error(f); });
  process.exitCode = 1;
} else {
  console.log('Accounting architecture verification passed.');
}
