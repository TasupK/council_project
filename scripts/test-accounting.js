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
  context.writeBusinessAudit_ = function () { return true; };
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
  assert.strictEqual(context.mapLedgerEntryDto_({ transactionType: '지출' }).transaction_type, '지출');
  assert.strictEqual(context.mapLedgerEntryDto_({ transactionType: '수입' }).transaction_type, '수입');
  assert.strictEqual(context.mapLedgerEntryDto_({ managerEmail: 'manager@example.com' }).manager, 'manager@example.com');
}

function testLedgerComposition_() {
  var context = createContext_();
  context.listLedgerRows_ = function () {
    return [
      { id: 'trx-1', transactionAt: '2026-08-01T10:00:00', transactionType: '수입', amount: 3000, eventId: 'evt-1', matchStatus: '정상', recordStatus: '활성', createdAt: '2026-08-01', updatedAt: '2026-08-01' },
      { id: 'trx-2', transactionAt: '2026-08-02T10:00:00', transactionType: '지출', amount: 1200, eventId: '', matchStatus: '미확인', recordStatus: '활성', createdAt: '2026-08-02', updatedAt: '2026-08-02' },
      { id: 'trx-x', transactionAt: '2026-08-03T10:00:00', transactionType: '지출', amount: 999, recordStatus: '무효' }
    ];
  };
  context.listAccountingEventRows_ = function () { return [{ id: 'evt-1', name: '개강 행사' }]; };
  context.listLedgerEvidenceRows_ = function () {
    return [{ id: 'evd-1', transactionId: 'trx-1', driveFileId: 'file-1', fileName: '영수증.pdf', ocrStatus: '', ocrValidationResult: '', createdAt: '2026-08-01' }];
  };

  var result = context.getLedgerEntriesData_();
  assert.deepStrictEqual(result.map(function (item) { return item.transaction_id; }), ['trx-2', 'trx-1']);
  assert.strictEqual(result[0].event_name, '해당없음');
  assert.strictEqual(result[0].has_evidence, false);
  assert.strictEqual(result[1].event_name, '개강 행사');
  assert.strictEqual(result[1].has_evidence, true);
  assert.deepStrictEqual(plain_(result[1].evidence), [{
    evidence_id: 'evd-1', transaction_id: 'trx-1', file_name: '영수증.pdf', file_id: 'file-1',
    file_path: 'https://drive.google.com/open?id=file-1', ocr_status: '', ocr_validation_result: '',
    created_at: '2026-08-01', updated_at: '2026-08-01', is_deleted: false
  }]);
}

function testLedgerFilter_() {
  var context = createContext_();
  var items = [
    { transaction_id: '1', transaction_type: '수입', event_name: '개강 행사', status: '정상', counterparty: '김학생', description: '회비', manager: 'staff-a' },
    { transaction_id: '2', transaction_type: '지출', event_name: 'MT', status: '확인필요', counterparty: '문구점', description: '물품 구매', manager: 'staff-b' }
  ];
  var result = context.filterLedgerEntries_(items, { keyword: '문구', transaction_type: '지출', event_name: 'MT', status: '확인필요' });
  assert.deepStrictEqual(result.map(function (item) { return item.transaction_id; }), ['2']);
}

function testLedgerSaveDefaults_() {
  var context = createContext_();
  var inserted = null;
  var forwarded = null;
  context.insertLedgerRow_ = function (item) { inserted = plain_(item); };
  context.createEvidenceFilesData_ = function (transactionId, files, timestamp) {
    forwarded = { transactionId: transactionId, files: plain_(files), timestamp: timestamp };
    return { savedCount: files.length, errors: [] };
  };
  context.listLedgerRows_ = function () { return []; };

  var result = context.createLedgerEntryWithEvidenceData_({ transaction_type: '수입', amount: 5000, evidence_files: [{ file_id: 'file-1' }] }, { user: { email: 'manager@example.com' } }, '활성');
  assert.strictEqual(inserted.id, 'TRX-uuid-1');
  assert.strictEqual(inserted.source, 'MANUAL');
  assert.strictEqual(inserted.businessType, '일반');
  assert.strictEqual(inserted.matchStatus, '미확인');
  assert.strictEqual(inserted.recordStatus, '활성');
  assert.strictEqual(inserted.managerEmail, 'manager@example.com');
  assert.deepStrictEqual(forwarded, { transactionId: 'TRX-uuid-1', files: [{ file_id: 'file-1' }], timestamp: '2026-08-17T13:00:00+09:00' });
  assert.strictEqual(result.ok, true);
}

