var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var reconciliationQueryPath = path.join(ROOT, 'src/000_server/060_accounting/063_reconciliation/reconciliation_query_service.gs');

function load_(context, file) {
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
}

var banks = [
  { id: 'BANK-1', amount: 12000, transactionAt: '2026-08-20', description: '김학생', recordStatus: '정상' },
  { id: 'BANK-2', amount: 12000, transactionAt: '2026-08-22', description: '다른이름', recordStatus: '정상' },
  { id: 'BANK-3', amount: 9000, transactionAt: '2026-08-20', description: '김학생', recordStatus: '정상' }
];
var facts = [
  { paymentId: 'PAY-1', applicationId: 'APP-1', eventId: 'EVENT-1', paidAmount: 12000, paymentDate: '2026-08-20', depositorName: '김학생', moneyStatus: '확인', confirmedAt: '2026-08-20T10:00:00+09:00' },
  { paymentId: 'PAY-2', applicationId: 'APP-2', eventId: 'EVENT-1', paidAmount: 12000, paymentDate: '2026-08-21', depositorName: '이학생', moneyStatus: '확인', confirmedAt: '2026-08-21T10:00:00+09:00' },
  { paymentId: 'PAY-CLAIMED', applicationId: 'APP-3', eventId: 'EVENT-1', paidAmount: 12000, paymentDate: '2026-08-20', depositorName: '김학생', moneyStatus: '확인', confirmedAt: '2026-08-20T10:00:00+09:00' }
];
var ledgers = [
  { id: 'LEDGER-OLD', businessType: 'EVENT_PAYMENT', businessId: 'PAY-CLAIMED', recordStatus: '활성', bankTransactionId: 'BANK-OLD' }
];

var context = vm.createContext({
  console: console,
  String: String,
  Number: Number,
  Object: Object,
  Array: Array,
  Math: Math,
  Date: Date,
  JSON: JSON,
  isFinite: isFinite,
  listBankTransactionRows_: function () { return banks; },
  buildEventPaymentAccountingFacts_: function () { return facts; },
  listLedgerRows_: function () { return ledgers; }
});
load_(context, reconciliationQueryPath);

var candidates = JSON.parse(JSON.stringify(context.buildEventPaymentReconciliationCandidates_({})));
var strongest = candidates.filter(function (row) { return row.bankTransactionId === 'BANK-1' && row.eventPaymentId === 'PAY-1'; })[0];
assert.ok(strongest, 'exact candidate must exist');
assert.strictEqual(strongest.amountMatches, true);
assert.strictEqual(strongest.dateDistanceDays, 0);
assert.strictEqual(strongest.depositorMatches, true);
assert.strictEqual(strongest.result, '정상');

var weaker = candidates.filter(function (row) { return row.bankTransactionId === 'BANK-2' && row.eventPaymentId === 'PAY-1'; })[0];
assert.ok(weaker, 'near-date candidate must exist');
assert.strictEqual(weaker.amountMatches, true);
assert.strictEqual(weaker.depositorMatches, false);
assert.ok(weaker.score < strongest.score);
assert.strictEqual(weaker.result, '확인필요');

assert.strictEqual(candidates.some(function (row) { return row.bankTransactionId === 'BANK-3'; }), false, 'mismatched amount must not be a normal candidate');
assert.strictEqual(candidates.some(function (row) { return row.eventPaymentId === 'PAY-CLAIMED'; }), false, 'already ledger-claimed Event payment must be excluded');

console.log('Event–Accounting payment reconciliation candidate contract passed.');
