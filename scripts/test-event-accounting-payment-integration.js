var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var reconciliationQueryPath = path.join(ROOT, 'src/backend/domains/accounting/application/reconciliation_query.gs');
var reconciliationServicePath = path.join(ROOT, 'src/backend/domains/accounting/application/reconciliation_mutation.gs');
var ledgerServicePath = path.join(ROOT, 'src/backend/domains/accounting/application/ledger_mutation.gs');

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

var queryContext = vm.createContext({
  console: console, String: String, Number: Number, Object: Object, Array: Array,
  Math: Math, Date: Date, JSON: JSON, isFinite: isFinite,
  listBankTransactionRows_: function () { return banks; },
  buildEventPaymentAccountingFacts_: function () { return facts; },
  buildLedgerAccountingFacts_: function () { return ledgers; }
});
load_(queryContext, reconciliationQueryPath);

var candidates = JSON.parse(JSON.stringify(queryContext.buildEventPaymentReconciliationCandidates_({})));
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

var sourceLedgers = [
  { id: 'L1', businessType: 'EVENT_PAYMENT', businessId: 'PAY-1', recordStatus: '활성' },
  { id: 'L2', businessType: 'EVENT_PAYMENT', businessId: 'PAY-VOID', recordStatus: '무효' }
];
var ledgerContext = vm.createContext({
  console: console, String: String, Number: Number, Object: Object, Array: Array,
  Math: Math, Date: Date, JSON: JSON, isFinite: isFinite,
  listLedgerRows_: function () { return sourceLedgers; }
});
load_(ledgerContext, ledgerServicePath);
assert.throws(function () { ledgerContext.assertLedgerBusinessSourceAvailable_('EVENT_PAYMENT', 'PAY-1', ''); }, /이미 다른 원장/);
assert.doesNotThrow(function () { ledgerContext.assertLedgerBusinessSourceAvailable_('EVENT_PAYMENT', 'PAY-VOID', ''); });
assert.doesNotThrow(function () { ledgerContext.assertLedgerBusinessSourceAvailable_('EVENT_PAYMENT', 'PAY-1', 'L1'); });
assert.doesNotThrow(function () { ledgerContext.assertLedgerBusinessSourceAvailable_('일반', 'PAY-1', ''); });

var capturedLedgerRequest = null;
var serviceFacts = [facts[0]];
var serviceContext = vm.createContext({
  console: console, String: String, Number: Number, Object: Object, Array: Array,
  Math: Math, Date: Date, JSON: JSON, isFinite: isFinite,
  findBankTransactionRowById_: function (id) { return banks.filter(function (bank) { return bank.id === id; })[0] || null; },
  buildEventPaymentAccountingFacts_: function () { return serviceFacts; },
  createLedgerEntryData_: function (request) {
    capturedLedgerRequest = Object.assign({}, request);
    return { item: { id: 'LEDGER-NEW', businessType: request.business_type, businessId: request.business_id, bankTransactionId: request.bank_transaction_id } };
  },
  getReconciliationDetailData_: function () { return null; }
});
load_(serviceContext, reconciliationServicePath);
var created = serviceContext.createLedgerFromEventPaymentReconciliationData_({
  bankTransactionId: 'BANK-1',
  eventPaymentId: 'PAY-1'
}, { email: 'accounting@example.com' });
assert.deepStrictEqual(JSON.parse(JSON.stringify(capturedLedgerRequest)), {
  bank_transaction_id: 'BANK-1',
  transaction_type: '수입',
  transaction_date: '2026-08-20',
  amount: 12000,
  counterparty: '김학생',
  description: '행사 입금 PAY-1',
  event_id: 'EVENT-1',
  source: 'BANK',
  business_type: 'EVENT_PAYMENT',
  business_id: 'PAY-1'
});
assert.strictEqual(created.createdLedger.id, 'LEDGER-NEW');
assert.strictEqual(serviceFacts[0].moneyStatus, '확인', 'Event payment fact must not be mutated');
assert.throws(function () {
  serviceContext.createLedgerFromEventPaymentReconciliationData_({ bankTransactionId: 'BANK-3', eventPaymentId: 'PAY-1' }, {});
}, /금액/);

console.log('Event–Accounting payment integration contract passed.');
