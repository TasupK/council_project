from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')


def write(rel, content):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding='utf-8')


def replace_once(rel, old, new):
    text = read(rel)
    if old not in text:
        raise RuntimeError(f'pattern not found in {rel}: {old[:80]!r}')
    write(rel, text.replace(old, new, 1))


# Task 1: OperationDB + manifest
replace_once(
    'src/000_server/010_core/config.gs',
    "  evidence: '거래증빙',\n  reconciliation: '감사대사'\n};",
    "  evidence: '거래증빙',\n  reconciliation: '감사대사',\n  bankTransactions: '계좌거래',\n  bankOcrLogs: '계좌OCR로그',\n  reconciliationItems: '감사대사상세',\n  settlementReports: '결산보고서'\n};"
)

replace_once(
    'src/000_server/020_schema/operation_db_schema.gs',
    "        matchStatus: '일치상태',\n        managerId: '담당자ID',",
    "        matchStatus: '일치상태',\n        recordStatus: '레코드상태',\n        managerId: '담당자ID',"
)

new_schema_blocks = """    bankTransactions: {
      name: '계좌거래',
      sheetName: OPERATION_TABLES.bankTransactions,
      fields: {
        id: '계좌거래ID',
        transactionAt: '거래일시',
        expense: '거래구분',
        counterparty: '거래상대명',
        description: '거래내용',
        amount: '거래금액',
        sourceFileName: '원본파일명',
        createdAt: '등록일시'
      },
      primaryKey: ['id'],
      foreignKeys: []
    },
    bankOcrLogs: {
      name: '계좌OCR로그',
      sheetName: OPERATION_TABLES.bankOcrLogs,
      fields: {
        id: 'OCR로그ID',
        fileName: '파일명',
        status: '처리상태',
        extractedCount: '추출거래건수',
        errorMessage: '오류메시지',
        createdAt: '처리일시'
      },
      primaryKey: ['id'],
      foreignKeys: []
    },
    reconciliationItems: {
      name: '감사대사상세',
      sheetName: OPERATION_TABLES.reconciliationItems,
      fields: {
        id: '대사상세ID',
        reconciliationId: '대사ID',
        bankTransactionId: '계좌거래ID',
        ledgerId: '거래ID',
        status: '대사상태',
        differenceAmount: '차이금액',
        matchMethod: '연결방식',
        note: '비고',
        createdAt: '등록일시',
        updatedAt: '수정일시'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'reconciliationId', refDatabase: 'operation', refTable: 'reconciliation', refField: 'id' },
        { field: 'bankTransactionId', refDatabase: 'operation', refTable: 'bankTransactions', refField: 'id' },
        { field: 'ledgerId', refDatabase: 'operation', refTable: 'ledger', refField: 'id', optional: true }
      ]
    },
    settlementReports: {
      name: '결산보고서',
      sheetName: OPERATION_TABLES.settlementReports,
      fields: {
        id: '결산ID',
        startDate: '결산시작일',
        endDate: '결산종료일',
        totalIncome: '총수입',
        totalExpense: '총지출',
        balance: '잔액',
        incomeCount: '수입건수',
        expenseCount: '지출건수',
        evidenceCount: '증빙건수',
        status: '결산상태',
        managerId: '담당자ID',
        createdAt: '등록일시'
      },
      primaryKey: ['id'],
      foreignKeys: [
        { field: 'managerId', refDatabase: 'user', refTable: 'users', refField: 'email' }
      ]
    },
"""
replace_once(
    'src/000_server/020_schema/operation_db_schema.gs',
    "    reconciliation: {\n",
    new_schema_blocks + "    reconciliation: {\n"
)

manifest_path = ROOT / 'src/appsscript.json'
manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
manifest['dependencies'] = {
    'enabledAdvancedServices': [
        {'userSymbol': 'Drive', 'version': 'v3', 'serviceId': 'drive'}
    ]
}
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

# Common Accounting helpers and audit DAO
write('src/000_server/060_accounting/060_common/accounting_common.gs', r'''/** Accounting 전역에서 공유하는 최소 공통 헬퍼 */

function makeId_(prefix) {
  return prefix + '-' + Utilities.getUuid();
}

function getCurrentUserName_() {
  try {
    return Session.getActiveUser().getEmail() || '운영자';
  } catch (error) {
    console.error('Failed to read accounting user email.', error);
    return '운영자';
  }
}

function getAccountingActorEmail_(context) {
  return context && context.user && context.user.email ? context.user.email : getCurrentUserName_();
}

function inAccountingDateRange_(value, startDate, endDate) {
  var date = String(formatDateTimeValue_(value) || '').slice(0, 10);
  if (startDate && date < String(startDate)) return false;
  if (endDate && date > String(endDate)) return false;
  return true;
}
''')

write('src/000_server/060_accounting/060_common/accounting_audit_sheet_dao.gs', r'''/** Accounting 업무감사로그 저장 */

function insertAccountingAuditRow_(row) {
  return appendOperationTableRow_('businessAuditLogs', row);
}

function writeAccountingAudit_(actorEmail, actionType, targetType, targetId, beforeValue, afterValue, reason) {
  return insertAccountingAuditRow_({
    id: Utilities.getUuid(),
    occurredAt: getCurrentIsoDateTime_(),
    actorEmail: String(actorEmail || ''),
    actionType: String(actionType || ''),
    targetType: String(targetType || ''),
    targetId: String(targetId || ''),
    beforeValue: beforeValue == null ? '' : String(beforeValue),
    afterValue: afterValue == null ? '' : String(afterValue),
    reason: reason == null ? '' : String(reason)
  });
}
''')

