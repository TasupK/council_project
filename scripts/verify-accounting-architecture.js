var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var ACCOUNTING_ROOT = path.join(ROOT, 'src', 'backend', 'domains', 'accounting');
var failures = [];

function normalize_(v) { return v.replace(/\\/g, '/'); }
function exists_(p) { return fs.existsSync(path.join(ACCOUNTING_ROOT, p)); }
function requireFile_(p) { if (!exists_(p)) failures.push('Missing Accounting architecture file: ' + p); }
function requireDirectory_(p) {
  var target = path.join(ACCOUNTING_ROOT, p);
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) failures.push('Missing Accounting architecture directory: ' + p);
}
function listSourceFiles_(d) {
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(d, entry.name);
    if (entry.isDirectory()) return files.concat(listSourceFiles_(target));
    if (/\.gs$/.test(entry.name)) files.push(target);
    return files;
  }, []);
}
function relative_(file) { return normalize_(path.relative(ACCOUNTING_ROOT, file)); }
function collectFunctions_() {
  var functions = {};
  listSourceFiles_(ACCOUNTING_ROOT).forEach(function (file) {
    var source = fs.readFileSync(file, 'utf8');
    var pattern = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
    var match;
    while ((match = pattern.exec(source)) !== null) {
      if (!functions[match[1]]) functions[match[1]] = [];
      functions[match[1]].push(relative_(file));
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
    var relativePath = relative_(file);
    var source = fs.readFileSync(file, 'utf8');
    if (pattern.test(source) && relativePath !== allowedPath) {
      failures.push('Table access ownership mismatch: ' + tableName + ' accessed from ' + relativePath + ', expected ' + allowedPath);
    }
    pattern.lastIndex = 0;
  });
}

['controllers', 'application', 'business_rules', 'repositories'].forEach(requireDirectory_);
[
  'controllers/ledger_controller.gs',
  'controllers/evidence_controller.gs',
  'controllers/reconciliation_controller.gs',
  'controllers/settlement_controller.gs',
  'application/ledger_mutation.gs',
  'application/ledger_query.gs',
  'application/evidence_mutation.gs',
  'application/evidence_query.gs',
  'application/evidence_ocr.gs',
  'application/bank_transaction_import.gs',
  'application/reconciliation_mutation.gs',
  'application/reconciliation_query.gs',
  'application/settlement_mutation.gs',
  'application/settlement_query.gs',
  'business_rules/bank_transaction_parser.gs',
  'repositories/ledger_repository.gs',
  'repositories/evidence_repository.gs',
  'repositories/bank_transaction_repository.gs',
  'repositories/bank_transaction_file_repository.gs',
  'repositories/reconciliation_repository.gs',
  'repositories/settlement_repository.gs'
].forEach(requireFile_);

var files = listSourceFiles_(ACCOUNTING_ROOT);
var functions = collectFunctions_();

// Public GAS APIs belong only to controllers.
Object.keys(functions).forEach(function (name) {
  var locations = functions[name];
  if (/^api_/.test(name)) {
    locations.forEach(function (location) {
      if (location.indexOf('controllers/') !== 0) failures.push('Public API must be owned by controllers: ' + name + ' in ' + location);
    });
  }
  if (locations.length > 1) failures.push('Duplicate Accounting function: ' + name + ' in ' + locations.join(', '));
});

// Critical use cases and policies keep explicit ownership so architectural drift is caught.
var ownership = {
  api_getLedgerSummary: 'controllers/ledger_controller.gs',
  api_updateLedgerEntry: 'controllers/ledger_controller.gs',
  api_deleteLedgerEntry: 'controllers/ledger_controller.gs',
  createLedgerDraftData_: 'application/ledger_mutation.gs',
  updateLedgerEntryData_: 'application/ledger_mutation.gs',
  deleteLedgerEntryData_: 'application/ledger_mutation.gs',
  assertLedgerBusinessSourceAvailable_: 'application/ledger_mutation.gs',

  api_getLedgerEvidenceAudits: 'controllers/evidence_controller.gs',
  getEvidenceAuditListData_: 'application/evidence_mutation.gs',
  validateEvidenceOcrData_: 'application/evidence_mutation.gs',
  extractEvidenceOcrText_: 'application/evidence_ocr.gs',
  parseEvidenceOcrCandidate_: 'application/evidence_ocr.gs',

  parseTossBankTransactionRows_: 'business_rules/bank_transaction_parser.gs',
  buildBankTransactionSourceHash_: 'business_rules/bank_transaction_parser.gs',
  readTossBankTransactionRowsFromFile_: 'repositories/bank_transaction_file_repository.gs',
  processBankTransactionUploadData_: 'application/bank_transaction_import.gs',
  buildReconciliationSnapshotItems_: 'application/reconciliation_query.gs',
  buildEventPaymentReconciliationCandidates_: 'application/reconciliation_query.gs',
  processReconciliationData_: 'application/reconciliation_mutation.gs',
  applyReconciliationLinkData_: 'application/reconciliation_mutation.gs',
  createLedgerFromReconciliationData_: 'application/reconciliation_mutation.gs',
  createLedgerFromEventPaymentReconciliationData_: 'application/reconciliation_mutation.gs',
  api_processBankTransactionUpload: 'controllers/reconciliation_controller.gs',
  api_processReconciliation: 'controllers/reconciliation_controller.gs',
  api_getReconciliations: 'controllers/reconciliation_controller.gs',
  api_getReconciliation: 'controllers/reconciliation_controller.gs',
  api_getReconciliationCandidates: 'controllers/reconciliation_controller.gs',
  api_applyReconciliationLink: 'controllers/reconciliation_controller.gs',
  api_createLedgerEntryFromReconciliation: 'controllers/reconciliation_controller.gs',

  api_getSettlementSummary: 'controllers/settlement_controller.gs',
  api_createSettlementReport: 'controllers/settlement_controller.gs',
  api_getSettlementReports: 'controllers/settlement_controller.gs',
  api_getSettlementReport: 'controllers/settlement_controller.gs',
  api_exportSettlementReport: 'controllers/settlement_controller.gs',
  createSettlementReportData_: 'application/settlement_mutation.gs'
};
Object.keys(ownership).forEach(function (name) { requireFunctionIn_(functions, name, ownership[name]); });

// Persistence calls are repository-owned, with one repository per Accounting table.
requireTableAccessIn_('ledger', 'repositories/ledger_repository.gs');
requireTableAccessIn_('evidence', 'repositories/evidence_repository.gs');
requireTableAccessIn_('bankTransactions', 'repositories/bank_transaction_repository.gs');
requireTableAccessIn_('reconciliation', 'repositories/reconciliation_repository.gs');
requireTableAccessIn_('reconciliationItems', 'repositories/reconciliation_repository.gs');
requireTableAccessIn_('settlementReports', 'repositories/settlement_repository.gs');

files.forEach(function (file) {
  var rel = relative_(file);
  var source = fs.readFileSync(file, 'utf8');

  // No Accounting layer may bypass the common business-audit writer.
  if (/appendOperationTableRow_\(\s*['\"]businessAuditLogs['\"]/.test(source)) {
    failures.push('Accounting must use common business audit service, direct append found: ' + rel);
  }

  // Repositories own persistence. Application/controllers/business rules must not call raw OperationDB helpers.
  if (rel.indexOf('repositories/') !== 0 && /(?:readOperationTableRows_|appendOperationTableRow_|updateOperationTableRow_|findOperationTableRowById_)\s*\(/.test(source)) {
    failures.push('Raw OperationDB access must stay in repositories: ' + rel);
  }

  // Accounting consumes Event payment facts only through the Event facade contract.
  if (/listEventPaymentClientRows_|findEventPaymentRowById_|findEventPaymentRowsByApplicationId_|insertEventPaymentRow_|updateEventPaymentRowById_/.test(source)) {
    failures.push('Accounting must consume Event payments only through buildEventPaymentAccountingFacts_: ' + rel);
  }
});

// Business rules must remain platform/persistence independent.
listSourceFiles_(path.join(ACCOUNTING_ROOT, 'business_rules')).forEach(function (file) {
  var rel = relative_(file);
  var source = fs.readFileSync(file, 'utf8');
  if (/\b(?:SpreadsheetApp|DriveApp|DocumentApp|HtmlService|Session|LockService)\b|(?:readOperationTableRows_|appendOperationTableRow_|updateOperationTableRow_|findOperationTableRowById_)\s*\(/.test(source)) {
    failures.push('Business rules must be platform/persistence independent: ' + rel);
  }
});

var documentAppLocations = [];
var spreadsheetImportLocations = [];
files.forEach(function (file) {
  var source = fs.readFileSync(file, 'utf8');
  var rel = relative_(file);
  if (/DocumentApp\./.test(source)) documentAppLocations.push(rel);
  if (/SpreadsheetApp\.openById/.test(source)) spreadsheetImportLocations.push(rel);
});
if (documentAppLocations.length !== 1 || documentAppLocations[0] !== 'application/evidence_ocr.gs') {
  failures.push('Evidence OCR Document ownership mismatch: ' + (documentAppLocations.length ? documentAppLocations.join(', ') : 'none'));
}
if (spreadsheetImportLocations.length !== 1 || spreadsheetImportLocations[0] !== 'repositories/bank_transaction_file_repository.gs') {
  failures.push('Bank Excel import ownership mismatch: ' + (spreadsheetImportLocations.length ? spreadsheetImportLocations.join(', ') : 'none'));
}

if (failures.length) {
  failures.forEach(function (f) { console.error(f); });
  process.exitCode = 1;
} else {
  console.log('Accounting layered architecture verification passed.');
}
