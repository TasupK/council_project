const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/000_server/010_core/config.gs'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/000_server/020_schema/operation_db_schema.gs'), 'utf8'), context);

const schema = context.getOperationDbSchema_();

assert.deepStrictEqual(JSON.parse(JSON.stringify(schema.bankTransactions.fields)), {
  id: '계좌거래ID',
  transactionAt: '거래일시',
  description: '적요',
  bankType: '거래유형',
  institution: '거래기관',
  counterpartyAccountNumber: '상대계좌번호',
  amount: '거래금액',
  balanceAfter: '거래후잔액',
  memo: '메모',
  sourceHash: '원본해시',
  recordStatus: '레코드상태',
  createdAt: '등록일시'
});
assert.strictEqual(schema.bankOcrLogs, undefined);
assert.strictEqual(context.OPERATION_TABLES.bankOcrLogs, undefined);

assert.strictEqual(schema.ledger.fields.bankTransactionId, '계좌거래ID');
assert.strictEqual(schema.ledger.fields.balanceAfter, undefined);
assert.strictEqual(schema.ledger.fields.expense, undefined);
assert.strictEqual(schema.ledger.fields.transactionType, '거래구분');
assert.ok(schema.ledger.foreignKeys.some(fk => fk.field === 'bankTransactionId' && fk.refTable === 'bankTransactions' && fk.refField === 'id' && fk.optional === true));

assert.strictEqual(schema.evidence.fields.ocrStatus, 'OCR상태');
assert.strictEqual(schema.evidence.fields.ocrValidationResult, 'OCR검증결과');

assert.deepStrictEqual(JSON.parse(JSON.stringify(schema.reconciliation.fields)), {
  id: '대사ID',
  auditStartDate: '감사시작일',
  auditEndDate: '감사종료일',
  accountOpeningBalance: '계좌기초잔액',
  accountClosingBalance: '계좌기말잔액',
  accountTransactionCount: '계좌거래건수',
  ledgerTransactionCount: '원장거래건수',
  normalCount: '정상건수',
  missingLedgerCount: '원장누락건수',
  unverifiedBankCount: '계좌미확인건수',
  reviewRequiredCount: '확인필요건수',
  status: '대사상태',
  managerEmail: '담당자이메일',
  executedAt: '실행일시',
  confirmedAt: '확인일시',
  confirmation: '확인내용'
});

assert.deepStrictEqual(JSON.parse(JSON.stringify(schema.reconciliationItems.fields)), {
  id: '대사상세ID',
  reconciliationId: '대사ID',
  bankTransactionId: '계좌거래ID',
  ledgerId: '거래ID',
  result: '대사결과',
  differenceAmount: '차이금액',
  validationNote: '검증내용',
  createdAt: '등록일시'
});

assert.deepStrictEqual(JSON.parse(JSON.stringify(schema.settlementReports.fields)), {
  id: '결산ID',
  name: '결산명',
  startDate: '결산시작일',
  endDate: '결산종료일',
  openingBalance: '기초잔액',
  totalIncome: '총수입',
  totalExpense: '총지출',
  closingBalance: '기말잔액',
  incomeCount: '수입건수',
  expenseCount: '지출건수',
  unreconciledCount: '미대사건수',
  missingEvidenceCount: '증빙미비건수',
  status: '결산상태',
  reportDriveFileId: '보고서Drive파일ID',
  managerEmail: '담당자이메일',
  createdAt: '생성일시',
  confirmedAt: '확정일시',
  note: '비고'
});

const integritySource = fs.readFileSync(path.join(root, 'src/000_server/020_schema/operation_db_integrity.gs'), 'utf8');
assert.ok(integritySource.includes("{ tableKey: 'bankTransactions', fields: ['sourceHash'] }"), 'bank transaction sourceHash must be unique');
assert.ok(integritySource.includes("{ tableKey: 'ledger', fields: ['bankTransactionId'] }"), 'ledger bankTransactionId must be unique when populated');

console.log('Accounting DB v2 schema contract: PASS');