# Task 2: Ledger lifecycle
write('src/000_server/060_accounting/060_common/accounting_query_service.gs', r'''/** Accounting 화면용 read-only 조합과 DTO 변환 */

function getLedgerEntries_() {
  var evidenceByTransaction = groupBy_(findAllLedgerEvidenceRows_(), 'transactionId');
  var eventsById = findAllAccountingEventRows_().reduce(function (index, event) {
    index[event.id] = event;
    return index;
  }, {});

  return findAllLedgerRows_().filter(function (item) {
    return String(item.recordStatus || 'ACTIVE') !== 'DELETED';
  }).map(function (item) {
    var dto = getLedgerEntryDto_(item);
    dto.event_name = eventsById[item.eventId] ? eventsById[item.eventId].name : '해당없음';
    dto.evidence = (evidenceByTransaction[item.id] || []).map(getEvidenceDto_);
    dto.has_evidence = dto.evidence.length > 0;
    return dto;
  }).sort(function (a, b) {
    return String(b.transaction_date).localeCompare(String(a.transaction_date));
  });
}

function getLedgerEntryDto_(item) {
  var recordStatus = item.recordStatus || 'ACTIVE';
  return {
    transaction_id: item.id,
    transaction_type: isTruthyValue_(item.expense) ? '지출' : '수입',
    transaction_date: formatDateTimeValue_(item.transactionAt),
    department_id: '',
    department_name: '',
    amount: Number(item.amount || 0),
    balance_after: Number(item.balanceAfter || 0),
    counterparty: item.counterparty || '',
    event_id: item.eventId || '',
    description: item.description || '',
    note: '',
    manager: item.managerId || '',
    status: recordStatus === 'DRAFT' ? '임시저장' : (item.matchStatus || '미확인'),
    match_status: item.matchStatus || '미확인',
    record_status: recordStatus,
    has_evidence: false,
    evidence: [],
    alert: '',
    created_at: formatDateTimeValue_(item.createdAt),
    updated_at: formatDateTimeValue_(item.updatedAt),
    is_deleted: recordStatus === 'DELETED'
  };
}

function getEvidenceDto_(item) {
  return {
    evidence_id: item.id,
    transaction_id: item.transactionId,
    file_name: item.fileName,
    file_id: item.driveFileId,
    file_path: item.driveFileId ? 'https://drive.google.com/open?id=' + item.driveFileId : '',
    created_at: formatDateTimeValue_(item.createdAt),
    updated_at: formatDateTimeValue_(item.createdAt),
    is_deleted: false
  };
}

function filterLedgerEntries_(items, filter) {
  var normalized = normalizeFilter_(filter || {});
  var keyword = String(normalized.keyword).toLowerCase();
  return items.filter(function (item) {
    if (keyword && [item.counterparty, item.description, item.manager].join(' ').toLowerCase().indexOf(keyword) < 0) return false;
    if (normalized.transaction_type !== '전체' && item.transaction_type !== normalized.transaction_type) return false;
    if (normalized.event_name !== '전체' && item.event_name !== normalized.event_name) return false;
    if (normalized.status !== '전체' && item.status !== normalized.status) return false;
    return true;
  });
}

function normalizeFilter_(filter) {
  return {
    keyword: filter.keyword || '',
    transaction_type: filter.transaction_type || filter.type || '전체',
    event_name: filter.event_name || filter.event || '전체',
    status: filter.status || '전체'
  };
}

function groupBy_(items, key) {
  return items.reduce(function (group, item) {
    var value = item[key];
    if (!group[value]) group[value] = [];
    group[value].push(item);
    return group;
  }, {});
}

function findLedgerEntryDtoById_(transactionId) {
  return getLedgerEntries_().filter(function (item) {
    return String(item.transaction_id) === String(transactionId);
  })[0] || null;
}

function getLedgerDatabaseInfo_() {
  var spreadsheet = openOperationSpreadsheet_();
  var table = getOperationDbTableSchema_('ledger');
  requireOperationTableSheet_('ledger');
  var sheet = spreadsheet.getSheetByName(table.sheetName);
  return {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    spreadsheetUrl: spreadsheet.getUrl(),
    transactionRowCount: sheet ? Math.max(0, sheet.getLastRow() - 1) : 0
  };
}

function getLedgerEventOptions_() {
  var items = getLedgerEntries_().filter(function (item) { return item.record_status === 'ACTIVE'; });
  return findAllAccountingEventRows_().map(function (event) {
    var balance = items.reduce(function (sum, item) {
      if (String(item.event_id) !== String(event.id)) return sum;
      return sum + (item.transaction_type === '수입' ? Number(item.amount) : -Number(item.amount));
    }, 0);
    return { event_id: event.id, event_name: event.name, balance: balance };
  });
}

function isActiveLedgerEntry_(item) {
  return item && String(item.record_status || item.recordStatus || 'ACTIVE') !== 'DELETED';
}

function isSettlementEligibleLedgerEntry_(item) {
  var recordStatus = String(item.record_status || item.recordStatus || 'ACTIVE');
  var status = item.match_status || item.matchStatus || item.status;
  return isActiveLedgerEntry_(item) && recordStatus !== 'DRAFT' && status === '정상';
}

function getLedgerSummary_(filter) {
  var items = filterLedgerEntries_(getLedgerEntries_(), filter || {});
  var active = items.filter(function (item) { return item.record_status === 'ACTIVE'; });
  return {
    totalIncome: active.reduce(function (sum, item) { return sum + (item.transaction_type === '수입' ? Number(item.amount || 0) : 0); }, 0),
    totalExpense: active.reduce(function (sum, item) { return sum + (item.transaction_type === '지출' ? Number(item.amount || 0) : 0); }, 0),
    pendingCount: active.filter(function (item) { return item.status === '미확인'; }).length,
    reviewCount: active.filter(function (item) { return item.status === '확인필요'; }).length,
    draftCount: items.filter(function (item) { return item.record_status === 'DRAFT'; }).length
  };
}
''')

write('src/000_server/060_accounting/061_ledger/ledger_sheet_dao.gs', r'''/** 수입지출원장 Sheet DAO */

function findAllLedgerRows_() {
  return readOperationTableRows_('ledger');
}

function findLedgerRowById_(id) {
  return findOperationTableRowById_('ledger', id);
}

function insertLedgerRow_(row) {
  return appendOperationTableRow_('ledger', row);
}

function updateLedgerRowById_(id, changes) {
  return updateOperationTableRow_('ledger', id, changes);
}
''')

write('src/000_server/060_accounting/061_ledger/ledger_service.gs', r'''/** 수입지출원장 mutation/business service */

function saveLedgerEntry_(request, context, recordStatus) {
  request = request || {};
  var now = getCurrentIsoDateTime_();
  var actor = getAccountingActorEmail_(context);
  var item = {
    id: request.transaction_id || makeId_('TRX'),
    transactionAt: request.transaction_date || now,
    description: request.description || '',
    expense: request.transaction_type === '지출',
    amount: Number(request.amount || 0),
    balanceAfter: Number(request.balance_after || 0),
    counterparty: request.counterparty || '',
    source: request.source || '수기등록',
    eventId: request.event_id || '',
    businessType: request.business_type || '일반',
    businessId: request.business_id || '',
    matchStatus: request.match_status || '미확인',
    recordStatus: recordStatus || 'ACTIVE',
    managerId: actor,
    createdAt: now,
    updatedAt: now
  };
  insertLedgerRow_(item);
  var evidence = saveEvidenceFiles_(item.id, request.evidence_files || request.evidence || [], now);
  writeAccountingAudit_(actor, 'CREATE', 'LEDGER', item.id, '', JSON.stringify(item), item.recordStatus === 'DRAFT' ? '임시저장' : '원장 등록');
  return { ok: true, evidence: evidence, item: getLedgerEntryDto_(item) };
}

function saveLedgerDraft_(request, context) {
  return saveLedgerEntry_(request || {}, context, 'DRAFT');
}

function updateLedgerEntry_(input, context) {
  input = input || {};
  if (!input.transaction_id) throw new Error('transaction_id is required.');
  var before = findLedgerRowById_(input.transaction_id);
  if (!before || String(before.recordStatus || 'ACTIVE') === 'DELETED') throw new Error('원장 거래를 찾을 수 없습니다.');
  var now = getCurrentIsoDateTime_();
  var changes = {
    transactionAt: input.transaction_date || before.transactionAt,
    description: input.description == null ? before.description : input.description,
    expense: input.transaction_type ? input.transaction_type === '지출' : isTruthyValue_(before.expense),
    amount: input.amount == null ? Number(before.amount || 0) : Number(input.amount || 0),
    balanceAfter: input.balance_after == null ? Number(before.balanceAfter || 0) : Number(input.balance_after || 0),
    counterparty: input.counterparty == null ? before.counterparty : input.counterparty,
    eventId: input.event_id == null ? before.eventId : input.event_id,
    businessType: input.business_type == null ? before.businessType : input.business_type,
    businessId: input.business_id == null ? before.businessId : input.business_id,
    matchStatus: input.match_status == null ? before.matchStatus : input.match_status,
    recordStatus: input.record_status || before.recordStatus || 'ACTIVE',
    updatedAt: now
  };
  updateLedgerRowById_(input.transaction_id, changes);
  var actor = getAccountingActorEmail_(context);
  writeAccountingAudit_(actor, 'UPDATE', 'LEDGER', input.transaction_id, JSON.stringify(before), JSON.stringify(changes), input.reason || '원장 수정');
  return { ok: true, item: findLedgerEntryDtoById_(input.transaction_id) || getLedgerEntryDto_(Object.assign({}, before, changes)) };
}

function softDeleteLedgerEntry_(input, context) {
  input = input || {};
  if (!input.transaction_id) throw new Error('transaction_id is required.');
  var before = findLedgerRowById_(input.transaction_id);
  if (!before) throw new Error('원장 거래를 찾을 수 없습니다.');
  var changes = { recordStatus: 'DELETED', updatedAt: getCurrentIsoDateTime_() };
  updateLedgerRowById_(input.transaction_id, changes);
  var actor = getAccountingActorEmail_(context);
  writeAccountingAudit_(actor, 'DELETE', 'LEDGER', input.transaction_id, JSON.stringify(before), JSON.stringify(changes), input.reason || '원장 soft delete');
  return { ok: true, transaction_id: input.transaction_id };
}

function processLedgerEntry_(input, context) {
  input = input || {};
  if (!input.transaction_id) throw new Error('transaction_id is required.');
  var before = findLedgerRowById_(input.transaction_id);
  if (!before || String(before.recordStatus || 'ACTIVE') === 'DELETED') throw new Error('원장 거래를 찾을 수 없습니다.');
  var status = input.action === 'approve' ? '정상' : '확인필요';
  var changes = { matchStatus: status, recordStatus: before.recordStatus || 'ACTIVE', updatedAt: getCurrentIsoDateTime_() };
  updateLedgerRowById_(input.transaction_id, changes);
  writeAccountingAudit_(getAccountingActorEmail_(context), 'PROCESS', 'LEDGER', input.transaction_id, JSON.stringify(before), JSON.stringify(changes), input.reason || status);
  return { ok: true, transaction_id: input.transaction_id, status: status, item: findLedgerEntryDtoById_(input.transaction_id) };
}
''')

