const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const banks = [
  { id: 'BANK-EVENT', transactionAt: '2026-02-22 10:00:00', amount: 160000, description: '이은제', recordStatus: '정상' },
  { id: 'BANK-FEE', transactionAt: '2026-02-02 10:00:00', amount: 80000, description: '이채은', recordStatus: '정상' },
  { id: 'BANK-EVENT-APP', transactionAt: '2026-02-06 10:00:00', amount: 30000, description: '승인행사', recordStatus: '정상' },
  { id: 'BANK-FEE-PENDING', transactionAt: '2026-02-05 10:00:00', amount: 90000, description: '대기자', recordStatus: '정상' },
  { id: 'BANK-FEE-APP', transactionAt: '2026-02-08 10:00:00', amount: 40000, description: '신청자', recordStatus: '정상' },
  { id: 'BANK-BLANK-DEPOSITOR', transactionAt: '2026-02-09 10:00:00', amount: 70000, description: '토스입금', recordStatus: '정상' },
  { id: 'BANK-MANUAL-INCOME', transactionAt: '2026-02-14 10:00:00', amount: 85000, description: '직접등록', recordStatus: '정상' },
  { id: 'BANK-MANUAL-AMBIGUOUS', transactionAt: '2026-02-15 10:00:00', amount: 86000, description: '직접중복', recordStatus: '정상' },
  { id: 'BANK-LEDGER-AMBIGUOUS', transactionAt: '2026-02-10 10:00:00', amount: 60000, description: '후보중복', recordStatus: '정상' },
  { id: 'BANK-PENDING-LEDGER', transactionAt: '2026-02-11 10:00:00', amount: 61000, description: '승인대기', recordStatus: '정상' },
  { id: 'BANK-REJECTED-LEDGER', transactionAt: '2026-02-12 10:00:00', amount: 62000, description: '반려원장', recordStatus: '정상' },
  { id: 'BANK-VOID-LEDGER', transactionAt: '2026-02-13 10:00:00', amount: 63000, description: '무효원장', recordStatus: '정상' },
  { id: 'BANK-AMBIGUOUS', transactionAt: '2026-02-03 10:00:00', amount: 50000, description: '김중복', recordStatus: '정상' },
  { id: 'BANK-EXPENSE', transactionAt: '2026-02-04 10:00:00', amount: -70000, description: '지출오인', recordStatus: '정상' }
];
const ledgers = [
  { id: 'LEDGER-MANUAL-INCOME', bankTransactionId: '', transactionAt: '2026-02-14', transactionType: '수입', amount: 85000, counterparty: '직접등록', description: '원장관리 직접 등록', recordStatus: '활성', approvalStatus: '승인', matchStatus: '미확인' },
  { id: 'LEDGER-MANUAL-AMBIGUOUS-A', bankTransactionId: '', transactionAt: '2026-02-15', transactionType: '수입', amount: 86000, counterparty: '직접중복', description: '미연결 중복 A', recordStatus: '활성', approvalStatus: '승인', matchStatus: '미확인' },
  { id: 'LEDGER-MANUAL-AMBIGUOUS-B', bankTransactionId: '', transactionAt: '2026-02-15', transactionType: '수입', amount: 86000, counterparty: '직접중복', description: '미연결 중복 B', recordStatus: '활성', approvalStatus: '승인', matchStatus: '미확인' },
  { id: 'LEDGER-WRONG-LINK', bankTransactionId: 'BANK-OLD-FEE', transactionAt: '2026-02-02', transactionType: '수입', amount: 80000, counterparty: '이채은', description: '학생회비 납부', recordStatus: '활성', approvalStatus: '승인', matchStatus: '정상' },
  { id: 'LEDGER-AMBIGUOUS-A', bankTransactionId: 'BANK-OLD-A', transactionAt: '2026-02-10', transactionType: '수입', amount: 60000, counterparty: '후보중복', description: '중복 후보 A', recordStatus: '활성', approvalStatus: '승인', matchStatus: '정상' },
  { id: 'LEDGER-AMBIGUOUS-B', bankTransactionId: 'BANK-OLD-B', transactionAt: '2026-02-10', transactionType: '수입', amount: 60000, counterparty: '후보중복', description: '중복 후보 B', recordStatus: '활성', approvalStatus: '승인', matchStatus: '정상' },
  { id: 'LEDGER-PENDING', bankTransactionId: 'BANK-OLD-PENDING', transactionAt: '2026-02-11', transactionType: '수입', amount: 61000, counterparty: '승인대기', description: '승인대기 원장', recordStatus: '활성', approvalStatus: '승인대기', matchStatus: '정상' },
  { id: 'LEDGER-REJECTED', bankTransactionId: 'BANK-OLD-REJECTED', transactionAt: '2026-02-12', transactionType: '수입', amount: 62000, counterparty: '반려원장', description: '반려 원장', recordStatus: '활성', approvalStatus: '반려', matchStatus: '정상' },
  { id: 'LEDGER-VOID', bankTransactionId: 'BANK-OLD-VOID', transactionAt: '2026-02-13', transactionType: '수입', amount: 63000, counterparty: '무효원장', description: '무효 원장', recordStatus: '무효', approvalStatus: '승인', matchStatus: '정상' }
];
const reconciliationRows = [];
const reconciliationItems = [];
const createdRequests = [];
const approvalCalls = [];
const updateCalls = [];
let idSequence = 0;

