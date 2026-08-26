var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var ACCOUNTING = path.join(ROOT, 'src', 'backend', 'domains', 'accounting');

function read_(relativePath) {
  return fs.readFileSync(path.join(ACCOUNTING, relativePath), 'utf8');
}

function listFiles_(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listFiles_(target));
    if (/\.gs$/.test(entry.name)) files.push(target);
    return files;
  }, []);
}

function assertNoSymbol_(relativePath, symbol) {
  var source = read_(relativePath);
  assert.strictEqual(source.indexOf(symbol), -1, relativePath + ' must not depend directly on ' + symbol);
}

function testLedgerReadContractExists_() {
  var target = path.join(ACCOUNTING, 'application', 'ledger_query.gs');
  assert.ok(fs.existsSync(target), 'application/ledger_query.gs must exist');
  var source = fs.readFileSync(target, 'utf8');
  assert.ok(source.indexOf('buildLedgerAccountingFacts_') >= 0, 'ledger read contract must expose buildLedgerAccountingFacts_');
  assert.ok(source.indexOf('findLedgerAccountingFactById_') >= 0, 'ledger read contract must expose findLedgerAccountingFactById_');
}

function testForeignLedgerRepositoryAccessIsBlocked_() {
  [
    'application/evidence_mutation.gs',
    'application/reconciliation_query.gs',
    'application/reconciliation_mutation.gs',
    'application/settlement_query.gs',
    'application/settlement_mutation.gs'
  ].forEach(function (file) {
    assertNoSymbol_(file, 'listLedgerRows_');
    assertNoSymbol_(file, 'findLedgerRowById_');
  });
}

function testLedgerDoesNotOwnBankReconciliation_() {
  var file = 'application/ledger_mutation.gs';
  assertNoSymbol_(file, 'findBankTransactionRowById_');
  assertNoSymbol_(file, 'listBankTransactionRows_');
}

function testLedgerDoesNotMutateEvidence_() {
  assertNoSymbol_('application/ledger_mutation.gs', 'createEvidenceFilesData_');
}

function testBusinessRulesRemainPure_() {
  listFiles_(path.join(ACCOUNTING, 'business_rules')).forEach(function (file) {
    var source = fs.readFileSync(file, 'utf8');
    ['SpreadsheetApp', 'DriveApp', 'DocumentApp', 'Session', 'LockService'].forEach(function (symbol) {
      assert.strictEqual(source.indexOf(symbol), -1, path.relative(ROOT, file) + ' must not use ' + symbol);
    });
  });
}

function testAccountingUsesEventApplicationFacade_() {
  var query = read_('application/accounting_query.gs');
  assert.ok(query.indexOf('listAccountingEventReferences_') >= 0, 'Accounting must consume the Event Application facade');
  listFiles_(ACCOUNTING).forEach(function (file) {
    var source = fs.readFileSync(file, 'utf8');
    assert.strictEqual(source.indexOf('listEventRows_'), -1, path.relative(ROOT, file) + ' must not call Event repository internals');
    assert.strictEqual(source.indexOf('findEventRowById_'), -1, path.relative(ROOT, file) + ' must not call Event repository internals');
  });
}

testLedgerReadContractExists_();
testForeignLedgerRepositoryAccessIsBlocked_();
testLedgerDoesNotOwnBankReconciliation_();
testLedgerDoesNotMutateEvidence_();
testBusinessRulesRemainPure_();
testAccountingUsesEventApplicationFacade_();
console.log('Accounting boundary contract tests passed.');