write('src/000_server/060_accounting/061_ledger/ledger_api.gs', r'''/** 수입지출원장 public API */

function api_getLedgerDatabaseInfo() {
  return apiHandler_({ operation: 'getLedgerDatabaseInfo', requireLogin: true, service: function () { return getLedgerDatabaseInfo_(); } });
}

function api_getLedgerList(filter) {
  return apiHandler_({
    operation: 'getLedgerList', input: filter, requireLogin: true,
    service: function (request) {
      var items = filterLedgerEntries_(getLedgerEntries_(), request || {});
      return { items: items, page: { pageNo: 1, pageSize: items.length, totalCount: items.length } };
    }
  });
}

function api_getLedgerSummary(filter) {
  return apiHandler_({ operation: 'getLedgerSummary', input: filter, requireLogin: true, service: function (request) { return getLedgerSummary_(request || {}); } });
}

function api_getLedgerDetail(transactionId) {
  return apiHandler_({ operation: 'getLedgerDetail', input: transactionId, requireLogin: true, service: function (id) { return findLedgerEntryDtoById_(id); } });
}

function api_getLedgerEventOptions() {
  return apiHandler_({ operation: 'getLedgerEventOptions', requireLogin: true, service: function () { return getLedgerEventOptions_(); } });
}

function api_createLedgerEntry(request) {
  return apiHandler_({ operation: 'createLedgerEntry', input: request, requireLogin: true, service: function (input, context) { return saveLedgerEntry_(input || {}, context, 'ACTIVE'); } });
}

function api_saveLedgerDraft(request) {
  return apiHandler_({ operation: 'saveLedgerDraft', input: request, requireLogin: true, service: function (input, context) { return saveLedgerDraft_(input || {}, context); } });
}

function api_updateLedgerEntry(request) {
  return apiHandler_({ operation: 'updateLedgerEntry', input: request, requireLogin: true, service: function (input, context) { return updateLedgerEntry_(input || {}, context); } });
}

function api_deleteLedgerEntry(request) {
  return apiHandler_({ operation: 'deleteLedgerEntry', input: request, requireLogin: true, service: function (input, context) { return softDeleteLedgerEntry_(input || {}, context); } });
}

function api_processLedgerEntry(request) {
  return apiHandler_({ operation: 'processLedgerEntry', input: request, requireLogin: true, service: function (input, context) { return processLedgerEntry_(input || {}, context); } });
}
''')

# Task 3: Evidence audit
write('src/000_server/060_accounting/062_evidence/evidence_api.gs', r'''/** 거래증빙 public API */

function api_getEvidenceFileContent(request) {
  return apiHandler_({ operation: 'getEvidenceFileContent', input: request, requireLogin: true, service: function (input) { return getEvidenceFileContent_(input || {}); } });
}

function api_getEvidenceAuditList(filter) {
  return apiHandler_({ operation: 'getEvidenceAuditList', input: filter, requireLogin: true, service: function (input) { return getEvidenceAuditList_(input || {}); } });
}
''')

existing_evidence_service = read('src/000_server/060_accounting/062_evidence/evidence_service.gs').rstrip() + '\n\n' + r'''function getEvidenceAuditList_(filter) {
  filter = filter || {};
  var ledgerById = getLedgerEntries_().reduce(function (index, item) {
    index[item.transaction_id] = item;
    return index;
  }, {});
  var keyword = String(filter.keyword || '').trim().toLowerCase();
  var items = findAllLedgerEvidenceRows_().map(function (evidence) {
    var ledger = ledgerById[evidence.transactionId];
    if (!ledger) return null;
    return {
      evidence_id: evidence.id,
      transaction_id: evidence.transactionId,
      transaction_date: String(ledger.transaction_date || '').slice(0, 10),
      transaction_type: ledger.transaction_type,
      amount: Number(ledger.amount || 0),
      file_name: evidence.fileName || '',
      file_id: evidence.driveFileId || '',
      category: evidence.category || '',
      type: evidence.type || '',
      created_at: formatDateTimeValue_(evidence.createdAt)
    };
  }).filter(Boolean).filter(function (item) {
    if (filter.startDate && item.transaction_date < filter.startDate) return false;
    if (filter.endDate && item.transaction_date > filter.endDate) return false;
    if (filter.transaction_type && filter.transaction_type !== '전체' && item.transaction_type !== filter.transaction_type) return false;
    if (keyword && [item.file_name, item.transaction_id, item.category, item.type].join(' ').toLowerCase().indexOf(keyword) < 0) return false;
    return true;
  });
  return { items: items, totalCount: items.length };
}
'''
write('src/000_server/060_accounting/062_evidence/evidence_service.gs', existing_evidence_service)

# Task 4-5: Reconciliation feature
write('src/000_server/060_accounting/063_reconciliation/bank_transaction_sheet_dao.gs', r'''/** 계좌거래 Sheet DAO */
function findAllBankTransactionRows_() { return readOperationTableRows_('bankTransactions'); }
function findBankTransactionRowById_(id) { return findOperationTableRowById_('bankTransactions', id); }
function insertBankTransactionRow_(row) { return appendOperationTableRow_('bankTransactions', row); }
''')

write('src/000_server/060_accounting/063_reconciliation/bank_ocr_sheet_dao.gs', r'''/** 계좌 OCR 로그 Sheet DAO */
function findAllBankOcrLogRows_() { return readOperationTableRows_('bankOcrLogs'); }
function insertBankOcrLogRow_(row) { return appendOperationTableRow_('bankOcrLogs', row); }
''')

write('src/000_server/060_accounting/063_reconciliation/bank_ocr_file_service.gs', r'''/** 계좌 파일 OCR Drive service */

function normalizeBankUploadFile_(file) {
  file = file || {};
  return {
    file_name: String(file.file_name || file.name || '').trim(),
    file_type: String(file.file_type || file.mime_type || '').trim().toLowerCase(),
    file_size: Number(file.file_size || 0),
    content_base64: String(file.content_base64 || file.data || '').replace(/^data:[^,]+,/, '')
  };
}

function validateBankOcrFile_(file) {
  if (!file.file_name) throw new Error('파일명이 없습니다.');
  if (!file.content_base64) throw new Error('파일 내용이 없습니다.');
  var allowed = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp', 'application/pdf'];
  if (allowed.indexOf(file.file_type) < 0) throw new Error('OCR은 이미지 또는 PDF 파일만 지원합니다.');
}

function extractBankOcrText_(file) {
  var bytes = Utilities.base64Decode(file.content_base64);
  var blob = Utilities.newBlob(bytes, file.file_type, file.file_name);
  var documentId = '';
  try {
    var created = Drive.Files.create({ name: 'OCR_' + file.file_name, mimeType: 'application/vnd.google-apps.document' }, blob, { ocrLanguage: 'ko', fields: 'id' });
    documentId = created.id;
    return DocumentApp.openById(documentId).getBody().getText() || '';
  } finally {
    if (documentId) {
      try { Drive.Files.remove(documentId); }
      catch (removeError) {
        try { DriveApp.getFileById(documentId).setTrashed(true); } catch (trashError) {}
      }
    }
  }
}
''')