function dateInRange(value, startDate, endDate) {
  const date = String(value || '').slice(0, 10);
  if (startDate && date < String(startDate)) return false;
  if (endDate && date > String(endDate)) return false;
  return true;
}

const context = {
  console,
  String,
  Number,
  Object,
  Array,
  Math,
  Date,
  JSON,
  isFinite,
  listBankTransactionRows_: () => banks,
  buildLedgerAccountingFacts_: () => ledgers,
  buildApprovedLedgerAccountingFacts_: () => ledgers.filter((ledger) => ledger.approvalStatus === '승인' && ledger.recordStatus !== '무효'),
  buildEventPaymentAccountingFacts_: () => [
    { paymentId: 'PAY-EVENT', applicationId: 'APP-EVENT', eventId: 'EVENT-1', paidAmount: 160000, paymentDate: '2026-02-22', depositorName: '이은제', moneyStatus: '확인' },
    { paymentId: 'PAY-DUP', applicationId: 'APP-DUP', eventId: 'EVENT-2', paidAmount: 50000, paymentDate: '2026-02-03', depositorName: '김중복', moneyStatus: '확인' },
    { paymentId: 'PAY-EXPENSE', applicationId: 'APP-EXPENSE', eventId: 'EVENT-3', paidAmount: 70000, paymentDate: '2026-02-04', depositorName: '지출오인', moneyStatus: '확인' }
  ],
  buildApprovedEventApplicationAccountingFacts_: () => [
    { applicationId: 'APP-EVENT-ONLY', eventId: 'EVENT-4', amount: 30000, paymentDate: '2026-02-06', depositorName: '승인행사', applicationStatus: '승인' }
  ],
  buildStudentFeePaymentAccountingFacts_: () => [
    { paymentId: 'FEE-PAID', applicationId: 'FEE-APP', amount: 80000, paymentDate: '2026-02-02', depositorName: '이채은', moneyStatus: '완료', applicationStatus: '승인' },
    { paymentId: 'FEE-DUP', applicationId: 'FEE-DUP-APP', amount: 50000, paymentDate: '2026-02-03', depositorName: '김중복', moneyStatus: '완료', applicationStatus: '승인' },
    { paymentId: 'FEE-PENDING', applicationId: 'FEE-PENDING-APP', amount: 90000, paymentDate: '2026-02-05', depositorName: '대기자', moneyStatus: '대기', applicationStatus: '승인' },
    { paymentId: 'FEE-BLANK-DEPOSITOR', applicationId: 'FEE-BLANK-DEPOSITOR-APP', amount: 70000, paymentDate: '2026-02-09', depositorName: '', moneyStatus: '대기', applicationStatus: '승인' }
  ],
  buildApprovedStudentFeeApplicationAccountingFacts_: () => [
    { paymentId: 'FEE-PENDING', applicationId: 'FEE-PENDING-APP', amount: 90000, paymentDate: '2026-02-05', depositorName: '대기자', moneyStatus: '대기', applicationStatus: '승인' },
    { paymentId: '', applicationId: 'FEE-APP-ONLY', amount: 40000, paymentDate: '2026-02-08', depositorName: '신청자', applicationStatus: '승인' }
  ],
  isAccountingDateInRange_: dateInRange,
  createLedgerEntryData_: (request) => {
    createdRequests.push(Object.assign({}, request));
    const row = {
      id: 'LEDGER-' + createdRequests.length,
      bankTransactionId: request.bank_transaction_id,
      transactionAt: request.transaction_date,
      transactionType: request.transaction_type,
      amount: request.amount,
      counterparty: request.counterparty,
      description: request.description,
      eventId: request.event_id,
      businessType: request.business_type,
      businessId: request.business_id,
      recordStatus: '활성',
      approvalStatus: '승인대기',
      matchStatus: '정상'
    };
    ledgers.push(row);
    return { item: { transaction_id: row.id } };
  },
  processLedgerEntryData_: (request) => {
    approvalCalls.push(Object.assign({}, request));
    const row = ledgers.filter((ledger) => ledger.id === request.transaction_id)[0];
    if (row) row.approvalStatus = '승인';
    return { ok: true };
  },
  updateLedgerEntryData_: (request) => {
    updateCalls.push(Object.assign({}, request));
    const row = ledgers.filter((ledger) => ledger.id === request.transaction_id)[0];
    if (row) {
      row.bankTransactionId = request.bank_transaction_id;
      row.matchStatus = '정상';
    }
    return { ok: true, item: row };
  },
  generateAccountingId_: (prefix) => prefix + '-' + (++idSequence),
  getCurrentIsoDateTime_: () => '2026-09-08T00:00:00+09:00',
  resolveAccountingActorEmail_: () => 'accounting@example.com',
  insertReconciliationRow_: (row) => reconciliationRows.push(Object.assign({}, row)),
  insertReconciliationItemRow_: (row) => reconciliationItems.push(Object.assign({}, row)),
  writeAccountingAudit_: () => {},
  getReconciliationDetailData_: () => ({ header: reconciliationRows[0], items: reconciliationItems })
};

vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/backend/core/db/sheets.gs'), 'utf8'), context);
context.getCurrentIsoDateTime_ = () => '2026-09-08T00:00:00+09:00';
vm.runInContext(fs.readFileSync(path.join(root, 'src/backend/domains/accounting/application/reconciliation_query.gs'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/backend/domains/accounting/application/reconciliation_mutation.gs'), 'utf8'), context);
context.getReconciliationDetailData_ = () => ({ header: reconciliationRows[0], items: reconciliationItems });

const detail = context.processReconciliationData_({
  startDate: '2026-02-02',
  endDate: '2026-02-22',
  bankTransactionIds: banks.map((bank) => bank.id)
}, { user: { email: 'accounting@example.com' } });

assert.strictEqual(updateCalls.length, 2);
assert.deepStrictEqual(updateCalls[0], {
  transaction_id: 'LEDGER-MANUAL-INCOME',
  bank_transaction_id: 'BANK-MANUAL-INCOME',
  reason: '감사대사 자동 연결: 승인 수입 원장 계좌거래 연결'
});
assert.deepStrictEqual(updateCalls[1], {
  transaction_id: 'LEDGER-WRONG-LINK',
  bank_transaction_id: 'BANK-FEE',
  reason: '감사대사 자동 보정: 승인 수입 원장 계좌거래 연결'
});
assert.strictEqual(createdRequests.length, 0, 'reconciliation must not create new ledgers');
assert.strictEqual(approvalCalls.length, 0, 'reconciliation must not approve ledgers');
assert.strictEqual(createdRequests.some((request) => request.bank_transaction_id === 'BANK-AMBIGUOUS'), false);
assert.strictEqual(createdRequests.some((request) => request.bank_transaction_id === 'BANK-EXPENSE'), false);

const byBank = Object.fromEntries(detail.items.map((item) => [item.bankTransactionId, item]));
assert.strictEqual(byBank['BANK-EVENT'].result, '원장누락');
assert.strictEqual(byBank['BANK-FEE'].result, '정상');
assert.strictEqual(byBank['BANK-EVENT-APP'].result, '원장누락');
assert.strictEqual(byBank['BANK-FEE-PENDING'].result, '원장누락');
assert.strictEqual(byBank['BANK-FEE-APP'].result, '원장누락');
assert.strictEqual(byBank['BANK-BLANK-DEPOSITOR'].result, '원장누락');
assert.strictEqual(byBank['BANK-MANUAL-INCOME'].result, '정상');
assert.strictEqual(byBank['BANK-MANUAL-AMBIGUOUS'].result, '정상');
assert.strictEqual(byBank['BANK-LEDGER-AMBIGUOUS'].result, '원장누락');
assert.strictEqual(byBank['BANK-PENDING-LEDGER'].result, '원장누락');
assert.strictEqual(byBank['BANK-REJECTED-LEDGER'].result, '원장누락');
assert.strictEqual(byBank['BANK-VOID-LEDGER'].result, '원장누락');
assert.strictEqual(byBank['BANK-AMBIGUOUS'].result, '원장누락');
assert.strictEqual(byBank['BANK-EXPENSE'].result, '원장누락');
assert.strictEqual(detail.header.normalCount, 3);
assert.strictEqual(detail.header.missingLedgerCount, 11);
assert.strictEqual(detail.header.status, '원장누락');
assert.strictEqual(ledgers.filter((ledger) => ledger.id === 'LEDGER-MANUAL-INCOME')[0].bankTransactionId, 'BANK-MANUAL-INCOME');
assert.strictEqual(ledgers.filter((ledger) => ledger.id === 'LEDGER-MANUAL-AMBIGUOUS-A')[0].bankTransactionId, '');
assert.strictEqual(ledgers.filter((ledger) => ledger.id === 'LEDGER-WRONG-LINK')[0].bankTransactionId, 'BANK-FEE');
assert.strictEqual(ledgers.filter((ledger) => ledger.id === 'LEDGER-AMBIGUOUS-A')[0].bankTransactionId, 'BANK-OLD-A');
assert.strictEqual(ledgers.filter((ledger) => ledger.id === 'LEDGER-PENDING')[0].bankTransactionId, 'BANK-OLD-PENDING');
assert.strictEqual(ledgers.filter((ledger) => ledger.id === 'LEDGER-REJECTED')[0].bankTransactionId, 'BANK-OLD-REJECTED');
assert.strictEqual(ledgers.filter((ledger) => ledger.id === 'LEDGER-VOID')[0].bankTransactionId, 'BANK-OLD-VOID');

console.log('Reconciliation auto-approved income ledger contract: PASS');
