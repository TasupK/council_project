var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var file = path.join(ROOT, 'src/000_server/060_accounting/061_ledger/ledger_service.gs');

function makeContext() {
  var inserted;
  var context = vm.createContext({
    console: console,
    Error: Error, String: String, Number: Number, Object: Object, Array: Array, JSON: JSON,
    isFinite: isFinite,
    getCurrentIsoDateTime_: function () { return '2026-08-18T21:00:00+09:00'; },
    getAccountingActorEmail_: function () { return 'staff@example.com'; },
    makeId_: function () { return 'TRX-1'; },
    insertLedgerRow_: function (row) { inserted = row; return row; },
    saveEvidenceFiles_: function () { return []; },
    writeAccountingAudit_: function () {},
    getLedgerEntryDto_: function (row) { return row; },
    findLedgerRowById_: function () { return { id: 'TRX-1', transactionAt: '2026-08-18', description: '', expense: false, amount: 1000, balanceAfter: 0, counterparty: '', eventId: '', businessType: '일반', businessId: '', matchStatus: '미확인', recordStatus: 'ACTIVE' }; },
    updateLedgerRowById_: function () {},
    findLedgerEntryDtoById_: function () { return null; },
    isTruthyValue_: function (value) { return !!value; }
  });
  vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  return { context: context, getInserted: function () { return inserted; } };
}

var h = makeContext();
h.context.saveLedgerEntry_({ transaction_type: '지출 ', amount: 1000 }, { email: 'staff@example.com' }, 'ACTIVE');
assert.strictEqual(h.getInserted().expense, true, 'trimmed 지출 must remain expense');
assert.strictEqual(h.getInserted().amount, 1000);

['기타', '', 'expense'].forEach(function (type) {
  var c = makeContext();
  assert.throws(function () { c.context.saveLedgerEntry_({ transaction_type: type, amount: 1000 }, {}, 'ACTIVE'); }, /거래유형|transaction_type/);
});

[0, -1, 'abc', Infinity].forEach(function (amount) {
  var c = makeContext();
  assert.throws(function () { c.context.saveLedgerEntry_({ transaction_type: '수입', amount: amount }, {}, 'ACTIVE'); }, /금액|amount/);
});

var u = makeContext();
assert.throws(function () { u.context.updateLedgerEntry_({ transaction_id: 'TRX-1', transaction_type: '잘못된값', amount: 1000 }, {}); }, /거래유형|transaction_type/);
assert.throws(function () { u.context.updateLedgerEntry_({ transaction_id: 'TRX-1', transaction_type: '수입', amount: -100 }, {}); }, /금액|amount/);

console.log('Accounting money/type validation contract passed.');
