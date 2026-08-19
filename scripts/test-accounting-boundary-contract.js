var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var ACCOUNTING = path.join(ROOT, 'src', '000_server', '060_accounting');

function read_(relativePath) {
  return fs.readFileSync(path.join(ACCOUNTING, relativePath), 'utf8');
}

function assertNoSymbol_(relativePath, symbol) {
  var source = read_(relativePath);
  assert.strictEqual(
    source.indexOf(symbol),
    -1,
    relativePath + ' must not depend directly on ' + symbol
  );
}

function testLedgerReadContractExists_() {
  var target = path.join(ACCOUNTING, '061_ledger', 'ledger_read_service.gs');
  assert.ok(fs.existsSync(target), '061_ledger/ledger_read_service.gs must exist');
  var source = fs.readFileSync(target, 'utf8');
  assert.ok(source.indexOf('buildLedgerAccountingFacts_') >= 0, 'ledger read contract must expose buildLedgerAccountingFacts_');
  assert.ok(source.indexOf('findLedgerAccountingFactById_') >= 0, 'ledger read contract must expose findLedgerAccountingFactById_');
}

function testForeignLedgerDaoAccessIsBlocked_() {
  [
    '062_evidence/evidence_service.gs',
    '063_reconciliation/reconciliation_query_service.gs',
    '063_reconciliation/reconciliation_service.gs',
    '064_settlement/settlement_query_service.gs',
    '064_settlement/settlement_service.gs'
  ].forEach(function (file) {
    assertNoSymbol_(file, 'listLedgerRows_');
    assertNoSymbol_(file, 'findLedgerRowById_');
  });
}

function testLedgerDoesNotOwnBankReconciliation_() {
  var file = '061_ledger/ledger_service.gs';
  assertNoSymbol_(file, 'findBankTransactionRowById_');
  assertNoSymbol_(file, 'listBankTransactionRows_');
}

function testLedgerDoesNotMutateEvidence_() {
  assertNoSymbol_('061_ledger/ledger_service.gs', 'createEvidenceFilesData_');
}

testLedgerReadContractExists_();
testForeignLedgerDaoAccessIsBlocked_();
testLedgerDoesNotOwnBankReconciliation_();
testLedgerDoesNotMutateEvidence_();
console.log('Accounting boundary contract tests passed.');
