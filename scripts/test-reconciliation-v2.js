const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = { console };
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/backend/core/db/sheets.gs'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/backend/domains/accounting/application/reconciliation_query.gs'), 'utf8'), context);

assert.strictEqual(typeof context.buildReconciliationSnapshotItems_, 'function');

const banks = [
  { id: 'B1', transactionAt: '2026-03-01 09:00:00', amount: 10000, recordStatus: '정상' },
  { id: 'B2', transactionAt: '2026-03-02 09:00:00', amount: -5000, recordStatus: '정상' },
  { id: 'B3', transactionAt: '2026-03-03 09:00:00', amount: 3000, recordStatus: '정상' },
  { id: 'B4', transactionAt: '2026-03-04 09:00:00', amount: -8000, recordStatus: '정상' },
  { id: 'B5', transactionAt: '2026-03-06 09:00:00', amount: -12000, recordStatus: '정상', description: '김수입' },
  { id: 'B6', transactionAt: '2026-03-07 09:00:00', amount: -9000, recordStatus: '정상', description: '같은방향' }
];
const ledgers = [
  { id: 'L1', bankTransactionId: 'B1', transactionAt: '2026-03-01', transactionType: '수입', amount: 10000, recordStatus: '활성' },
  { id: 'L2', bankTransactionId: 'B2', transactionAt: '2026-03-02', transactionType: '수입', amount: 5000, recordStatus: '활성' },
  { id: 'L3', bankTransactionId: '', transactionAt: '2026-03-03', transactionType: '지출', amount: 7000, recordStatus: '활성' },
  { id: 'L4', bankTransactionId: 'B4', transactionAt: '2026-03-05', transactionType: '지출', amount: 8000, recordStatus: '활성' },
  { id: 'L5', bankTransactionId: '', transactionAt: '2026-03-06', transactionType: '수입', amount: 12000, recordStatus: '활성', counterparty: '김수입' },
  { id: 'L6A', bankTransactionId: '', transactionAt: '2026-03-07', transactionType: '수입', amount: 9000, recordStatus: '활성', counterparty: '같은방향' },
  { id: 'L6B', bankTransactionId: '', transactionAt: '2026-03-07', transactionType: '지출', amount: 9000, recordStatus: '활성', counterparty: '같은방향' }
];

ledgers.forEach(ledger => { ledger.approvalStatus = '승인'; });
const items = context.buildReconciliationSnapshotItems_(banks, ledgers);
const byBank = Object.fromEntries(items.filter(x => x.bankTransactionId).map(x => [x.bankTransactionId, x]));
assert.strictEqual(byBank.B1.result, '정상');
assert.strictEqual(byBank.B2.result, '원장누락');
assert.strictEqual(byBank.B3.result, '원장누락');
assert.strictEqual(byBank.B4.result, '정상');
assert.strictEqual(byBank.B5.result, '원장누락');
assert.strictEqual(byBank.B5.ledgerId, '');
assert.strictEqual(byBank.B6.result, '정상');
assert.strictEqual(byBank.B6.ledgerId, 'L6B');
assert.strictEqual(items.some(x => x.ledgerId === 'L3'), false);
assert.strictEqual('matchMethod' in byBank.B1, false);
assert.strictEqual('updatedAt' in byBank.B1, false);

console.log('Reconciliation v2 snapshot contract: PASS');
