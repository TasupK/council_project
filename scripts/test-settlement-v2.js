const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/000_server/060_accounting/064_settlement/settlement_query_service.gs'), 'utf8'), context);

assert.strictEqual(typeof context.buildSettlementSnapshotMetrics_, 'function');
const prior = [
  { id: 'P1', transactionType: '수입', amount: 100000, recordStatus: '활성' },
  { id: 'P2', transactionType: '지출', amount: 30000, recordStatus: '활성' }
];
const period = [
  { id: 'L1', transactionType: '수입', amount: 20000, bankTransactionId: 'B1', matchStatus: '정상', recordStatus: '활성' },
  { id: 'L2', transactionType: '지출', amount: 5000, bankTransactionId: '', matchStatus: '미확인', recordStatus: '활성' },
  { id: 'L3', transactionType: '지출', amount: 3000, bankTransactionId: 'B3', matchStatus: '정상', recordStatus: '활성' }
];
const evidenceRows = [{ transactionId: 'L1' }];
const metrics = context.buildSettlementSnapshotMetrics_(prior, period, evidenceRows);
assert.deepStrictEqual(JSON.parse(JSON.stringify(metrics)), {
  openingBalance: 70000,
  totalIncome: 20000,
  totalExpense: 8000,
  closingBalance: 82000,
  incomeCount: 1,
  expenseCount: 2,
  unreconciledCount: 1,
  missingEvidenceCount: 2
});
console.log('Settlement v2 snapshot contract: PASS');