write('src/000_server/060_accounting/063_reconciliation/bank_transaction_parser.gs', r'''/** OCR 텍스트에서 계좌 수입/지출 거래를 추출하는 pure parser */

function parseBankOcrTransactions_(ocrText, fileName, baseYear) {
  var lines = String(ocrText || '').replace(/\r/g, '\n').split(/\n+/).map(function (line) {
    return line.replace(/[\u00a0\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  }).filter(Boolean);
  var blocks = buildBankTransactionBlocks_(lines);
  var items = [];
  var reviewRequiredItems = [];
  blocks.forEach(function (block, index) {
    var parsed = parseBankTransactionBlock_(block, baseYear);
    if (parsed.reviewReason) {
      reviewRequiredItems.push({ sourceFileName: fileName, sourceIndex: index, reason: parsed.reviewReason });
      return;
    }
    items.push({
      transactionAt: parsed.transactionAt,
      expense: parsed.expense,
      counterparty: parsed.counterparty,
      description: parsed.description,
      amount: parsed.amount,
      sourceFileName: fileName
    });
  });
  return { items: items, reviewRequiredItems: reviewRequiredItems, extractedCount: blocks.length };
}

function buildBankTransactionBlocks_(lines) {
  var blocks = [], current = [];
  lines.forEach(function (line) {
    if (containsBankDate_(line)) {
      if (current.length) blocks.push(current);
      current = [line];
    } else if (current.length && current.length < 10) {
      current.push(line);
    }
  });
  if (current.length) blocks.push(current);
  return blocks;
}

function parseBankTransactionBlock_(block, baseYear) {
  var text = block.join('\n');
  var transactionAt = extractBankDate_(text, baseYear);
  if (!transactionAt) return { reviewReason: '거래일을 확인할 수 없습니다.' };
  var expenseMatch = text.match(/(?:출금(?:액)?|지출|이체출금|자동이체|카드\s*결제|체크\s*카드|송금|ATM\s*출금)\s*[:：]?\s*-?\s*(?:₩|￦)?\s*([\d,]+)\s*원?/i);
  var incomeMatch = text.match(/(?:입금(?:액)?|수입|이체입금|급여|환급)\s*[:：]?\s*\+?\s*(?:₩|￦)?\s*([\d,]+)\s*원?/i);
  if (expenseMatch && incomeMatch) return { reviewReason: '입금과 출금 방향이 동시에 인식되었습니다.' };
  if (!expenseMatch && !incomeMatch) return { reviewReason: '입금과 출금 중 어느 거래인지 확인할 수 없습니다.' };
  var amount = bankAmountNumber_((expenseMatch || incomeMatch)[1]);
  if (!amount) return { reviewReason: '거래금액을 확인할 수 없습니다.' };
  var counterparty = extractBankCounterparty_(block);
  if (!counterparty) return { reviewReason: '거래상대명을 확인할 수 없습니다.' };
  return {
    transactionAt: transactionAt,
    expense: Boolean(expenseMatch),
    amount: amount,
    counterparty: counterparty,
    description: extractBankDescription_(text)
  };
}

function containsBankDate_(value) {
  return /(?:20\d{2}[.\/-]\s*\d{1,2}[.\/-]\s*\d{1,2}|20\d{2}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일|(?:^|\s)\d{1,2}[.\/-]\s*\d{1,2}(?:\s|$)|\d{1,2}\s*월\s*\d{1,2}\s*일)/.test(String(value || ''));
}

function extractBankDate_(value, baseYear) {
  var text = String(value || '');
  var match = text.match(/(20\d{2})\s*(?:[.\/-]|년)\s*(\d{1,2})\s*(?:[.\/-]|월)\s*(\d{1,2})(?:\s*일)?/);
  var year, month, day;
  if (match) {
    year = Number(match[1]); month = Number(match[2]); day = Number(match[3]);
  } else {
    match = text.match(/(?:^|\s)(\d{1,2})\s*(?:[.\/-]|월)\s*(\d{1,2})(?:\s*일)?(?:\s|$)/);
    if (!match) return '';
    year = Number(baseYear) || new Date().getFullYear(); month = Number(match[1]); day = Number(match[2]);
  }
  var date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

function bankAmountNumber_(value) { return Number(String(value || '').replace(/[^0-9]/g, '')) || 0; }

function extractBankCounterparty_(block) {
  var ignored = /(?:20\d{2}|출금|입금|지출|수입|이체|카드|송금|ATM|적요|거래\s*내용|내용|잔액|원$)/i;
  for (var i = 1; i < block.length; i += 1) {
    var line = String(block[i] || '').trim();
    if (!line || ignored.test(line)) continue;
    if (/^[\d,]+\s*원?$/.test(line)) continue;
    return line.slice(0, 120);
  }
  return '';
}

function extractBankDescription_(text) {
  var match = String(text || '').match(/(?:거래\s*내용|적요|내용)\s*[:：]?\s*([^\n]+)/i);
  return match ? String(match[1] || '').trim().slice(0, 200) : '';
}
''')

write('src/000_server/060_accounting/063_reconciliation/bank_ocr_service.gs', r'''/** 계좌 거래 OCR 수집 orchestration */

function bankTransactionDuplicateKey_(item) {
  return [
    String(item.sourceFileName || '').trim().toLowerCase(),
    String(item.transactionAt || '').slice(0, 10),
    isTruthyValue_(item.expense) ? 'E' : 'I',
    Number(item.amount || 0),
    normalizeReconciliationText_([item.counterparty, item.description].join(' '))
  ].join('|');
}

function saveParsedBankTransactions_(items) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var existing = findAllBankTransactionRows_();
    var keys = existing.reduce(function (index, row) { index[bankTransactionDuplicateKey_(row)] = true; return index; }, {});
    var saved = [], duplicates = [];
    (items || []).forEach(function (item) {
      var key = bankTransactionDuplicateKey_(item);
      if (keys[key]) { duplicates.push(item); return; }
      var row = {
        id: makeId_('BNK'), transactionAt: item.transactionAt, expense: Boolean(item.expense),
        counterparty: item.counterparty || '', description: item.description || '', amount: Math.abs(Number(item.amount || 0)),
        sourceFileName: item.sourceFileName || '', createdAt: getCurrentIsoDateTime_()
      };
      insertBankTransactionRow_(row); keys[key] = true; saved.push(row);
    });
    return { savedItems: saved, duplicateItems: duplicates };
  } finally { lock.releaseLock(); }
}

function uploadBankTransactions_(request, context) {
  request = request || {};
  var files = request.files || (request.file ? [request.file] : []);
  if (!files.length) throw new Error('업로드할 계좌 파일이 없습니다.');
  var parsedItems = [], reviewRequired = [], failures = [], processed = 0, extracted = 0;
  files.forEach(function (rawFile) {
    var file = normalizeBankUploadFile_(rawFile);
    var status = '실패', errorMessage = '', parsed = { items: [], reviewRequiredItems: [], extractedCount: 0 };
    try {
      validateBankOcrFile_(file);
      var text = extractBankOcrText_(file);
      if (!String(text || '').trim()) throw new Error('OCR 텍스트를 추출할 수 없습니다.');
      parsed = parseBankOcrTransactions_(text, file.file_name, request.baseYear || request.base_year);
      parsedItems = parsedItems.concat(parsed.items);
      reviewRequired = reviewRequired.concat(parsed.reviewRequiredItems);
      extracted += parsed.extractedCount;
      processed += 1;
      status = parsed.reviewRequiredItems.length ? '확인필요' : '성공';
    } catch (error) {
      errorMessage = error && error.message ? error.message : String(error);
      failures.push({ file_name: file.file_name, reason: errorMessage });
    }
    insertBankOcrLogRow_({ id: makeId_('OCR'), fileName: file.file_name, status: status, extractedCount: parsed.extractedCount || 0, errorMessage: errorMessage, createdAt: getCurrentIsoDateTime_() });
  });
  var saveResult = saveParsedBankTransactions_(parsedItems);
  var previewItems = typeof buildReconciliationResults_ === 'function'
    ? buildReconciliationResults_(saveResult.savedItems, getReconciliationLedgerCandidates_({}))
    : [];
  writeAccountingAudit_(getAccountingActorEmail_(context), 'OCR_UPLOAD', 'BANK_TRANSACTION', 'BATCH', '', JSON.stringify({ savedCount: saveResult.savedItems.length, duplicateCount: saveResult.duplicateItems.length }), '계좌 거래 OCR 업로드');
  return {
    uploadedFileCount: files.length, processedFileCount: processed, failedFileCount: failures.length,
    extractedCount: extracted, savedCount: saveResult.savedItems.length, duplicateCount: saveResult.duplicateItems.length,
    reviewRequiredItems: reviewRequired, failedFiles: failures, previewItems: previewItems
  };
}

function getBankOcrLogs_(request) {
  var limit = Math.min(50, Math.max(1, Number((request || {}).limit || 10)));
  var rows = findAllBankOcrLogRows_().slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
  return { items: rows.slice(0, limit).map(function (row) { return { id: row.id, fileName: row.fileName, status: row.status, extractedCount: Number(row.extractedCount || 0), errorMessage: row.errorMessage || '', createdAt: formatDateTimeValue_(row.createdAt) }; }) };
}
''')

