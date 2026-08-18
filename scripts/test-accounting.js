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
    isFinite: isFinite,
    Buffer: Buffer
  });
  listGsFiles_(ACCOUNTING_ROOT).forEach(function (file) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, { filename: file });
  });
  context.formatDateTimeValue_ = function (value) { return value || ''; };
  context.isTruthyValue_ = function (value) { return Boolean(value); };
  context.getCurrentIsoDateTime_ = function () { return '2026-08-17T13:00:00+09:00'; };
  context.Utilities = {
    getUuid: function () { return 'uuid-1'; },
    base64Encode: function (bytes) { return Buffer.from(bytes).toString('base64'); },
    base64Decode: function (value) { return Buffer.from(value || '', 'base64'); },
    newBlob: function () { return {}; }
  };
  context.LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
  context.Drive = { Files: { create: function () { return { id: 'ocr-doc' }; }, remove: function () {} } };
  context.DocumentApp = { openById: function () { return { getBody: function () { return { getText: function () { return ''; } }; } }; } };
  context.DriveApp = { getFileById: function () { return { setTrashed: function () {} }; } };
  context.appendOperationTableRow_ = function () { return true; };
  context.updateOperationTableRow_ = function () { return true; };
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
  context.listLedgerRows_ = function () {
    return [
      { id: 'trx-1', transactionAt: '2026-08-01T10:00:00', expense: false, amount: 3000, eventId: 'evt-1', createdAt: '2026-08-01', updatedAt: '2026-08-01' },
      { id: 'trx-2', transactionAt: '2026-08-02T10:00:00', expense: true, amount: 1200, eventId: '', createdAt: '2026-08-02', updatedAt: '2026-08-02' }
    ];
  };
  context.findAllAccountingEventRows_ = function () {
    return [{ id: 'evt-1', name: '개강 행사' }];
  };
  context.listLedgerEvidenceRows_ = function () {
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
  context.listLedgerEvidenceRows_ = function () { return [{}, {}, {}]; };

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


function createSchemaContext_() {
  var context = vm.createContext({ console: console });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', '000_server', '010_core', 'config.gs'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', '000_server', '020_schema', 'operation_db_schema.gs'), 'utf8'), context);
  return context;
}

function testAccountingOperationSchema_() {
  var context = createSchemaContext_();
  assert.strictEqual(context.OPERATION_TABLES.bankTransactions, '계좌거래');
  assert.strictEqual(context.OPERATION_TABLES.bankOcrLogs, '계좌OCR로그');
  assert.strictEqual(context.OPERATION_TABLES.reconciliationItems, '감사대사상세');
  assert.strictEqual(context.OPERATION_TABLES.settlementReports, '결산보고서');
  var schema = context.getOperationDbSchema_();
  assert.strictEqual(schema.ledger.fields.recordStatus, '레코드상태');
  assert.deepStrictEqual(plain_(schema.reconciliationItems.foreignKeys), [
    { field: 'reconciliationId', refDatabase: 'operation', refTable: 'reconciliation', refField: 'id' },
    { field: 'bankTransactionId', refDatabase: 'operation', refTable: 'bankTransactions', refField: 'id' },
    { field: 'ledgerId', refDatabase: 'operation', refTable: 'ledger', refField: 'id', optional: true }
  ]);
}

function testLedgerLifecycle_() {
  var context = createContext_();
  var inserted = null, updated = null, audits = [];
  context.insertLedgerRow_ = function (row) { inserted = plain_(row); };
  context.saveEvidenceFiles_ = function () { return { savedCount: 0, errors: [] }; };
  context.writeAccountingAudit_ = function () { audits.push(Array.prototype.slice.call(arguments)); };
  context.findLedgerEntryDtoById_ = function () { return null; };
  context.saveLedgerEntry_({ transaction_type: '수입', amount: 1000 }, { user: { email: 'm@example.com' } }, 'ACTIVE');
  assert.strictEqual(inserted.recordStatus, 'ACTIVE');
  context.saveLedgerDraft_({ transaction_type: '지출', amount: 2000 }, { user: { email: 'm@example.com' } });
  assert.strictEqual(inserted.recordStatus, 'DRAFT');
  context.findLedgerRowById_ = function () { return { id: 'trx-1', transactionAt: '2026-08-01', expense: true, amount: 1000, recordStatus: 'ACTIVE', createdAt: 'old', matchStatus: '미확인' }; };
  context.updateLedgerRowById_ = function (id, changes) { updated = { id: id, changes: plain_(changes) }; };
  context.softDeleteLedgerEntry_({ transaction_id: 'trx-1' }, { user: { email: 'm@example.com' } });
  assert.strictEqual(updated.changes.recordStatus, 'DELETED');
  assert.ok(audits.length >= 3);
}

function testLedgerDeletedFiltering_() {
  var context = createContext_();
  context.listLedgerRows_ = function () { return [
    { id: 'active', transactionAt: '2026-08-01', expense: false, amount: 1000, recordStatus: 'ACTIVE' },
    { id: 'draft', transactionAt: '2026-08-02', expense: true, amount: 500, recordStatus: 'DRAFT' },
    { id: 'deleted', transactionAt: '2026-08-03', expense: true, amount: 999, recordStatus: 'DELETED' }
  ]; };
  context.findAllAccountingEventRows_ = function () { return []; };
  context.listLedgerEvidenceRows_ = function () { return []; };
  var items = context.getLedgerEntries_();
  assert.deepStrictEqual(items.map(function (x) { return x.transaction_id; }).sort(), ['active', 'draft']);
  assert.strictEqual(items.filter(function (x) { return x.transaction_id === 'draft'; })[0].status, '임시저장');
}

