var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.resolve(__dirname, '..');
var ACCOUNTING_ROOT = path.join(ROOT, 'src', '000_server', '060_accounting');

function listGsFiles_(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).reduce(function (files, entry) {
    var target = path.join(directory, entry.name);
    if (entry.isDirectory()) return files.concat(listGsFiles_(target));
    if (/\.gs$/.test(entry.name)) files.push(target);
    return files;
  }, []).sort();
}

function createContext_() {
  var context = vm.createContext({
    console: console,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Boolean: Boolean,
    Math: Math,
    Date: Date,
    JSON: JSON,
    isFinite: isFinite
  });
  listGsFiles_(ACCOUNTING_ROOT).forEach(function (file) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  });
  context.formatDateTimeValue_ = function (value) { return value || ''; };
  context.isTruthyValue_ = function (value) { return Boolean(value); };
  context.getCurrentIsoDateTime_ = function () { return '2026-08-17T13:00:00+09:00'; };
  context.Utilities = {
    getUuid: function () { return 'uuid-1'; },
    base64Encode: function (bytes) { return Buffer.from(bytes).toString('base64'); }
  };
  context.Session = {
    getActiveUser: function () {
      return { getEmail: function () { return 'fallback@example.com'; } };
    }
  };
  return context;
}

function plain_(value) {
  return JSON.parse(JSON.stringify(value));
}

function testLedgerDto_() {
  var context = createContext_();
  assert.strictEqual(context.getLedgerEntryDto_({ expense: true }).transaction_type, '지출');
  assert.strictEqual(context.getLedgerEntryDto_({ expense: false }).transaction_type, '수입');
}

function testLedgerComposition_() {
  var context = createContext_();
  context.findAllLedgerRows_ = function () {
    return [
      { id: 'trx-1', transactionAt: '2026-08-01T10:00:00', expense: false, amount: 3000, eventId: 'evt-1', createdAt: '2026-08-01', updatedAt: '2026-08-01' },
      { id: 'trx-2', transactionAt: '2026-08-02T10:00:00', expense: true, amount: 1200, eventId: '', createdAt: '2026-08-02', updatedAt: '2026-08-02' }
    ];
  };
  context.findAllAccountingEventRows_ = function () {
    return [{ id: 'evt-1', name: '개강 행사' }];
  };
  context.findAllLedgerEvidenceRows_ = function () {
    return [{ id: 'evd-1', transactionId: 'trx-1', driveFileId: 'file-1', fileName: '영수증.pdf', createdAt: '2026-08-01' }];
  };

  var result = context.getLedgerEntries_();
  assert.deepStrictEqual(result.map(function (item) { return item.transaction_id; }), ['trx-2', 'trx-1']);
  assert.strictEqual(result[0].event_name, '해당없음');
  assert.strictEqual(result[0].has_evidence, false);
  assert.strictEqual(result[1].event_name, '개강 행사');
  assert.strictEqual(result[1].has_evidence, true);
  assert.deepStrictEqual(plain_(result[1].evidence), [{
    evidence_id: 'evd-1',
    transaction_id: 'trx-1',
    file_name: '영수증.pdf',
    file_id: 'file-1',
    file_path: 'https://drive.google.com/open?id=file-1',
    created_at: '2026-08-01',
    updated_at: '2026-08-01',
    is_deleted: false
  }]);
}

function testLedgerFilter_() {
  var context = createContext_();
  var items = [
    { transaction_id: '1', transaction_type: '수입', event_name: '개강 행사', status: '정상', counterparty: '김학생', description: '회비', manager: 'staff-a' },
    { transaction_id: '2', transaction_type: '지출', event_name: 'MT', status: '확인필요', counterparty: '문구점', description: '물품 구매', manager: 'staff-b' }
  ];
  var result = context.filterLedgerEntries_(items, {
    keyword: '문구',
    transaction_type: '지출',
    event_name: 'MT',
    status: '확인필요'
  });
  assert.deepStrictEqual(result.map(function (item) { return item.transaction_id; }), ['2']);
}

function testLedgerSaveDefaults_() {
  var context = createContext_();
  var inserted = null;
  var forwarded = null;
  context.insertLedgerRow_ = function (item) { inserted = plain_(item); };
  context.saveEvidenceFiles_ = function (transactionId, files, timestamp) {
    forwarded = { transactionId: transactionId, files: plain_(files), timestamp: timestamp };
    return { savedCount: files.length, errors: [] };
  };

  var result = context.saveLedgerEntry_({
    transaction_type: '수입',
    amount: 5000,
    evidence_files: [{ file_id: 'file-1' }]
  }, { user: { email: 'manager@example.com' } });

  assert.strictEqual(inserted.id, 'TRX-uuid-1');
  assert.strictEqual(inserted.source, '수기등록');
  assert.strictEqual(inserted.businessType, '일반');
  assert.strictEqual(inserted.matchStatus, '미확인');
  assert.strictEqual(inserted.managerId, 'manager@example.com');
  assert.deepStrictEqual(forwarded, {
    transactionId: 'TRX-uuid-1',
    files: [{ file_id: 'file-1' }],
    timestamp: '2026-08-17T13:00:00+09:00'
  });
  assert.strictEqual(result.ok, true);
}

function testEvidenceSaveBehavior_() {
  var context = createContext_();
  var inserted = [];
  var nextId = 0;
  context.makeId_ = function () { nextId += 1; return 'EVD-' + nextId; };
  context.getCurrentUserName_ = function () { return 'evidence@example.com'; };
  context.insertLedgerEvidenceRow_ = function (item) { inserted.push(plain_(item)); };
  context.createEvidenceDriveFile_ = function () { throw new Error('upload failed'); };

  var result = context.saveEvidenceFiles_('trx-1', [
    { file_name: '실패.pdf', content_base64: 'abc' },
    { file_name: '기존.pdf', file_id: 'drive-existing' }
  ], '2026-08-17T12:00:00+09:00');

  assert.strictEqual(result.savedCount, 2);
  assert.deepStrictEqual(plain_(result.errors), [{ file_name: '실패.pdf', message: 'upload failed' }]);
  assert.strictEqual(inserted[0].category, '추가증빙');
  assert.strictEqual(inserted[0].type, '기타');
  assert.strictEqual(inserted[0].driveFileId, '');
  assert.strictEqual(inserted[0].createdAt, '2026-08-17T12:00:00+09:00');
  assert.strictEqual(inserted[1].driveFileId, 'drive-existing');
}

function testSettlementSummaryCompatibility_() {
  var context = createContext_();
  context.apiHandler_ = function (options) {
    return options.service(options.input, { user: { email: 'manager@example.com' } });
  };
  context.getLedgerEntries_ = function () {
    return [
      { transaction_type: '수입', amount: 3000, counterparty: '', description: '', manager: '', event_name: '전체', status: '정상' },
      { transaction_type: '지출', amount: 1200, counterparty: '', description: '', manager: '', event_name: '전체', status: '정상' }
    ];
  };
  context.findAllAccountingEventRows_ = function () { return [{}, {}]; };
  context.findAllLedgerEvidenceRows_ = function () { return [{}, {}, {}]; };

  var summary = context.api_getSettlementSummary({});
  assert.deepStrictEqual(plain_(summary), {
    totalIncome: 3000,
    totalExpense: 1200,
    balance: 1800,
    eventCount: 2,
    evidenceCount: 3
  });
}

testLedgerDto_();
testLedgerComposition_();
testLedgerFilter_();
testLedgerSaveDefaults_();
testEvidenceSaveBehavior_();
testSettlementSummaryCompatibility_();
console.log('Accounting behavior regression tests passed.');