write('src/000_server/060_accounting/063_reconciliation/reconciliation_sheet_dao.gs', r'''/** 감사대사 헤더/상세 Sheet DAO */
function findAllReconciliationRows_() { return readOperationTableRows_('reconciliation'); }
function findReconciliationRowById_(id) { return findOperationTableRowById_('reconciliation', id); }
function insertReconciliationRow_(row) { return appendOperationTableRow_('reconciliation', row); }
function updateReconciliationRowById_(id, changes) { return updateOperationTableRow_('reconciliation', id, changes); }
function findAllReconciliationItemRows_() { return readOperationTableRows_('reconciliationItems'); }
function findReconciliationItemRowById_(id) { return findOperationTableRowById_('reconciliationItems', id); }
function insertReconciliationItemRow_(row) { return appendOperationTableRow_('reconciliationItems', row); }
function updateReconciliationItemRowById_(id, changes) { return updateOperationTableRow_('reconciliationItems', id, changes); }
''')

write('src/000_server/060_accounting/063_reconciliation/reconciliation_query_service.gs', r'''/** 계좌-원장 대조 read-only query/matching */

function normalizeReconciliationText_(value) {
  var stopWords = ['주식회사', '유한회사', '체크카드', '신용카드', '카드', '출금', '결제', '이체', '송금', '입금', '승인', '취소', '페이', '원'];
  var text = String(value || '').toLowerCase().replace(/\(주\)|㈜/g, ' ').replace(/[^0-9a-z가-힣]+/g, ' ');
  stopWords.forEach(function (word) { text = text.replace(new RegExp('(^|\\s)' + word + '(?=\\s|$)', 'g'), ' '); });
  return text.replace(/\s+/g, ' ').trim();
}

function reconciliationTokens_(value) { return normalizeReconciliationText_(value).split(' ').filter(function (token) { return token.length >= 2; }); }

function reconciliationDateDifference_(left, right) {
  var a = String(left || '').slice(0, 10).split('-').map(Number), b = String(right || '').slice(0, 10).split('-').map(Number);
  if (a.length !== 3 || b.length !== 3 || a.some(isNaN) || b.some(isNaN)) return 999;
  return Math.abs(Math.round((Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(b[0], b[1] - 1, b[2])) / 86400000));
}

function scoreReconciliationCandidate_(bank, ledger) {
  var bankExpense = isTruthyValue_(bank.expense);
  var ledgerExpense = ledger.transaction_type ? ledger.transaction_type === '지출' : isTruthyValue_(ledger.expense);
  if (bankExpense !== ledgerExpense) return null;
  if (Math.abs(Number(bank.amount || 0)) !== Math.abs(Number(ledger.amount || 0))) return null;
  var ledgerDate = ledger.transaction_date || ledger.transactionAt;
  var dateDifference = reconciliationDateDifference_(bank.transactionAt, ledgerDate);
  if (dateDifference > 1) return null;
  var score = dateDifference === 0 ? 40 : 25;
  var bankCounterparty = normalizeReconciliationText_(bank.counterparty), ledgerCounterparty = normalizeReconciliationText_(ledger.counterparty);
  var exact = bankCounterparty.length >= 2 && bankCounterparty === ledgerCounterparty;
  var includes = !exact && bankCounterparty.length >= 2 && ledgerCounterparty.length >= 2 && (bankCounterparty.indexOf(ledgerCounterparty) > -1 || ledgerCounterparty.indexOf(bankCounterparty) > -1);
  if (exact) score += 40; else if (includes) score += 30;
  var bankTokens = reconciliationTokens_([bank.counterparty, bank.description].join(' '));
  var ledgerTokens = reconciliationTokens_([ledger.counterparty, ledger.description].join(' '));
  var common = bankTokens.filter(function (token) { return ledgerTokens.indexOf(token) > -1; });
  if (common.length) score += 15;
  return {
    ledgerId: ledger.transaction_id || ledger.id, transactionAt: ledgerDate, expense: ledgerExpense,
    amount: Number(ledger.amount || 0), counterparty: ledger.counterparty || '', description: ledger.description || '',
    score: score, dateDifference: dateDifference, textMatched: exact || includes || common.length > 0,
    matchDetail: exact ? '거래상대명 일치' : includes ? '거래상대명 일부 일치' : common.length ? '적요 공통어 일치' : '문자열 일치 없음'
  };
}

function getReconciliationLedgerCandidates_(filter) {
  filter = filter || {};
  return getLedgerEntries_().filter(function (item) {
    return item.record_status === 'ACTIVE' && inAccountingDateRange_(item.transaction_date, filter.startDate, filter.endDate);
  });
}

function getCandidateScoresForBank_(bank, ledgers) {
  return (ledgers || []).map(function (ledger) { return scoreReconciliationCandidate_(bank, ledger); }).filter(Boolean).sort(function (a, b) {
    return b.score - a.score || a.dateDifference - b.dateDifference || String(a.ledgerId).localeCompare(String(b.ledgerId));
  });
}

function buildReconciliationResults_(banks, ledgers) {
  var claimed = {};
  var results = (banks || []).map(function (bank) {
    var candidates = getCandidateScoresForBank_(bank, ledgers);
    if (!candidates.length) return { bankTransactionId: bank.id || '', status: '원장누락의심', ledgerId: '', differenceAmount: Number(bank.amount || 0), matchMethod: '', note: '동일 방향·금액·거래일 조건의 원장 후보가 없습니다.', candidates: [] };
    var best = candidates[0], unique = candidates.length === 1 || best.score > candidates[1].score;
    if (!best.textMatched || !unique) return { bankTransactionId: bank.id || '', status: '확인필요', ledgerId: '', differenceAmount: 0, matchMethod: '', note: !best.textMatched ? '금액과 날짜는 일치하지만 거래상대/적요 확인이 필요합니다.' : '동점 후보가 여러 개입니다.', candidates: candidates.slice(0, 5) };
    return { bankTransactionId: bank.id || '', status: '정상', ledgerId: best.ledgerId, differenceAmount: Math.abs(Number(bank.amount || 0) - Number(best.amount || 0)), matchMethod: 'auto', note: '자동 대조 조건이 충족되었습니다.', candidates: candidates.slice(0, 5) };
  });
  results.forEach(function (result) {
    if (result.status !== '정상') return;
    if (!claimed[result.ledgerId]) claimed[result.ledgerId] = [];
    claimed[result.ledgerId].push(result);
  });
  Object.keys(claimed).forEach(function (ledgerId) {
    if (claimed[ledgerId].length < 2) return;
    claimed[ledgerId].forEach(function (result) { result.status = '확인필요'; result.ledgerId = ''; result.matchMethod = ''; result.note = '여러 계좌 거래가 같은 원장을 최우선 후보로 선택했습니다.'; });
  });
  return results;
}

function getReconciliationList_(filter) {
  filter = filter || {};
  var items = findAllReconciliationRows_().filter(function (row) {
    if (filter.startDate && String(row.auditEndDate || '') < filter.startDate) return false;
    if (filter.endDate && String(row.auditStartDate || '') > filter.endDate) return false;
    return true;
  }).sort(function (a, b) { return String(b.confirmedAt || '').localeCompare(String(a.confirmedAt || '')); });
  return { items: items, totalCount: items.length };
}

function getReconciliationDetail_(reconciliationId) {
  var header = findReconciliationRowById_(reconciliationId);
  if (!header) return null;
  var bankById = findAllBankTransactionRows_().reduce(function (index, row) { index[row.id] = row; return index; }, {});
  var ledgerById = getLedgerEntries_().reduce(function (index, row) { index[row.transaction_id] = row; return index; }, {});
  var items = findAllReconciliationItemRows_().filter(function (row) { return String(row.reconciliationId) === String(reconciliationId); }).map(function (row) {
    return { id: row.id, reconciliationId: row.reconciliationId, bankTransactionId: row.bankTransactionId, ledgerId: row.ledgerId || '', status: row.status, differenceAmount: Number(row.differenceAmount || 0), matchMethod: row.matchMethod || '', note: row.note || '', createdAt: formatDateTimeValue_(row.createdAt), updatedAt: formatDateTimeValue_(row.updatedAt), bank: bankById[row.bankTransactionId] || null, ledger: row.ledgerId ? (ledgerById[row.ledgerId] || null) : null };
  });
  return { header: header, items: items };
}

function getReconciliationCandidates_(request) {
  request = request || {};
  var item = request.reconciliationItemId ? findReconciliationItemRowById_(request.reconciliationItemId) : null;
  var bank = item ? findBankTransactionRowById_(item.bankTransactionId) : (request.bankTransactionId ? findBankTransactionRowById_(request.bankTransactionId) : null);
  if (!bank) throw new Error('계좌 거래를 찾을 수 없습니다.');
  return { items: getCandidateScoresForBank_(bank, getReconciliationLedgerCandidates_({ startDate: request.startDate, endDate: request.endDate })).slice(0, 10) };
}
''')