function testEvidenceSaveBehavior_() {
  var context = createContext_();
  var inserted = [];
  var nextId = 0;
  context.generateAccountingId_ = function () { nextId += 1; return 'EVD-' + nextId; };
  context.resolveAccountingSessionEmail_ = function () { return 'evidence@example.com'; };
  context.insertLedgerEvidenceRow_ = function (item) { inserted.push(plain_(item)); };
  context.createEvidenceDriveFile_ = function () { throw new Error('upload failed'); };

  var result = context.createEvidenceFilesData_('trx-1', [
    { file_name: '실패.pdf', content_base64: 'abc' },
    { file_name: '기존.pdf', file_id: 'drive-existing' }
  ], '2026-08-17T12:00:00+09:00');

  assert.strictEqual(result.savedCount, 1);
  assert.deepStrictEqual(plain_(result.errors), [
    { file_name: '실패.pdf', message: 'upload failed' },
    { file_name: '실패.pdf', message: '증빙 원본 파일이 저장되지 않았습니다.' }
  ]);
  assert.strictEqual(inserted.length, 1);
  assert.strictEqual(inserted[0].driveFileId, 'drive-existing');
  assert.strictEqual(inserted[0].managerEmail, 'evidence@example.com');
  assert.strictEqual(inserted[0].createdAt, '2026-08-17T12:00:00+09:00');
}

function createSchemaContext_() {
  var context = vm.createContext({ console: console });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', '000_server', '010_core', 'config.gs'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'src', '000_server', '020_schema', 'operation_db_schema.gs'), 'utf8'), context);
  return context;
}

function testAccountingOperationSchema_() {
  var context = createSchemaContext_();
  assert.strictEqual(context.OPERATION_TABLES.bankTransactions, '계좌거래');
  assert.strictEqual(context.OPERATION_TABLES.bankOcrLogs, undefined);
  assert.strictEqual(context.OPERATION_TABLES.reconciliationItems, '감사대사상세');
  assert.strictEqual(context.OPERATION_TABLES.settlementReports, '결산보고서');
  var schema = context.getOperationDbSchema_();
  assert.strictEqual(schema.ledger.fields.recordStatus, '레코드상태');
  assert.strictEqual(schema.ledger.fields.managerEmail, '담당자이메일');
  assert.deepStrictEqual(plain_(schema.reconciliationItems.foreignKeys), [
    { field: 'reconciliationId', refDatabase: 'operation', refTable: 'reconciliation', refField: 'id' },
    { field: 'bankTransactionId', refDatabase: 'operation', refTable: 'bankTransactions', refField: 'id', optional: true },
    { field: 'ledgerId', refDatabase: 'operation', refTable: 'ledger', refField: 'id', optional: true }
  ]);
}

