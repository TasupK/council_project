const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
let inserted = null;
let updated = null;
let existingRows = [];
const bankRows = {
  BNK_IN: { id: 'BNK_IN', amount: 50000, recordStatus: '정상' },
  BNK_OUT: { id: 'BNK_OUT', amount: -8800, recordStatus: '정상' },
  BNK_VOID: { id: 'BNK_VOID', amount: 1000, recordStatus: '무효' }
};

const context = {
  console,
  isFinite,
  getCurrentIsoDateTime_: () => '2026-08-19T14:00:00+09:00',
  resolveAccountingActorEmail_: () => 'tester@mju.ac.kr',
  generateAccountingId_: () => 'TRX-1',
  insertLedgerRow_: row => { inserted = { ...row }; existingRows.push({ ...row }); },
  updateLedgerRowById_: (id, changes) => { updated = { id, ...changes }; },
  createEvidenceFilesData_: () => ({ savedCount: 0, errors: [] }),
  writeAccountingAudit_: () => {},
  mapLedgerEntryDto_: row => ({ ...row }),
  getLedgerDetailData_: () => null,
  findLedgerRowById_: id => existingRows.find(row => row.id === id) || null,
  listLedgerRows_: () => existingRows.slice(),
  findBankTransactionRowById_: id => bankRows[id] || null,
  LockService: {
    getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} })
  }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'src/000_server/060_accounting/061_ledger/ledger_service.gs'), 'utf8'), context);

function reset() { inserted = null; updated = null; existingRows = []; }

reset();
context.createLedgerEntryData_({ transaction_type: '수입', amount: 20000, description: '수기 선등록' }, {}, '활성');
assert.strictEqual(inserted.transactionType, '수입');
assert.strictEqual(inserted.source, 'MANUAL');
assert.strictEqual(inserted.bankTransactionId, '');
assert.strictEqual(inserted.matchStatus, '미확인');
assert.strictEqual(inserted.recordStatus, '활성');
assert.strictEqual(inserted.amount, 20000);
assert.strictEqual('expense' in inserted, false);
assert.strictEqual('balanceAfter' in inserted, false);

reset();
context.createLedgerEntryData_({ transaction_type: '지출', amount: 8800, description: '카드구매', bank_transaction_id: 'BNK_OUT' }, {}, '활성');
assert.strictEqual(inserted.transactionType, '지출');
assert.strictEqual(inserted.source, 'BANK');
assert.strictEqual(inserted.bankTransactionId, 'BNK_OUT');
assert.strictEqual(inserted.matchStatus, '정상');

reset();
context.createLedgerEntryData_({ transaction_id: 'TRX-A', transaction_type: '지출', amount: 8800, bank_transaction_id: 'BNK_OUT' }, {}, '활성');
assert.throws(() => context.createLedgerEntryData_({ transaction_id: 'TRX-B', transaction_type: '지출', amount: 8800, bank_transaction_id: 'BNK_OUT' }, {}, '활성'), /이미 다른 원장/);

reset();
context.createLedgerEntryData_({ transaction_type: '수입', amount: 40000, bank_transaction_id: 'BNK_IN' }, {}, '활성');
assert.strictEqual(inserted.matchStatus, '확인필요');

reset();
assert.throws(() => context.createLedgerEntryData_({ transaction_type: '수입', amount: 1000, bank_transaction_id: 'BNK_VOID' }, {}, '활성'), /무효/);

reset();
existingRows = [{ id: 'TRX-D', transactionType: '수입', amount: 1000, recordStatus: '활성', matchStatus: '미확인' }];
context.deleteLedgerEntryData_({ transaction_id: 'TRX-D' }, {});
assert.strictEqual(updated.recordStatus, '무효');

assert.throws(() => context.parseLedgerPositiveAmount_(-1), /0보다 큰/);
console.log('Ledger bank-link v2 contract: PASS');