write('src/000_server/060_accounting/063_reconciliation/reconciliation_service.gs', r'''/** 감사대사 mutation/business service */

function runReconciliation_(request, context) {
  request = request || {};
  if (!request.startDate || !request.endDate) throw new Error('startDate와 endDate가 필요합니다.');
  if (request.startDate > request.endDate) throw new Error('감사 시작일이 종료일보다 늦을 수 없습니다.');
  var banks = findAllBankTransactionRows_().filter(function (row) { return inAccountingDateRange_(row.transactionAt, request.startDate, request.endDate); });
  var ledgers = getReconciliationLedgerCandidates_({ startDate: request.startDate, endDate: request.endDate });
  var results = buildReconciliationResults_(banks, ledgers);
  var claimed = {};
  results.forEach(function (item) { if (item.status === '정상' && item.ledgerId) claimed[item.ledgerId] = true; });
  var evidenceByTransaction = groupBy_(findAllLedgerEvidenceRows_(), 'transactionId');
  var now = getCurrentIsoDateTime_();
  var id = makeId_('REC');
  var header = {
    id: id, auditStartDate: request.startDate, auditEndDate: request.endDate,
    accountOpeningBalance: '', ledgerOpeningBalance: '', accountClosingBalance: '', ledgerClosingBalance: '',
    accountTransactionCount: banks.length, ledgerTransactionCount: ledgers.length,
    missingCount: results.filter(function (item) { return item.status === '원장누락의심'; }).length,
    excessCount: ledgers.filter(function (item) { return !claimed[item.transaction_id]; }).length,
    mismatchCount: results.filter(function (item) { return item.status === '확인필요'; }).length,
    missingEvidenceCount: results.filter(function (item) { return item.status === '정상' && item.ledgerId && !(evidenceByTransaction[item.ledgerId] || []).length; }).length,
    status: results.some(function (item) { return item.status !== '정상'; }) ? '확인필요' : '정상',
    managerId: getAccountingActorEmail_(context), confirmedAt: now,
    confirmation: '계좌-원장 자동 대사 실행'
  };
  insertReconciliationRow_(header);
  results.forEach(function (result) {
    insertReconciliationItemRow_({ id: makeId_('RCI'), reconciliationId: id, bankTransactionId: result.bankTransactionId, ledgerId: result.ledgerId || '', status: result.status, differenceAmount: Number(result.differenceAmount || 0), matchMethod: result.matchMethod || '', note: result.note || '', createdAt: now, updatedAt: now });
  });
  writeAccountingAudit_(header.managerId, 'RECONCILE', 'RECONCILIATION', id, '', JSON.stringify(header), '공식 감사대사 실행');
  return getReconciliationDetail_(id);
}

function linkReconciliation_(request, context) {
  request = request || {};
  if (!request.reconciliationItemId || !request.ledgerId) throw new Error('대사상세ID와 원장ID가 필요합니다.');
  var item = findReconciliationItemRowById_(request.reconciliationItemId);
  if (!item) throw new Error('대사 상세를 찾을 수 없습니다.');
  var bank = findBankTransactionRowById_(item.bankTransactionId);
  var ledger = findLedgerEntryDtoById_(request.ledgerId);
  if (!bank || !ledger) throw new Error('계좌 거래 또는 원장을 찾을 수 없습니다.');
  if (isTruthyValue_(bank.expense) !== (ledger.transaction_type === '지출')) throw new Error('수입/지출 방향이 일치하지 않습니다.');
  if (Math.abs(Number(bank.amount || 0)) !== Math.abs(Number(ledger.amount || 0))) throw new Error('거래금액이 일치하지 않습니다.');
  var claimed = findAllReconciliationItemRows_().some(function (row) { return String(row.reconciliationId) === String(item.reconciliationId) && String(row.id) !== String(item.id) && row.status === '정상' && String(row.ledgerId || '') === String(request.ledgerId); });
  if (claimed) throw new Error('같은 대사에서 이미 연결된 원장입니다.');
  var changes = { ledgerId: request.ledgerId, status: '정상', differenceAmount: 0, matchMethod: 'manual', note: request.note || '수동 연결', updatedAt: getCurrentIsoDateTime_() };
  updateReconciliationItemRowById_(item.id, changes);
  writeAccountingAudit_(getAccountingActorEmail_(context), 'LINK', 'RECONCILIATION_ITEM', item.id, JSON.stringify(item), JSON.stringify(changes), changes.note);
  return getReconciliationDetail_(item.reconciliationId);
}

function createLedgerFromReconciliation_(request, context) {
  request = request || {};
  var item = findReconciliationItemRowById_(request.reconciliationItemId);
  if (!item) throw new Error('대사 상세를 찾을 수 없습니다.');
  var bank = findBankTransactionRowById_(item.bankTransactionId);
  if (!bank) throw new Error('계좌 거래를 찾을 수 없습니다.');
  var saved = saveLedgerEntry_({
    transaction_type: isTruthyValue_(bank.expense) ? '지출' : '수입',
    transaction_date: String(bank.transactionAt || '').slice(0, 10), amount: Number(bank.amount || 0),
    counterparty: request.counterparty || bank.counterparty || '', description: request.description || bank.description || '',
    event_id: request.event_id || '', source: '계좌대사', match_status: '정상', business_type: '대사생성', business_id: item.id
  }, context, 'ACTIVE');
  var changes = { ledgerId: saved.item.transaction_id, status: '정상', differenceAmount: 0, matchMethod: 'created', note: request.note || '계좌 거래에서 원장 생성 후 연결', updatedAt: getCurrentIsoDateTime_() };
  updateReconciliationItemRowById_(item.id, changes);
  writeAccountingAudit_(getAccountingActorEmail_(context), 'CREATE_AND_LINK', 'RECONCILIATION_ITEM', item.id, JSON.stringify(item), JSON.stringify(changes), changes.note);
  return getReconciliationDetail_(item.reconciliationId);
}
''')

write('src/000_server/060_accounting/063_reconciliation/reconciliation_api.gs', r'''/** 감사대사 public API */
function api_uploadBankTransactions(request) { return apiHandler_({ operation: 'uploadBankTransactions', input: request, requireLogin: true, service: function (input, context) { return uploadBankTransactions_(input || {}, context); } }); }
function api_runReconciliation(request) { return apiHandler_({ operation: 'runReconciliation', input: request, requireLogin: true, service: function (input, context) { return runReconciliation_(input || {}, context); } }); }
function api_getReconciliationList(filter) { return apiHandler_({ operation: 'getReconciliationList', input: filter, requireLogin: true, service: function (input) { return getReconciliationList_(input || {}); } }); }
function api_getReconciliationDetail(reconciliationId) { return apiHandler_({ operation: 'getReconciliationDetail', input: reconciliationId, requireLogin: true, service: function (id) { return getReconciliationDetail_(id); } }); }
function api_getReconciliationCandidates(request) { return apiHandler_({ operation: 'getReconciliationCandidates', input: request, requireLogin: true, service: function (input) { return getReconciliationCandidates_(input || {}); } }); }
function api_linkReconciliation(request) { return apiHandler_({ operation: 'linkReconciliation', input: request, requireLogin: true, service: function (input, context) { return linkReconciliation_(input || {}, context); } }); }
function api_createLedgerFromReconciliation(request) { return apiHandler_({ operation: 'createLedgerFromReconciliation', input: request, requireLogin: true, service: function (input, context) { return createLedgerFromReconciliation_(input || {}, context); } }); }
function api_getBankOcrLogs(request) { return apiHandler_({ operation: 'getBankOcrLogs', input: request, requireLogin: true, service: function (input) { return getBankOcrLogs_(input || {}); } }); }
''')

# Task 6: Settlement
write('src/000_server/060_accounting/064_settlement/settlement_sheet_dao.gs', r'''/** 결산보고서 Sheet DAO */
function findAllSettlementReportRows_() { return readOperationTableRows_('settlementReports'); }
function findSettlementReportRowById_(id) { return findOperationTableRowById_('settlementReports', id); }
function insertSettlementReportRow_(row) { return appendOperationTableRow_('settlementReports', row); }
''')