function testLedgerLifecycle_() {
  var context = createContext_();
  var inserted = null, updated = null, audits = [];
  context.insertLedgerRow_ = function (row) { inserted = plain_(row); };
  context.createEvidenceFilesData_ = function () { return { savedCount: 0, errors: [] }; };
  context.writeAccountingAudit_ = function () { audits.push(Array.prototype.slice.call(arguments)); };
  context.getLedgerDetailData_ = function () { return null; };
  context.listLedgerRows_ = function () { return []; };

  context.createLedgerEntryData_({ transaction_type: '수입', amount: 1000 }, { user: { email: 'm@example.com' } }, '활성');
  assert.strictEqual(inserted.recordStatus, '활성');
  assert.strictEqual(inserted.managerEmail, 'm@example.com');

  context.createLedgerDraftData_({ transaction_type: '지출', amount: 2000 }, { user: { email: 'm@example.com' } });
  assert.strictEqual(inserted.recordStatus, '활성');
  assert.strictEqual(inserted.matchStatus, '미확인');

  context.findLedgerRowById_ = function () { return { id: 'trx-1', transactionAt: '2026-08-01', transactionType: '지출', amount: 1000, bankTransactionId: '', recordStatus: '활성', createdAt: 'old', matchStatus: '미확인' }; };
  context.updateLedgerRowById_ = function (id, changes) { updated = { id: id, changes: plain_(changes) }; };
  context.deleteLedgerEntryData_({ transaction_id: 'trx-1' }, { user: { email: 'm@example.com' } });
  assert.strictEqual(updated.changes.recordStatus, '무효');
  assert.ok(audits.length >= 3);
}

function testEvidenceAuditQuery_() {
  var context = createContext_();
  context.getLedgerEntriesData_ = function () { return [{ transaction_id: 'trx-1', transaction_date: '2026-08-01', transaction_type: '지출', amount: 12000 }]; };
  context.listLedgerEvidenceRows_ = function () { return [{ id: 'evd-1', transactionId: 'trx-1', fileName: 'receipt.pdf', driveFileId: 'drive-1', createdAt: '2026-08-01' }]; };
  assert.deepStrictEqual(plain_(context.getEvidenceAuditListData_({ startDate: '2026-08-01', endDate: '2026-08-31', transaction_type: '지출' }).items[0]), {
    evidence_id: 'evd-1', transaction_id: 'trx-1', transaction_date: '2026-08-01', transaction_type: '지출', amount: 12000,
    file_name: 'receipt.pdf', file_id: 'drive-1', category: '', type: '', ocr_status: '', ocr_validation_result: '', created_at: '2026-08-01'
  });
}

function testSettlementMetrics_() {
  var context = createContext_();
  context.buildApprovedLedgerAccountingFacts_ = function () { return [
    { id: 'prior', transactionAt: '2026-07-31', transactionType: '수입', amount: 500, recordStatus: '활성', bankTransactionId: 'b0', matchStatus: '정상' },
    { id: 'i1', transactionAt: '2026-08-01', transactionType: '수입', amount: 3000, recordStatus: '활성', bankTransactionId: 'b1', matchStatus: '정상' },
    { id: 'e1', transactionAt: '2026-08-02', transactionType: '지출', amount: 1200, recordStatus: '활성', bankTransactionId: 'b2', matchStatus: '정상' },
    { id: 'x1', transactionAt: '2026-08-03', transactionType: '지출', amount: 999, recordStatus: '활성', bankTransactionId: '', matchStatus: '미확인' },
    { id: 'void', transactionAt: '2026-08-04', transactionType: '수입', amount: 100, recordStatus: '무효' }
  ]; };
  context.listLedgerEvidenceRows_ = function () { return [{ transactionId: 'i1' }, { transactionId: 'e1' }]; };
  var summary = context.getSettlementSummaryData_({ startDate: '2026-08-01', endDate: '2026-08-31' });
  assert.deepStrictEqual(plain_(summary), {
    openingBalance: 500,
    totalIncome: 3000,
    totalExpense: 2199,
    closingBalance: 1301,
    incomeCount: 1,
    expenseCount: 2,
    unreconciledCount: 1,
    missingEvidenceCount: 1
  });
}

testLedgerDto_();
testLedgerComposition_();
testLedgerFilter_();
testLedgerSaveDefaults_();
testEvidenceSaveBehavior_();
testAccountingOperationSchema_();
testLedgerLifecycle_();
testEvidenceAuditQuery_();
testSettlementMetrics_();
console.log('Accounting behavior regression tests passed.');