function testEvidenceAuditQuery_() {
  var context = createContext_();
  context.getLedgerEntries_ = function () { return [{ transaction_id: 'trx-1', transaction_date: '2026-08-01', transaction_type: '지출', amount: 12000 }]; };
  context.listLedgerEvidenceRows_ = function () { return [{ id: 'evd-1', transactionId: 'trx-1', fileName: 'receipt.pdf', driveFileId: 'drive-1', createdAt: '2026-08-01' }]; };
  assert.deepStrictEqual(plain_(context.getEvidenceAuditList_({ startDate: '2026-08-01', endDate: '2026-08-31', transaction_type: '지출' }).items[0]), {
    evidence_id: 'evd-1', transaction_id: 'trx-1', transaction_date: '2026-08-01', transaction_type: '지출', amount: 12000, file_name: 'receipt.pdf', file_id: 'drive-1', category: '', type: '', created_at: '2026-08-01'
  });
}

function testBankParserIncomeExpense_() {
  var context = createContext_();
  var parsed = context.parseBankOcrTransactions_('2026-08-01\n출금 12,000원\n스타문구\n적요 문구 구매\n2026-08-02\n입금 50,000원\n김학생\n적요 회비 입금', 'bank.png', 2026);
  assert.strictEqual(parsed.items.length, 2);
  assert.deepStrictEqual(plain_(parsed.items[0]), { transactionAt: '2026-08-01', expense: true, counterparty: '스타문구', description: '문구 구매', amount: 12000, sourceFileName: 'bank.png' });
  assert.strictEqual(parsed.items[1].expense, false);
  assert.strictEqual(parsed.items[1].amount, 50000);
  var ambiguous = context.parseBankOcrTransactions_('2026-08-03\n12,000원\n누군가', 'bad.png', 2026);
  assert.strictEqual(ambiguous.items.length, 0);
  assert.strictEqual(ambiguous.reviewRequiredItems.length, 1);
}

function testReconciliationMatching_() {
  var context = createContext_();
  var banks = [
    { id: 'b1', transactionAt: '2026-08-01', expense: true, amount: 12000, counterparty: '스타문구', description: '문구 구매' },
    { id: 'b2', transactionAt: '2026-08-02', expense: false, amount: 50000, counterparty: '김학생', description: '회비 입금' },
    { id: 'b3', transactionAt: '2026-08-03', expense: true, amount: 7000, counterparty: '없는가게', description: '' }
  ];
  var ledgers = [
    { transaction_id: 'l1', transaction_date: '2026-08-01', transaction_type: '지출', amount: 12000, counterparty: '스타문구', description: '문구 구매' },
    { transaction_id: 'l2', transaction_date: '2026-08-02', transaction_type: '수입', amount: 50000, counterparty: '김학생', description: '회비 입금' }
  ];
  var results = context.buildReconciliationResults_(banks, ledgers);
  assert.deepStrictEqual(results.map(function (x) { return x.status; }), ['정상', '정상', '원장누락의심']);
  assert.strictEqual(context.scoreReconciliationCandidate_(banks[0], ledgers[1]), null);
}

function testSettlementEligibilityAndSnapshot_() {
  var context = createContext_();
  context.getLedgerEntries_ = function () { return [
    { transaction_id: 'i1', transaction_date: '2026-08-01', transaction_type: '수입', amount: 3000, status: '정상', match_status: '정상', record_status: 'ACTIVE' },
    { transaction_id: 'e1', transaction_date: '2026-08-02', transaction_type: '지출', amount: 1200, status: '정상', match_status: '정상', record_status: 'ACTIVE' },
    { transaction_id: 'x1', transaction_date: '2026-08-03', transaction_type: '지출', amount: 999, status: '확인필요', match_status: '확인필요', record_status: 'ACTIVE' },
    { transaction_id: 'd1', transaction_date: '2026-08-04', transaction_type: '수입', amount: 100, status: '임시저장', match_status: '정상', record_status: 'DRAFT' }
  ]; };
  context.listLedgerEvidenceRows_ = function () { return [{ transactionId: 'i1' }, { transactionId: 'e1' }, { transactionId: 'x1' }]; };
  var summary = context.getSettlementSummary_({ startDate: '2026-08-01', endDate: '2026-08-31' });
  assert.deepStrictEqual(plain_(summary), { totalIncome: 3000, totalExpense: 1200, balance: 1800, incomeCount: 1, expenseCount: 1, evidenceCount: 2 });
  var inserted = null;
  context.insertSettlementReportRow_ = function (row) { inserted = plain_(row); };
  context.writeAccountingAudit_ = function () {};
  var report = context.generateSettlementReport_({ startDate: '2026-08-01', endDate: '2026-08-31' }, { user: { email: 'm@example.com' } });
  assert.strictEqual(report.status, '생성완료');
  assert.strictEqual(inserted.totalIncome, 3000);
}

testAccountingOperationSchema_();
testLedgerLifecycle_();
testLedgerDeletedFiltering_();
testEvidenceAuditQuery_();
testBankParserIncomeExpense_();
testReconciliationMatching_();
testSettlementEligibilityAndSnapshot_();
console.log('Accounting behavior regression tests passed.');