write('src/000_server/060_accounting/064_settlement/settlement_query_service.gs', r'''/** 전체 결산 read-only query */

function getSettlementEligibleItems_(filter) {
  filter = filter || {};
  return getLedgerEntries_().filter(function (item) {
    return isSettlementEligibleLedgerEntry_(item) && inAccountingDateRange_(item.transaction_date, filter.startDate, filter.endDate);
  });
}

function getSettlementSummary_(filter) {
  var items = getSettlementEligibleItems_(filter || {});
  var ids = items.reduce(function (index, item) { index[item.transaction_id] = true; return index; }, {});
  var evidenceCount = findAllLedgerEvidenceRows_().filter(function (row) { return ids[row.transactionId]; }).length;
  var totalIncome = items.reduce(function (sum, item) { return sum + (item.transaction_type === '수입' ? Number(item.amount || 0) : 0); }, 0);
  var totalExpense = items.reduce(function (sum, item) { return sum + (item.transaction_type === '지출' ? Number(item.amount || 0) : 0); }, 0);
  return { totalIncome: totalIncome, totalExpense: totalExpense, balance: totalIncome - totalExpense, incomeCount: items.filter(function (item) { return item.transaction_type === '수입'; }).length, expenseCount: items.filter(function (item) { return item.transaction_type === '지출'; }).length, evidenceCount: evidenceCount };
}

function getSettlementReportList_(filter) {
  filter = filter || {};
  var items = findAllSettlementReportRows_().filter(function (row) {
    if (filter.startDate && String(row.endDate || '') < filter.startDate) return false;
    if (filter.endDate && String(row.startDate || '') > filter.endDate) return false;
    return true;
  }).sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
  return { items: items, totalCount: items.length };
}

function getSettlementReport_(reportId) { return findSettlementReportRowById_(reportId); }

function exportSettlementReport_(request) {
  request = request || {};
  var report = findSettlementReportRowById_(request.reportId);
  if (!report) throw new Error('결산 보고서를 찾을 수 없습니다.');
  return { fileName: '결산보고서_' + report.startDate + '_' + report.endDate, report: report, ledgerItems: getSettlementEligibleItems_({ startDate: report.startDate, endDate: report.endDate }) };
}
''')

write('src/000_server/060_accounting/064_settlement/settlement_service.gs', r'''/** 전체 결산 snapshot service */
function generateSettlementReport_(request, context) {
  request = request || {};
  if (!request.startDate || !request.endDate) throw new Error('startDate와 endDate가 필요합니다.');
  if (request.startDate > request.endDate) throw new Error('결산 시작일이 종료일보다 늦을 수 없습니다.');
  var summary = getSettlementSummary_({ startDate: request.startDate, endDate: request.endDate });
  var row = { id: makeId_('SET'), startDate: request.startDate, endDate: request.endDate, totalIncome: summary.totalIncome, totalExpense: summary.totalExpense, balance: summary.balance, incomeCount: summary.incomeCount, expenseCount: summary.expenseCount, evidenceCount: summary.evidenceCount, status: '생성완료', managerId: getAccountingActorEmail_(context), createdAt: getCurrentIsoDateTime_() };
  insertSettlementReportRow_(row);
  writeAccountingAudit_(row.managerId, 'SETTLEMENT', 'SETTLEMENT_REPORT', row.id, '', JSON.stringify(row), '전체 결산 스냅샷 생성');
  return row;
}
''')

write('src/000_server/060_accounting/064_settlement/settlement_api.gs', r'''/** 전체 결산 public API */
function api_getSettlementSummary(filter) { return apiHandler_({ operation: 'getSettlementSummary', input: filter, requireLogin: true, service: function (input) { return getSettlementSummary_(input || {}); } }); }
function api_generateSettlementReport(request) { return apiHandler_({ operation: 'generateSettlementReport', input: request, requireLogin: true, service: function (input, context) { return generateSettlementReport_(input || {}, context); } }); }
function api_getSettlementReportList(filter) { return apiHandler_({ operation: 'getSettlementReportList', input: filter, requireLogin: true, service: function (input) { return getSettlementReportList_(input || {}); } }); }
function api_getSettlementReport(reportId) { return apiHandler_({ operation: 'getSettlementReport', input: reportId, requireLogin: true, service: function (id) { return getSettlementReport_(id); } }); }
function api_exportSettlementReport(request) { return apiHandler_({ operation: 'exportSettlementReport', input: request, requireLogin: true, service: function (input) { return exportSettlementReport_(input || {}); } }); }
''')

# Tests: extend VM stubs and add regression cases
path = 'scripts/test-accounting.js'
test_text = read(path)
test_text = test_text.replace(
"    isFinite: isFinite\n  });",
"    isFinite: isFinite,\n    Buffer: Buffer\n  });"
)
test_text = test_text.replace(
"  context.Utilities = {\n    getUuid: function () { return 'uuid-1'; },\n    base64Encode: function (bytes) { return Buffer.from(bytes).toString('base64'); }\n  };",
"  context.Utilities = {\n    getUuid: function () { return 'uuid-1'; },\n    base64Encode: function (bytes) { return Buffer.from(bytes).toString('base64'); },\n    base64Decode: function (value) { return Buffer.from(value || '', 'base64'); },\n    newBlob: function () { return {}; }\n  };\n  context.LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };\n  context.Drive = { Files: { create: function () { return { id: 'ocr-doc' }; }, remove: function () {} } };\n  context.DocumentApp = { openById: function () { return { getBody: function () { return { getText: function () { return ''; } }; } }; } };\n  context.DriveApp = { getFileById: function () { return { setTrashed: function () {} }; } };"
)

test_add = r'''

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
  context.findAllLedgerRows_ = function () { return [
    { id: 'active', transactionAt: '2026-08-01', expense: false, amount: 1000, recordStatus: 'ACTIVE' },
    { id: 'draft', transactionAt: '2026-08-02', expense: true, amount: 500, recordStatus: 'DRAFT' },
    { id: 'deleted', transactionAt: '2026-08-03', expense: true, amount: 999, recordStatus: 'DELETED' }
  ]; };
  context.findAllAccountingEventRows_ = function () { return []; };
  context.findAllLedgerEvidenceRows_ = function () { return []; };
  var items = context.getLedgerEntries_();
  assert.deepStrictEqual(items.map(function (x) { return x.transaction_id; }).sort(), ['active', 'draft']);
  assert.strictEqual(items.filter(function (x) { return x.transaction_id === 'draft'; })[0].status, '임시저장');
}

function testEvidenceAuditQuery_() {
  var context = createContext_();
  context.getLedgerEntries_ = function () { return [{ transaction_id: 'trx-1', transaction_date: '2026-08-01', transaction_type: '지출', amount: 12000 }]; };
  context.findAllLedgerEvidenceRows_ = function () { return [{ id: 'evd-1', transactionId: 'trx-1', fileName: 'receipt.pdf', driveFileId: 'drive-1', createdAt: '2026-08-01' }]; };
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
  context.findAllLedgerEvidenceRows_ = function () { return [{ transactionId: 'i1' }, { transactionId: 'e1' }, { transactionId: 'x1' }]; };
  var summary = context.getSettlementSummary_({ startDate: '2026-08-01', endDate: '2026-08-31' });
  assert.deepStrictEqual(plain_(summary), { totalIncome: 3000, totalExpense: 1200, balance: 1800, incomeCount: 1, expenseCount: 1, evidenceCount: 2 });
  var inserted = null;
  context.insertSettlementReportRow_ = function (row) { inserted = plain_(row); };
  context.writeAccountingAudit_ = function () {};
  var report = context.generateSettlementReport_({ startDate: '2026-08-01', endDate: '2026-08-31' }, { user: { email: 'm@example.com' } });
  assert.strictEqual(report.status, '생성완료');
  assert.strictEqual(inserted.totalIncome, 3000);
}
'''

# Remove old settlement compatibility test invocation because implementation moved.
test_text = test_text.replace("testSettlementSummaryCompatibility_();\n", "")
# Append new test functions and calls before console log.
marker = "console.log('Accounting behavior regression tests passed.');"
test_text = test_text.replace(marker, test_add + "\n" + "\n".join([
    'testAccountingOperationSchema_();', 'testLedgerLifecycle_();', 'testLedgerDeletedFiltering_();',
    'testEvidenceAuditQuery_();', 'testBankParserIncomeExpense_();', 'testReconciliationMatching_();',
    'testSettlementEligibilityAndSnapshot_();'
]) + "\n" + marker)
write(path, test_text)

