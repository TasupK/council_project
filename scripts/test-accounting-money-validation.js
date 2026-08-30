var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var file = path.join(ROOT, 'src/backend/domains/accounting/application/ledger_mutation.gs');

function makeContext() {
  var inserted;
  var context = vm.createContext({
    console: console,
    Error: Error, String: String, Number: Number, Object: Object, Array: Array, JSON: JSON,
    isFinite: isFinite,
    LockService: {
      getScriptLock: function () {
        return { waitLock: function () {}, releaseLock: function () {} };
      }
    },
    getCurrentIsoDateTime_: function () { return '2026-08-18T21:00:00+09:00'; },
    resolveAccountingActorEmail_: function () { return 'staff@example.com'; },
    resolveReconciliationLedgerBankMatchStatus_: function (bankTransactionId) { return bankTransactionId ? '정상' : '미확인'; },
    generateAccountingId_: function () { return 'TRX-1'; },
    insertLedgerRow_: function (row) { inserted = row; return row; },
    writeAccountingAudit_: function () {},
    mapLedgerEntryDto_: function (row) { return row; },
    findLedgerRowById_: function () { return { id: 'TRX-1', transactionAt: '2026-08-18', description: '', transactionType: '수입', amount: 1000, counterparty: '', bankTransactionId: '', eventId: '', businessType: '일반', businessId: '', matchStatus: '미확인', recordStatus: '활성' }; },
    updateLedgerRowById_: function () {},
    getLedgerDetailData_: function () { return null; },
    isTruthyValue_: function (value) { return !!value; }
  });
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return { context: context, getInserted: function () { return inserted; } };
}

var h = makeContext();
h.context.createLedgerEntryData_({ transaction_type: '지출 ', amount: 1000 }, { email: 'staff@example.com' }, '활성');
assert.strictEqual(h.getInserted().transactionType, '지출', 'trimmed 지출 must remain transactionType=지출');
assert.strictEqual(h.getInserted().expense, undefined, 'v2 ledger must not persist expense boolean');
assert.strictEqual(h.getInserted().amount, 1000);

['기타', '', 'expense'].forEach(function (type) {
  var c = makeContext();
  assert.throws(function () { c.context.createLedgerEntryData_({ transaction_type: type, amount: 1000 }, {}, '활성'); }, /거래유형|transaction_type/);
});

[0, -1, 'abc', Infinity].forEach(function (amount) {
  var c = makeContext();
  assert.throws(function () { c.context.createLedgerEntryData_({ transaction_type: '수입', amount: amount }, {}, '활성'); }, /금액|amount/);
});

var u = makeContext();
assert.throws(function () { u.context.updateLedgerEntryData_({ transaction_id: 'TRX-1', transaction_type: '잘못된값', amount: 1000 }, {}); }, /거래유형|transaction_type/);
assert.throws(function () { u.context.updateLedgerEntryData_({ transaction_id: 'TRX-1', transaction_type: '수입', amount: -100 }, {}); }, /금액|amount/);

console.log('Accounting money/type validation contract passed.');