# Architecture verifier: focused ownership rules for complete server port
write('scripts/verify-accounting-architecture.js', r'''var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var ACCOUNTING_ROOT = path.join(ROOT, 'src', '000_server', '060_accounting');
var failures = [];
function normalize_(v) { return v.replace(/\\/g, '/'); }
function exists_(p) { return fs.existsSync(path.join(ACCOUNTING_ROOT, p)); }
function requireFile_(p) { if (!exists_(p)) failures.push('Missing Accounting architecture file: ' + p); }
function listSourceFiles_(d) { return fs.readdirSync(d, { withFileTypes: true }).reduce(function (files, entry) { var target = path.join(d, entry.name); if (entry.isDirectory()) return files.concat(listSourceFiles_(target)); if (/\.gs$/.test(entry.name)) files.push(target); return files; }, []); }
function collectFunctions_() { var functions = {}; listSourceFiles_(ACCOUNTING_ROOT).forEach(function (file) { var source = fs.readFileSync(file, 'utf8'), pattern = /function\s+([A-Za-z_$][\w$]*)\s*\(/g, match; while ((match = pattern.exec(source)) !== null) { if (!functions[match[1]]) functions[match[1]] = []; functions[match[1]].push(normalize_(path.relative(ACCOUNTING_ROOT, file))); } }); return functions; }
function requireFunctionIn_(functions, name, p) { var locations = functions[name] || []; if (locations.length !== 1 || locations[0] !== p) failures.push('Function ownership mismatch: ' + name + ' expected ' + p + ', found ' + (locations.length ? locations.join(', ') : 'none')); }
function requireTableAccessIn_(tableName, allowedPath) { var pattern = new RegExp("(?:readOperationTableRows_|appendOperationTableRow_|updateOperationTableRow_|findOperationTableRowById_)\\(\\s*['\\\"]" + tableName + "['\\\"]", 'g'); listSourceFiles_(ACCOUNTING_ROOT).forEach(function (file) { var relativePath = normalize_(path.relative(ACCOUNTING_ROOT, file)); var source = fs.readFileSync(file, 'utf8'); if (pattern.test(source) && relativePath !== allowedPath) failures.push('Table access ownership mismatch: ' + tableName + ' accessed from ' + relativePath + ', expected ' + allowedPath); pattern.lastIndex = 0; }); }
[
'060_common/accounting_common.gs','060_common/accounting_audit_sheet_dao.gs','060_common/accounting_query_service.gs','060_common/accounting_event_read_dao.gs',
'061_ledger/ledger_api.gs','061_ledger/ledger_service.gs','061_ledger/ledger_sheet_dao.gs',
'062_evidence/evidence_api.gs','062_evidence/evidence_service.gs','062_evidence/evidence_sheet_dao.gs','062_evidence/evidence_file_service.gs',
'063_reconciliation/reconciliation_api.gs','063_reconciliation/reconciliation_service.gs','063_reconciliation/reconciliation_query_service.gs','063_reconciliation/reconciliation_sheet_dao.gs','063_reconciliation/bank_transaction_sheet_dao.gs','063_reconciliation/bank_ocr_sheet_dao.gs','063_reconciliation/bank_ocr_service.gs','063_reconciliation/bank_ocr_file_service.gs','063_reconciliation/bank_transaction_parser.gs',
'064_settlement/settlement_api.gs','064_settlement/settlement_service.gs','064_settlement/settlement_query_service.gs','064_settlement/settlement_sheet_dao.gs'
].forEach(requireFile_);
var functions = collectFunctions_();
var ownership = {
api_getLedgerSummary:'061_ledger/ledger_api.gs',api_updateLedgerEntry:'061_ledger/ledger_api.gs',api_deleteLedgerEntry:'061_ledger/ledger_api.gs',saveLedgerDraft_:'061_ledger/ledger_service.gs',updateLedgerEntry_:'061_ledger/ledger_service.gs',softDeleteLedgerEntry_:'061_ledger/ledger_service.gs',
api_getEvidenceAuditList:'062_evidence/evidence_api.gs',getEvidenceAuditList_:'062_evidence/evidence_service.gs',
parseBankOcrTransactions_:'063_reconciliation/bank_transaction_parser.gs',extractBankOcrText_:'063_reconciliation/bank_ocr_file_service.gs',uploadBankTransactions_:'063_reconciliation/bank_ocr_service.gs',
scoreReconciliationCandidate_:'063_reconciliation/reconciliation_query_service.gs',buildReconciliationResults_:'063_reconciliation/reconciliation_query_service.gs',runReconciliation_:'063_reconciliation/reconciliation_service.gs',linkReconciliation_:'063_reconciliation/reconciliation_service.gs',createLedgerFromReconciliation_:'063_reconciliation/reconciliation_service.gs',
api_uploadBankTransactions:'063_reconciliation/reconciliation_api.gs',api_runReconciliation:'063_reconciliation/reconciliation_api.gs',api_getReconciliationList:'063_reconciliation/reconciliation_api.gs',api_getReconciliationDetail:'063_reconciliation/reconciliation_api.gs',api_getReconciliationCandidates:'063_reconciliation/reconciliation_api.gs',api_linkReconciliation:'063_reconciliation/reconciliation_api.gs',api_createLedgerFromReconciliation:'063_reconciliation/reconciliation_api.gs',api_getBankOcrLogs:'063_reconciliation/reconciliation_api.gs',
api_getSettlementSummary:'064_settlement/settlement_api.gs',api_generateSettlementReport:'064_settlement/settlement_api.gs',api_getSettlementReportList:'064_settlement/settlement_api.gs',api_getSettlementReport:'064_settlement/settlement_api.gs',api_exportSettlementReport:'064_settlement/settlement_api.gs',generateSettlementReport_:'064_settlement/settlement_service.gs'
};
Object.keys(ownership).forEach(function (name) { requireFunctionIn_(functions, name, ownership[name]); });
Object.keys(functions).forEach(function (name) { if (functions[name].length > 1) failures.push('Duplicate Accounting function: ' + name + ' in ' + functions[name].join(', ')); });
requireTableAccessIn_('ledger', '061_ledger/ledger_sheet_dao.gs');
requireTableAccessIn_('evidence', '062_evidence/evidence_sheet_dao.gs');
requireTableAccessIn_('events', '060_common/accounting_event_read_dao.gs');
requireTableAccessIn_('businessAuditLogs', '060_common/accounting_audit_sheet_dao.gs');
requireTableAccessIn_('bankTransactions', '063_reconciliation/bank_transaction_sheet_dao.gs');
requireTableAccessIn_('bankOcrLogs', '063_reconciliation/bank_ocr_sheet_dao.gs');
requireTableAccessIn_('reconciliation', '063_reconciliation/reconciliation_sheet_dao.gs');
requireTableAccessIn_('reconciliationItems', '063_reconciliation/reconciliation_sheet_dao.gs');
requireTableAccessIn_('settlementReports', '064_settlement/settlement_sheet_dao.gs');
var reconciliationFiles = listSourceFiles_(path.join(ACCOUNTING_ROOT, '063_reconciliation'));
reconciliationFiles.forEach(function (file) { var rel = normalize_(path.relative(ACCOUNTING_ROOT, file)), source = fs.readFileSync(file, 'utf8'); if (/appendOperationTableRow_\(\s*['\"]ledger['\"]/.test(source)) failures.push('Reconciliation must not write ledger table directly: ' + rel); });
var ocrDriveLocations = [];
listSourceFiles_(ACCOUNTING_ROOT).forEach(function (file) { var source = fs.readFileSync(file, 'utf8'); if (/Drive\.Files|DocumentApp/.test(source)) ocrDriveLocations.push(normalize_(path.relative(ACCOUNTING_ROOT, file))); });
if (ocrDriveLocations.length !== 1 || ocrDriveLocations[0] !== '063_reconciliation/bank_ocr_file_service.gs') failures.push('OCR Drive ownership mismatch: ' + (ocrDriveLocations.length ? ocrDriveLocations.join(', ') : 'none'));
if (failures.length) { failures.forEach(function (f) { console.error(f); }); process.exitCode = 1; } else { console.log('Accounting architecture verification passed.'); }
''')

print('Accounting server patch applied.')
