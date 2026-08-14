var LEDGER_DB_PROPERTY_KEY = 'COUNCIL_LEDGER_SPREADSHEET_ID';
var LEDGER_EVIDENCE_FOLDER_PROPERTY_KEY = 'COUNCIL_LEDGER_EVIDENCE_FOLDER_ID';
var LEGACY_RECONCILIATION_MOCK_CLEANUP_KEY = 'LEGACY_RECONCILIATION_MOCKS_REMOVED_V1';

var DEFAULT_LEDGER_EVENTS = [
  { event_id: 'EVT-NONE', event_name: '해당 없음' },
  { event_id: 'EVT-MT', event_name: 'MT' },
  { event_id: 'EVT-OPENING-MEETING', event_name: '개강총회' },
  { event_id: 'EVT-CLOSING-MEETING', event_name: '종강총회' },
  { event_id: 'EVT-SNACK', event_name: '간식행사' }
];

var LEDGER_EXT_DB = {
  bankTransactionSheet: 'BANK_TRANSACTION',
  bankOcrLogSheet: 'BANK_OCR_LOG',
  reconciliationSheet: 'RECONCILIATION_RESULT',
  settlementReportSheet: 'SETTLEMENT_REPORT',
  processLogSheet: 'PROCESS_LOG',
  bankTransactionHeaders: [
    'bank_transaction_id',
    'transaction_date',
    'counterparty',
    'description',
    'amount',
    'file_name',
    'created_at',
    'is_deleted'
  ],
  bankOcrLogHeaders: [
    'ocr_log_id',
    'file_name',
    'file_type',
    'file_size',
    'ocr_status',
    'parse_status',
    'text_length',
    'raw_text',
    'extracted_transaction_count',
    'expense_count',
    'review_count',
    'error_message',
    'created_at',
    'is_deleted'
  ],
  reconciliationHeaders: [
    'reconciliation_id',
    'transaction_id',
    'bank_transaction_id',
    'transaction_date',
    'ledger_description',
    'bank_description',
    'amount',
    'difference_amount',
    'status',
    'action_label',
    'note',
    'created_at',
    'updated_at',
    'is_deleted'
  ],
  settlementReportHeaders: [
    'report_id',
    'period_name',
    'event_name',
    'total_income',
    'total_expense',
    'balance',
    'evidence_count',
    'report_status',
    'created_at',
    'updated_at',
    'is_deleted'
  ],
  processLogHeaders: [
    'log_id',
    'target_type',
    'target_id',
    'action',
    'actor',
    'message',
    'created_at',
    'is_deleted'
  ]
};

var LEDGER_DB = {
  transactionSheet: 'TRANSACTION',
  eventSheet: 'EVENT',
  departmentSheet: 'DDEPARTMENT',
  evidenceSheet: 'EVIDENCE',
  transactionHeaders: [
    'transaction_id',
    'transaction_type',
    'transaction_date',
    'department_id',
    'amount',
    'counterparty',
    'event_id',
    'description',
    'note',
    'manager',
    'status',
    'has_evidence',
    'alert',
    'created_at',
    'updated_at',
    'is_deleted'
  ],
  eventHeaders: ['event_id', 'event_name', 'created_at', 'updated_at', 'is_deleted'],
  departmentHeaders: ['department_id', 'department_name', 'created_at', 'updated_at', 'is_deleted'],
  evidenceHeaders: [
    'evidence_id',
    'transaction_id',
    'file_name',
    'file_path',
    'file_id',
    'mime_type',
    'file_size',
    'preview_url',
    'download_url',
    'created_at',
    'updated_at',
    'is_deleted'
  ]
};

function doGet() {
  initLedgerDatabase();
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('학생회 통합 업무관리')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function setupLedgerDatabase() {
  var spreadsheet = initLedgerDatabase();
  return {
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    spreadsheetUrl: spreadsheet.getUrl(),
    sheets: [
      LEDGER_DB.transactionSheet,
      LEDGER_DB.eventSheet,
      LEDGER_DB.departmentSheet,
      LEDGER_DB.evidenceSheet,
      LEDGER_EXT_DB.bankTransactionSheet,
      LEDGER_EXT_DB.bankOcrLogSheet,
      LEDGER_EXT_DB.reconciliationSheet,
      LEDGER_EXT_DB.settlementReportSheet,
      LEDGER_EXT_DB.processLogSheet
    ]
  };
}


function apiV1_getLedgerDatabaseInfo() {
  var spreadsheet = initLedgerDatabase();
  var transactionSheet = spreadsheet.getSheetByName(LEDGER_DB.transactionSheet);
  return {
    ok: true,
    spreadsheetId: spreadsheet.getId(),
    spreadsheetName: spreadsheet.getName(),
    spreadsheetUrl: spreadsheet.getUrl(),
    transactionRowCount: transactionSheet ? Math.max(0, transactionSheet.getLastRow() - 1) : 0
  };
}
function setLedgerSpreadsheetId(spreadsheetId) {
  if (!spreadsheetId) {
    throw new Error('spreadsheetId is required.');
  }

  PropertiesService.getScriptProperties().setProperty(LEDGER_DB_PROPERTY_KEY, spreadsheetId);
  return setupLedgerDatabase();
}

function apiV1_getLedgerSummary(filter) {
  var items = filterLedgerEntries_(getLedgerEntries_(), filter || {});
  return {
    totalIncome: items.reduce(function (sum, item) {
      return sum + (item.transaction_type === '수입' ? Number(item.amount || 0) : 0);
    }, 0),
    totalExpense: items.reduce(function (sum, item) {
      return sum + (item.transaction_type === '지출' ? Number(item.amount || 0) : 0);
    }, 0),
    pendingCount: items.filter(function (item) { return item.status === '대기'; }).length,
    reviewCount: items.filter(function (item) { return item.status === '확인요청'; }).length
  };
}

function apiV1_getLedgerList(filter) {
  var items = getLedgerEntries_();
  var filtered = filterLedgerEntries_(items, normalizeFilter_(filter || {}));
  return {
    items: filtered,
    page: {
      pageNo: 1,
      pageSize: filtered.length,
      totalCount: filtered.length
    }
  };
}

function apiV1_getLedgerDetail(transactionId) {
  var items = getLedgerEntries_();
  var target = items.filter(function (item) {
    return item.transaction_id === transactionId;
  })[0];

  return target || null;
}

function apiV1_getLedgerEventOptions() {
  initLedgerDatabase();
  var events = indexBy_(readSheetObjects_(LEDGER_DB.eventSheet)
    .filter(function (event) { return !toBoolean_(event.is_deleted); }), 'event_name');
  var items = getLedgerEntries_();

  return DEFAULT_LEDGER_EVENTS.map(function (defaultEvent) {
    var event = events[defaultEvent.event_name] || defaultEvent;
    var balance = items.reduce(function (sum, item) {
      if (item.event_name !== event.event_name) return sum;
      var amount = Number(item.amount || 0);
      return sum + (item.transaction_type === '수입' ? amount : -amount);
    }, 0);

    return {
      event_id: event.event_id,
      event_name: event.event_name,
      balance: balance
    };
  });
}

function apiV1_createLedgerEntry(request) {
  return saveLedgerEntry_(request || {}, '대기');
}

function apiV1_saveLedgerDraft(request) {
  return saveLedgerEntry_(request || {}, '임시저장');
}

function apiV1_processLedgerEntry(request) {
  request = request || {};
  var transactionId = request.transaction_id;
  if (!transactionId) {
    throw new Error('transaction_id is required.');
  }

  var newStatus = request.action === 'approve' ? '승인' : request.action === 'pending' ? '대기' : '확인요청';
  var sheet = getDbSheet_(LEDGER_DB.transactionSheet);
  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  var idCol = headers.indexOf('transaction_id');
  var statusCol = headers.indexOf('status');
  var updatedCol = headers.indexOf('updated_at');
  var alertCol = headers.indexOf('alert');

  for (var i = 1; i < values.length; i += 1) {
    if (String(values[i][idCol]) === transactionId) {
      sheet.getRange(i + 1, statusCol + 1).setValue(newStatus);
      sheet.getRange(i + 1, updatedCol + 1).setValue(nowIso_());
      if (newStatus === '승인' && alertCol > -1) {
        sheet.getRange(i + 1, alertCol + 1).setValue('');
      }
      return {
        ok: true,
        transaction_id: transactionId,
        status: newStatus,
        item: apiV1_getLedgerDetail(transactionId)
      };
    }
  }

  throw new Error('Transaction not found: ' + transactionId);
}

function apiV1_updateLedgerEntry(request) {
  initLedgerDatabase();
  request = request || {};
  var transactionId = request.transaction_id;
  if (!transactionId) {
    throw new Error('transaction_id is required.');
  }

  var department = findOrCreateDepartment_(request.department_id, request.department_name);
  var event = findOrCreateEvent_(request.event_id, request.event_name);
  var evidenceFiles = request.evidence_files || request.evidence || [];
  var changes = {
    transaction_type: request.transaction_type || '지출',
    transaction_date: request.transaction_date || formatDate_(new Date()),
    department_id: department.department_id,
    amount: Number(request.amount || 0),
    counterparty: request.counterparty || '',
    event_id: event ? event.event_id : '',
    description: request.description || '',
    note: request.note || '',
    updated_at: nowIso_()
  };

  if (evidenceFiles.length > 0) {
    changes.has_evidence = true;
  }

  updateSheetRow_(LEDGER_DB.transactionSheet, 'transaction_id', transactionId, changes);
  var evidenceResult = saveEvidenceFiles_(transactionId, evidenceFiles, changes.updated_at);
  return {
    ok: true,
    evidence: evidenceResult,
    item: apiV1_getLedgerDetail(transactionId)
  };
}

function apiV1_deleteLedgerEntry(request) {
  initLedgerDatabase();
  request = request || {};
  var transactionId = request.transaction_id;
  if (!transactionId) {
    throw new Error('transaction_id is required.');
  }

  updateSheetRow_(LEDGER_DB.transactionSheet, 'transaction_id', transactionId, {
    is_deleted: true,
    updated_at: nowIso_()
  });
  return { ok: true, transaction_id: transactionId };
}

function saveLedgerEntry_(request, status) {
  initLedgerDatabase();

  var department = findOrCreateDepartment_(request.department_id, request.department_name);
  var event = findOrCreateEvent_(request.event_id, request.event_name);
  var timestamp = nowIso_();
  var evidenceFiles = request.evidence_files || request.evidence || [];
  var item = {
    transaction_id: request.transaction_id || makeId_('TRX'),
    transaction_type: request.transaction_type || '지출',
    transaction_date: request.transaction_date || formatDate_(new Date()),
    department_id: department.department_id,
    amount: Number(request.amount || 0),
    counterparty: request.counterparty || '',
    event_id: event ? event.event_id : '',
    description: request.description || '',
    note: request.note || '',
    manager: request.manager || getCurrentUserName_(),
    status: status,
    has_evidence: evidenceFiles.length > 0 || toBoolean_(request.has_evidence),
    alert: request.alert || '',
    created_at: timestamp,
    updated_at: timestamp,
    is_deleted: false
  };

  appendObject_(LEDGER_DB.transactionSheet, LEDGER_DB.transactionHeaders, item);
  var evidenceResult = saveEvidenceFiles_(item.transaction_id, evidenceFiles, timestamp);
  return {
    ok: true,
    evidence: evidenceResult,
    item: apiV1_getLedgerDetail(item.transaction_id)
  };
}


function saveEvidenceFiles_(transactionId, files, timestamp) {
  files = files || [];
  if (!files.length) return { savedCount: 0, errors: [] };

  var result = { savedCount: 0, errors: [] };
  files.forEach(function (file, index) {
    file = file || {};
    var fileName = file.file_name || file.name || ('evidence_' + (index + 1));
    var storedFile = null;

    if (file.content_base64) {
      try {
        storedFile = createEvidenceDriveFile_(transactionId, fileName, file.file_type || file.mime_type, file.content_base64);
      } catch (error) {
        result.errors.push({ file_name: fileName, message: error.message || String(error) });
      }
    }

    var evidence = {
      evidence_id: makeId_('EVD'),
      transaction_id: transactionId,
      file_name: fileName,
      file_path: storedFile ? storedFile.getUrl() : (file.file_path || file.file_url || ''),
      file_id: storedFile ? storedFile.getId() : (file.file_id || ''),
      mime_type: file.file_type || file.mime_type || '',
      file_size: file.file_size || '',
      preview_url: file.preview_url || '',
      download_url: file.download_url || '',
      created_at: timestamp || nowIso_(),
      updated_at: timestamp || nowIso_(),
      is_deleted: false
    };

    appendObject_(LEDGER_DB.evidenceSheet, LEDGER_DB.evidenceHeaders, evidence);
    result.savedCount += 1;
  });
  return result;
}

function sanitizeFileName_(fileName) {
  return String(fileName || 'evidence')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'evidence';
}

function createEvidenceDriveFile_(transactionId, fileName, mimeType, contentBase64) {
  var folder = getEvidenceFolder_();
  var base64 = String(contentBase64 || '').replace(/^data:[^,]+,/, '');
  var bytes = Utilities.base64Decode(base64);
  var safeName = transactionId + '_' + sanitizeFileName_(fileName);
  var blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', safeName);
  return folder.createFile(blob);
}

function getEvidenceFolder_() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty(LEDGER_EVIDENCE_FOLDER_PROPERTY_KEY);
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (error) {
      props.deleteProperty(LEDGER_EVIDENCE_FOLDER_PROPERTY_KEY);
    }
  }

  var folder = DriveApp.createFolder('학생회 통합 업무관리 증빙자료');
  props.setProperty(LEDGER_EVIDENCE_FOLDER_PROPERTY_KEY, folder.getId());
  return folder;
}

function apiV1_getEvidenceFileContent(request) {
  request = request || {};
  var fileId = request.file_id || '';
  if (!fileId && request.evidence_id) {
    var evidence = readSheetObjects_(LEDGER_DB.evidenceSheet).filter(function (item) {
      return item.evidence_id === request.evidence_id;
    })[0];
    fileId = evidence ? evidence.file_id : '';
  }
  if (!fileId) {
    throw new Error('증빙 파일 ID가 없습니다. 파일명만 저장된 기존 증빙은 미리보기를 만들 수 없습니다.');
  }

  var driveFile = DriveApp.getFileById(fileId);
  var blob = driveFile.getBlob();
  return {
    ok: true,
    file_id: fileId,
    file_name: driveFile.getName(),
    mime_type: blob.getContentType(),
    content_base64: Utilities.base64Encode(blob.getBytes())
  };
}
function initLedgerDatabase() {
  var spreadsheet = getLedgerSpreadsheet_();
  ensureSheet_(spreadsheet, LEDGER_DB.transactionSheet, LEDGER_DB.transactionHeaders);
  ensureSheet_(spreadsheet, LEDGER_DB.eventSheet, LEDGER_DB.eventHeaders);
  ensureSheet_(spreadsheet, LEDGER_DB.departmentSheet, LEDGER_DB.departmentHeaders);
  ensureSheet_(spreadsheet, LEDGER_DB.evidenceSheet, LEDGER_DB.evidenceHeaders);
  ensureSheet_(spreadsheet, LEDGER_EXT_DB.bankTransactionSheet, LEDGER_EXT_DB.bankTransactionHeaders);
  ensureSheet_(spreadsheet, LEDGER_EXT_DB.bankOcrLogSheet, LEDGER_EXT_DB.bankOcrLogHeaders);
  ensureSheet_(spreadsheet, LEDGER_EXT_DB.reconciliationSheet, LEDGER_EXT_DB.reconciliationHeaders);
  ensureSheet_(spreadsheet, LEDGER_EXT_DB.settlementReportSheet, LEDGER_EXT_DB.settlementReportHeaders);
  ensureSheet_(spreadsheet, LEDGER_EXT_DB.processLogSheet, LEDGER_EXT_DB.processLogHeaders);
  seedLedgerDatabaseIfEmpty_();
  ensureDefaultLedgerEvents_();
  removeLegacyReconciliationMockData_();
  return spreadsheet;
}

function getLedgerSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty(LEDGER_DB_PROPERTY_KEY);
  if (spreadsheetId) {
    return SpreadsheetApp.openById(spreadsheetId);
  }

  var activeSpreadsheet = null;
  try {
    activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  } catch (error) {
    activeSpreadsheet = null;
  }

  if (activeSpreadsheet) {
    props.setProperty(LEDGER_DB_PROPERTY_KEY, activeSpreadsheet.getId());
    return activeSpreadsheet;
  }

  var created = SpreadsheetApp.create('학생회 통합 업무관리 DB');
  props.setProperty(LEDGER_DB_PROPERTY_KEY, created.getId());
  return created;
}

function ensureSheet_(spreadsheet, sheetName, headers) {
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  var currentHeader = sheet.getRange(1, 1, 1, Math.max(headers.length, sheet.getLastColumn() || headers.length)).getValues()[0];
  var hasHeader = currentHeader.some(function (cell) { return cell !== ''; });
  if (!hasHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, headers.length);
    return sheet;
  }

  var usedHeaderLength = currentHeader.reduce(function (last, cell, index) {
    return cell !== '' ? index + 1 : last;
  }, 0);
  var missingHeaders = headers.filter(function (header) {
    return currentHeader.indexOf(header) === -1;
  });

  if (missingHeaders.length > 0) {
    sheet.getRange(1, usedHeaderLength + 1, 1, missingHeaders.length).setValues([missingHeaders]);
    sheet.autoResizeColumns(1, usedHeaderLength + missingHeaders.length);
  }

  return sheet;
}

function seedLedgerDatabaseIfEmpty_() {
  if (getDbSheet_(LEDGER_DB.transactionSheet).getLastRow() > 1) {
    return;
  }

  [
    { department_id: 'DEP-001', department_name: '문화체육국' },
    { department_id: 'DEP-002', department_name: '회장단' },
    { department_id: 'DEP-003', department_name: '홍보국' },
    { department_id: 'DEP-004', department_name: '사무국' }
  ].forEach(function (department) {
    appendObject_(LEDGER_DB.departmentSheet, LEDGER_DB.departmentHeaders, {
      department_id: department.department_id,
      department_name: department.department_name,
      created_at: nowIso_(),
      updated_at: nowIso_(),
      is_deleted: false
    });
  });

  [
    { event_id: 'EVT-001', event_name: '봄학기 MT' },
    { event_id: 'EVT-002', event_name: '중간고사 간식' },
    { event_id: 'EVT-003', event_name: '해당없음' }
  ].forEach(function (event) {
    appendObject_(LEDGER_DB.eventSheet, LEDGER_DB.eventHeaders, {
      event_id: event.event_id,
      event_name: event.event_name,
      created_at: nowIso_(),
      updated_at: nowIso_(),
      is_deleted: false
    });
  });

  getSeedTransactions_().forEach(function (entry) {
    appendObject_(LEDGER_DB.transactionSheet, LEDGER_DB.transactionHeaders, entry);
  });

  appendObject_(LEDGER_DB.evidenceSheet, LEDGER_DB.evidenceHeaders, {
    evidence_id: 'EVD-20260502-001',
    transaction_id: 'TRX-20260502-001',
    file_name: 'receipt_20260502.jpg',
    file_path: 'sample/receipt_20260502.jpg',
    created_at: nowIso_(),
    updated_at: nowIso_(),
    is_deleted: false
  });

  appendObject_(LEDGER_DB.evidenceSheet, LEDGER_DB.evidenceHeaders, {
    evidence_id: 'EVD-20260503-001',
    transaction_id: 'TRX-20260503-001',
    file_name: 'deposit_20260503.png',
    file_path: 'sample/deposit_20260503.png',
    created_at: nowIso_(),
    updated_at: nowIso_(),
    is_deleted: false
  });
}

function ensureDefaultLedgerEvents_() {
  var events = readSheetObjects_(LEDGER_DB.eventSheet)
    .filter(function (event) { return !toBoolean_(event.is_deleted); });
  var eventsByName = indexBy_(events, 'event_name');
  var timestamp = nowIso_();

  DEFAULT_LEDGER_EVENTS.forEach(function (event) {
    if (eventsByName[event.event_name]) return;
    appendObject_(LEDGER_DB.eventSheet, LEDGER_DB.eventHeaders, {
      event_id: event.event_id,
      event_name: event.event_name,
      created_at: timestamp,
      updated_at: timestamp,
      is_deleted: false
    });
  });
}

function getLedgerEntries_() {
  initLedgerDatabase();

  var transactions = readSheetObjects_(LEDGER_DB.transactionSheet)
    .filter(function (item) { return !toBoolean_(item.is_deleted); });
  var departments = indexBy_(readSheetObjects_(LEDGER_DB.departmentSheet), 'department_id');
  var events = indexBy_(readSheetObjects_(LEDGER_DB.eventSheet), 'event_id');
  var evidenceByTransaction = groupBy_(readSheetObjects_(LEDGER_DB.evidenceSheet)
    .map(normalizeEvidenceRow_)
    .filter(function (item) { return !toBoolean_(item.is_deleted); }), 'transaction_id');

  return transactions.map(function (item) {
    var department = departments[item.department_id] || {};
    var event = events[item.event_id] || {};
    var evidenceList = evidenceByTransaction[item.transaction_id] || [];
    return {
      transaction_id: item.transaction_id,
      transaction_type: item.transaction_type,
      transaction_date: stringifyDate_(item.transaction_date),
      department_id: item.department_id,
      department_name: department.department_name || item.department_name || '',
      amount: Number(item.amount || 0),
      counterparty: item.counterparty || '',
      event_id: item.event_id || '',
      event_name: event.event_name || item.event_name || '해당없음',
      description: item.description || '',
      note: item.note || '',
      manager: item.manager || '',
      status: item.status || '대기',
      has_evidence: evidenceList.length > 0 || toBoolean_(item.has_evidence),
      evidence: evidenceList,
      alert: item.alert || '',
      created_at: stringifyDateTime_(item.created_at),
      updated_at: stringifyDateTime_(item.updated_at),
      is_deleted: toBoolean_(item.is_deleted)
    };
  }).sort(function (a, b) {
    return String(b.created_at || '').localeCompare(String(a.created_at || '')) ||
      String(b.transaction_date || '').localeCompare(String(a.transaction_date || ''));
  });
}

function isApprovedLedgerEntry_(item) {
  return item && !toBoolean_(item.is_deleted) && item.status === '승인';
}

function getApprovedLedgerEntries_() {
  return getLedgerEntries_().filter(isApprovedLedgerEntry_);
}

function getApprovedLedgerIndex_() {
  return indexBy_(getApprovedLedgerEntries_(), 'transaction_id');
}

function getApprovedExpenseLedgerEntries_() {
  return getApprovedLedgerEntries_().filter(function (item) {
    return item.transaction_type === '지출';
  });
}

function getApprovedExpenseLedgerIndex_() {
  return indexBy_(getApprovedExpenseLedgerEntries_(), 'transaction_id');
}

function normalizeEvidenceRow_(item) {
  item = item || {};
  var normalized = Object.assign({}, item);

  // If EVIDENCE headers were expanded after old rows existed, new values can appear
  // under the former created_at / updated_at / is_deleted columns. Recover them in memory.
  if (!normalized.file_id && looksLikeDriveFileId_(normalized.created_at)) {
    normalized.file_id = normalized.created_at;
    normalized.created_at = '';
  }
  if (!normalized.mime_type && looksLikeMimeType_(normalized.updated_at)) {
    normalized.mime_type = normalized.updated_at;
    normalized.updated_at = '';
  }
  if (!normalized.file_size && isNumericText_(normalized.is_deleted)) {
    normalized.file_size = normalized.is_deleted;
    normalized.is_deleted = false;
  }
  if (!normalized.file_id && normalized.file_path) {
    normalized.file_id = extractDriveFileId_(normalized.file_path);
  }

  return normalized;
}

function looksLikeDriveFileId_(value) {
  return /^[A-Za-z0-9_-]{20,}$/.test(String(value || ''));
}

function extractDriveFileId_(value) {
  var text = String(value || '');
  var match = text.match(/[?&]id=([A-Za-z0-9_-]{20,})/) || text.match(/\/d\/([A-Za-z0-9_-]{20,})/);
  return match ? match[1] : '';
}

function looksLikeMimeType_(value) {
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(String(value || ''));
}

function isNumericText_(value) {
  return /^\d+$/.test(String(value || ''));
}
function filterLedgerEntries_(items, filter) {
  filter = normalizeFilter_(filter || {});
  var keyword = String(filter.keyword || '').trim().toLowerCase();

  return items.filter(function (item) {
    if (keyword) {
      var searchTarget = [
        item.counterparty,
        item.description,
        item.note,
        item.event_name,
        item.department_name,
        item.manager
      ].join(' ').toLowerCase();
      if (searchTarget.indexOf(keyword) === -1) return false;
    }
    if (filter.transaction_type && filter.transaction_type !== '전체' && item.transaction_type !== filter.transaction_type) return false;
    if (filter.department_name && filter.department_name !== '전체' && item.department_name !== filter.department_name) return false;
    if (filter.event_name && filter.event_name !== '전체' && item.event_name !== filter.event_name) return false;
    if (filter.status && filter.status !== '전체' && item.status !== filter.status) return false;
    return true;
  });
}

function normalizeFilter_(filter) {
  return {
    keyword: filter.keyword || '',
    transaction_type: filter.transaction_type || filter.type || '전체',
    department_name: filter.department_name || filter.department || '전체',
    event_name: filter.event_name || filter.event || '전체',
    status: filter.status || '전체'
  };
}

function readSheetObjects_(sheetName) {
  var sheet = getDbSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 2 || lastColumn < 1) return [];

  var values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  var headers = values[0].map(function (header) { return String(header || '').trim(); });
  return values.slice(1).map(function (row) {
    var object = {};
    headers.forEach(function (header, index) {
      if (header) object[header] = row[index];
    });
    return object;
  });
}

function appendObject_(sheetName, headers, object) {
  var sheet = getDbSheet_(sheetName);
  var row = headers.map(function (header) {
    return object[header] === undefined ? '' : object[header];
  });
  sheet.appendRow(row);
  SpreadsheetApp.flush();
}

function getDbSheet_(sheetName) {
  var spreadsheet = getLedgerSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet not found: ' + sheetName);
  }
  return sheet;
}

function findOrCreateDepartment_(departmentId, departmentName) {
  var departments = readSheetObjects_(LEDGER_DB.departmentSheet);
  var found = departments.filter(function (department) {
    return (departmentId && department.department_id === departmentId) ||
      (departmentName && department.department_name === departmentName);
  })[0];

  if (found) return found;

  var department = {
    department_id: departmentId || makeId_('DEP'),
    department_name: departmentName || '미지정',
    created_at: nowIso_(),
    updated_at: nowIso_(),
    is_deleted: false
  };
  appendObject_(LEDGER_DB.departmentSheet, LEDGER_DB.departmentHeaders, department);
  return department;
}

function findOrCreateEvent_(eventId, eventName) {
  if (!eventId && !eventName) return null;

  var events = readSheetObjects_(LEDGER_DB.eventSheet);
  var found = events.filter(function (event) {
    return (eventId && event.event_id === eventId) ||
      (eventName && event.event_name === eventName);
  })[0];

  if (found) return found;

  var event = {
    event_id: eventId || makeId_('EVT'),
    event_name: eventName || '해당없음',
    created_at: nowIso_(),
    updated_at: nowIso_(),
    is_deleted: false
  };
  appendObject_(LEDGER_DB.eventSheet, LEDGER_DB.eventHeaders, event);
  return event;
}

function indexBy_(items, key) {
  return items.reduce(function (index, item) {
    index[item[key]] = item;
    return index;
  }, {});
}

function groupBy_(items, key) {
  return items.reduce(function (group, item) {
    var value = item[key];
    if (!group[value]) group[value] = [];
    group[value].push(item);
    return group;
  }, {});
}

function makeId_(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss') + '-' +
    Math.floor(Math.random() * 1000);
}

function nowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function formatDate_(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function stringifyDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return formatDate_(value);
  }
  return String(value || '');
}

function stringifyDateTime_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
  }
  return String(value || '');
}

function toBoolean_(value) {
  if (value === true) return true;
  if (value === false || value === '' || value === null || value === undefined) return false;
  return ['true', 'TRUE', '1', 'Y', 'y', '예'].indexOf(String(value)) > -1;
}

function getCurrentUserName_() {
  var email = '';
  try {
    email = Session.getActiveUser().getEmail();
  } catch (error) {
    email = '';
  }
  return email || '운영자';
}

function getSeedTransactions_() {
  var timestamp = nowIso_();
  return [
    {
      transaction_id: 'TRX-20260502-001',
      transaction_type: '지출',
      transaction_date: '2026-05-02',
      department_id: 'DEP-001',
      amount: 120000,
      counterparty: '이마트',
      event_id: 'EVT-001',
      description: 'MT 간식 구매',
      note: '계좌 거래내역과 3,000원 차이 확인 필요',
      manager: '김○○',
      status: '대기',
      has_evidence: true,
      alert: '계좌 거래내역과 3,000원 차이가 확인되었습니다.',
      created_at: timestamp,
      updated_at: timestamp,
      is_deleted: false
    },
    {
      transaction_id: 'TRX-20260503-001',
      transaction_type: '수입',
      transaction_date: '2026-05-03',
      department_id: 'DEP-002',
      amount: 50000,
      counterparty: '홍길동',
      event_id: 'EVT-001',
      description: '참가비 입금',
      note: '',
      manager: '이○○',
      status: '승인',
      has_evidence: true,
      alert: '',
      created_at: timestamp,
      updated_at: timestamp,
      is_deleted: false
    },
    {
      transaction_id: 'TRX-20260504-001',
      transaction_type: '지출',
      transaction_date: '2026-05-04',
      department_id: 'DEP-003',
      amount: 35000,
      counterparty: '카페○○',
      event_id: 'EVT-002',
      description: '간식 행사 음료 구매',
      note: '증빙자료 누락',
      manager: '박○○',
      status: '확인요청',
      has_evidence: false,
      alert: '증빙자료가 아직 첨부되지 않았습니다.',
      created_at: timestamp,
      updated_at: timestamp,
      is_deleted: false
    },
    {
      transaction_id: 'TRX-20260505-001',
      transaction_type: '수입',
      transaction_date: '2026-05-05',
      department_id: 'DEP-004',
      amount: 200000,
      counterparty: '토스입금',
      event_id: 'EVT-003',
      description: '운영비 입금',
      note: '',
      manager: '최○○',
      status: '대기',
      has_evidence: false,
      alert: '',
      created_at: timestamp,
      updated_at: timestamp,
      is_deleted: false
    }
  ];
}

function apiV1_reconcileBankTransactions(request) {
  initLedgerDatabase();
  request = request || {};
  var files = Array.isArray(request.files) ? request.files : [];
  var items = [];
  var reviewRequiredItems = [];
  var failedFiles = [];
  var uploadedFiles = [];
  var ocrResults = [];
  var extractedTransactionCount = 0;
  var processedFileCount = 0;

  files.forEach(function (inputFile, fileIndex) {
    var file = normalizeBankUploadFile_(inputFile);
    uploadedFiles.push({
      file_name: file.file_name,
      file_type: file.file_type,
      file_size: file.file_size
    });
    var ocrText = '';
    var parsed = null;
    var ocrLog = {
      file_name: file.file_name,
      file_type: file.file_type,
      file_size: file.file_size,
      ocr_status: '실패',
      parse_status: '미실행',
      text_length: 0,
      raw_text: '',
      extracted_transaction_count: 0,
      expense_count: 0,
      review_count: 0,
      error_message: ''
    };

    try {
      validateBankOcrFile_(file);
      ocrText = extractBankOcrText_(file);
      ocrLog.raw_text = ocrText;
      ocrLog.text_length = ocrText.length;
      ocrLog.ocr_status = ocrText.trim() ? '텍스트 추출 성공' : '텍스트 없음';
      if (!ocrText.trim()) throw new Error('OCR 텍스트를 추출할 수 없습니다.');

      parsed = parseBankOcrTransactions_(ocrText, file, fileIndex, request.base_year);
      ocrLog.extracted_transaction_count = parsed.extractedTransactionCount;
      ocrLog.expense_count = parsed.items.length;
      ocrLog.review_count = parsed.reviewRequiredItems.length;
      ocrLog.parse_status = parsed.items.length > 0
        ? '거래 추출 성공'
        : parsed.reviewRequiredItems.length > 0
          ? '거래 확인 필요'
          : '거래 0건';
      extractedTransactionCount += parsed.extractedTransactionCount;
      items = items.concat(parsed.items);
      reviewRequiredItems = reviewRequiredItems.concat(parsed.reviewRequiredItems);
      processedFileCount += 1;
    } catch (error) {
      var errorMessage = bankOcrErrorMessage_(error);
      ocrLog.error_message = errorMessage;
      if (ocrLog.parse_status === '미실행' && ocrLog.ocr_status === '텍스트 추출 성공') {
        ocrLog.parse_status = '파싱 실패';
      }
      failedFiles.push({
        file_name: file.file_name || ('파일 ' + (fileIndex + 1)),
        reason: errorMessage
      });
    } finally {
      ocrResults.push(saveBankOcrLog_(ocrLog));
    }
  });

  var saveResult = saveBankTransactions_(items);
  var matchResult = processedFileCount > 0 ? runAutomaticReconciliation_() : {
    totalCount: 0,
    normalCount: 0,
    reviewCount: 0,
    missingCount: 0,
    savedCount: 0,
    preservedManualCount: 0
  };
  var reconciliationList = apiV1_getReconciliationList({});

  appendProcessLog_(
    'RECONCILIATION',
    'BATCH',
    'ocr-match',
    '은행 거래내역 OCR과 자동 대조를 실행했습니다. 파일 ' + files.length + '개, 지출 ' + items.length + '건, 저장 ' + saveResult.savedItems.length + '건, 중복 ' + saveResult.duplicateItems.length + '건, 정상 ' + matchResult.normalCount + '건, 확인 필요 ' + matchResult.reviewCount + '건, 장부 누락 의심 ' + matchResult.missingCount + '건.'
  );
  return {
    ok: processedFileCount > 0,
    uploadedFileCount: uploadedFiles.length,
    processedFileCount: processedFileCount,
    failedFileCount: failedFiles.length,
    extractedTransactionCount: extractedTransactionCount,
    expenditureCount: items.length,
    savedCount: saveResult.savedItems.length,
    duplicateCount: saveResult.duplicateItems.length,
    reviewRequiredCount: reviewRequiredItems.length,
    uploadedFiles: uploadedFiles,
    items: saveResult.items,
    savedItems: saveResult.savedItems,
    duplicateItems: saveResult.duplicateItems,
    ocrResults: ocrResults,
    reviewRequiredItems: reviewRequiredItems,
    failedFiles: failedFiles,
    reconciliationItems: reconciliationList.items,
    reconciliationSummary: reconciliationList.summary,
    matchSummary: matchResult
  };
}

function saveBankTransactions_(transactions) {
  transactions = Array.isArray(transactions) ? transactions : [];
  if (!transactions.length) return { items: [], savedItems: [], duplicateItems: [] };

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var existingRows = readSheetObjects_(LEDGER_EXT_DB.bankTransactionSheet);
    var existingKeys = getExistingBankTransactionKeys_(existingRows);
    var existingIds = existingRows.reduce(function (index, row) {
      if (row.bank_transaction_id) index[String(row.bank_transaction_id)] = true;
      return index;
    }, {});
    var savedItems = [];
    var duplicateItems = [];
    var resultItems = [];

    transactions.forEach(function (transaction) {
      var row = buildBankTransactionRow_(transaction);
      var duplicateKey = buildBankTransactionDuplicateKey_(row);
      var duplicate = existingKeys[duplicateKey];

      if (duplicate) {
        var duplicateItem = Object.assign({}, transaction, {
          bank_transaction_id: duplicate.bank_transaction_id || transaction.bank_transaction_id,
          storage_status: '중복 제외',
          duplicate_of: duplicate.bank_transaction_id || ''
        });
        duplicateItems.push(duplicateItem);
        resultItems.push(duplicateItem);
        return;
      }

      row.bank_transaction_id = makeUniqueBankTransactionId_(existingIds);
      appendObject_(LEDGER_EXT_DB.bankTransactionSheet, LEDGER_EXT_DB.bankTransactionHeaders, row);
      existingIds[row.bank_transaction_id] = true;
      existingKeys[duplicateKey] = row;

      var savedItem = Object.assign({}, transaction, {
        bank_transaction_id: row.bank_transaction_id,
        transaction_date: row.transaction_date,
        counterparty: row.counterparty,
        bank_description: row.counterparty,
        description: row.description,
        amount: row.amount,
        source_file_name: row.file_name,
        storage_status: '저장 완료'
      });
      savedItems.push(savedItem);
      resultItems.push(savedItem);
    });

    return {
      items: resultItems,
      savedItems: savedItems,
      duplicateItems: duplicateItems
    };
  } finally {
    lock.releaseLock();
  }
}

function getActiveBankExpenseTransactions_() {
  return readSheetObjects_(LEDGER_EXT_DB.bankTransactionSheet)
    .filter(function (item) {
      return !toBoolean_(item.is_deleted) && Number(item.amount || 0) < 0;
    })
    .map(function (item) {
      return Object.assign({}, item, {
        transaction_date: stringifyDate_(item.transaction_date),
        amount: Number(item.amount || 0)
      });
    });
}

function normalizeReconciliationText_(value) {
  var stopWords = [
    '주식회사', '유한회사', '체크카드', '신용카드', '카드', '출금', '결제',
    '이체', '송금', '입금', '승인', '취소', '페이', '원'
  ];
  var text = String(value || '').toLowerCase()
    .replace(/\(주\)|㈜/g, ' ')
    .replace(/[^0-9a-z가-힣]+/g, ' ');
  stopWords.forEach(function (word) {
    text = text.replace(new RegExp('(^|\\s)' + word + '(?=\\s|$)', 'g'), ' ');
  });
  return text.replace(/\s+/g, ' ').trim();
}

function reconciliationTokens_(value) {
  return normalizeReconciliationText_(value).split(' ').filter(function (token) {
    return token.length >= 2;
  });
}

function reconciliationDateDifference_(left, right) {
  var leftParts = String(left || '').split('-').map(Number);
  var rightParts = String(right || '').split('-').map(Number);
  if (leftParts.length !== 3 || rightParts.length !== 3 || leftParts.some(isNaN) || rightParts.some(isNaN)) return 999;
  var leftTime = Date.UTC(leftParts[0], leftParts[1] - 1, leftParts[2]);
  var rightTime = Date.UTC(rightParts[0], rightParts[1] - 1, rightParts[2]);
  return Math.abs(Math.round((leftTime - rightTime) / 86400000));
}

function scoreReconciliationCandidate_(bank, ledger) {
  if (Math.abs(Number(bank.amount || 0)) !== Math.abs(Number(ledger.amount || 0))) return null;

  var dateDifference = reconciliationDateDifference_(bank.transaction_date, ledger.transaction_date);
  if (dateDifference > 1) return null;

  var score = dateDifference === 0 ? 40 : 25;
  var bankCounterparty = normalizeReconciliationText_(bank.counterparty);
  var ledgerCounterparty = normalizeReconciliationText_(ledger.counterparty);
  var counterpartyExact = bankCounterparty.length >= 2 && bankCounterparty === ledgerCounterparty;
  var counterpartyIncludes = !counterpartyExact && bankCounterparty.length >= 2 && ledgerCounterparty.length >= 2 &&
    (bankCounterparty.indexOf(ledgerCounterparty) > -1 || ledgerCounterparty.indexOf(bankCounterparty) > -1);

  if (counterpartyExact) score += 40;
  else if (counterpartyIncludes) score += 30;

  var bankTokens = reconciliationTokens_([bank.counterparty, bank.description].join(' '));
  var ledgerTokens = reconciliationTokens_([ledger.counterparty, ledger.description].join(' '));
  var commonTokens = bankTokens.filter(function (token) {
    return ledgerTokens.indexOf(token) > -1;
  });
  if (commonTokens.length) score += 15;

  return {
    transaction_id: ledger.transaction_id,
    transaction_date: ledger.transaction_date,
    counterparty: ledger.counterparty || '',
    description: ledger.description || '',
    amount: Number(ledger.amount || 0),
    score: score,
    date_difference: dateDifference,
    text_matched: counterpartyExact || counterpartyIncludes || commonTokens.length > 0,
    match_detail: counterpartyExact ? '거래처 일치' : counterpartyIncludes ? '거래처 일부 일치' : commonTokens.length ? '적요 공통어 일치' : '문자열 일치 없음'
  };
}

function getReconciliationCandidates_(bank, ledgers) {
  return ledgers.map(function (ledger) {
    return scoreReconciliationCandidate_(bank, ledger);
  }).filter(Boolean).sort(function (left, right) {
    return right.score - left.score || left.date_difference - right.date_difference ||
      String(left.transaction_id).localeCompare(String(right.transaction_id));
  });
}

function reconciliationNote_(reason, candidates, method) {
  return JSON.stringify({
    method: method || 'auto',
    reason: reason || '',
    candidate_transaction_ids: (candidates || []).map(function (item) { return item.transaction_id; }),
    candidates: candidates || []
  });
}

function parseReconciliationNote_(value) {
  try {
    var parsed = JSON.parse(String(value || ''));
    return parsed && typeof parsed === 'object' ? parsed : { reason: String(value || '') };
  } catch (error) {
    return { reason: String(value || '') };
  }
}

function isValidManualReconciliation_(row, approvedExpenseIndex) {
  if (!row || !row.transaction_id || !approvedExpenseIndex[row.transaction_id]) return false;
  var note = parseReconciliationNote_(row.note);
  return row.status === '수동연결' || note.method === 'manual' || String(row.note || '').indexOf('수동 연결') > -1;
}

function buildAutomaticReconciliationResults_(banks, ledgers, existingRows) {
  var approvedExpenseIndex = indexBy_(ledgers, 'transaction_id');
  var manualBankIds = {};
  var reservedLedgerIds = {};
  (existingRows || []).forEach(function (row) {
    if (isValidManualReconciliation_(row, approvedExpenseIndex)) {
      manualBankIds[row.bank_transaction_id] = true;
      reservedLedgerIds[row.transaction_id] = true;
    }
  });

  var provisional = banks.filter(function (bank) {
    return !manualBankIds[bank.bank_transaction_id];
  }).map(function (bank) {
    var candidates = getReconciliationCandidates_(bank, ledgers);
    if (!candidates.length) {
      return {
        bank: bank,
        status: '장부 누락 의심',
        action_label: '장부 등록',
        candidates: [],
        reason: '금액과 거래일 조건이 일치하는 승인 지출 장부가 없습니다.'
      };
    }

    var best = candidates[0];
    var uniqueBest = candidates.length === 1 || best.score > candidates[1].score;
    if (!best.text_matched || !uniqueBest || reservedLedgerIds[best.transaction_id]) {
      return {
        bank: bank,
        status: '확인 필요',
        action_label: '후보 보기',
        candidates: candidates.slice(0, 5),
        reason: reservedLedgerIds[best.transaction_id]
          ? '가장 가까운 장부가 다른 계좌 거래에 수동 연결되어 있습니다.'
          : !best.text_matched
            ? '금액과 날짜는 일치하지만 거래처 또는 적요를 확인해야 합니다.'
            : '점수가 같은 장부 후보가 여러 개라 수동 확인이 필요합니다.'
      };
    }

    return {
      bank: bank,
      status: '정상',
      action_label: '장부 상세보기',
      candidates: candidates.slice(0, 5),
      transaction_id: best.transaction_id,
      reason: '금액, 거래일, 거래처 또는 적요가 일치합니다.'
    };
  });

  var claims = {};
  provisional.forEach(function (result) {
    if (result.status !== '정상') return;
    if (!claims[result.transaction_id]) claims[result.transaction_id] = [];
    claims[result.transaction_id].push(result);
  });
  Object.keys(claims).forEach(function (transactionId) {
    if (claims[transactionId].length < 2) return;
    claims[transactionId].forEach(function (result) {
      result.status = '확인 필요';
      result.action_label = '후보 보기';
      result.transaction_id = '';
      result.reason = '여러 계좌 거래가 같은 장부를 최우선 후보로 선택했습니다.';
    });
  });

  return provisional.map(function (result) {
    var bank = result.bank;
    var linkedLedger = result.transaction_id ? approvedExpenseIndex[result.transaction_id] : null;
    return {
      reconciliation_id: '',
      transaction_id: linkedLedger ? linkedLedger.transaction_id : '',
      bank_transaction_id: bank.bank_transaction_id,
      transaction_date: bank.transaction_date,
      ledger_description: linkedLedger ? ([linkedLedger.counterparty, linkedLedger.description].filter(Boolean).join(' · ')) : '',
      bank_description: bank.counterparty || bank.description || '',
      amount: Number(bank.amount || 0),
      difference_amount: linkedLedger ? 0 : Number(bank.amount || 0),
      status: result.status,
      action_label: result.action_label,
      note: reconciliationNote_(result.reason, result.candidates, 'auto'),
      created_at: nowIso_(),
      updated_at: nowIso_(),
      is_deleted: false
    };
  });
}

function upsertReconciliationResults_(results) {
  var existingRows = readSheetObjects_(LEDGER_EXT_DB.reconciliationSheet);
  var existingByBank = indexBy_(existingRows, 'bank_transaction_id');
  var approvedExpenseIndex = getApprovedExpenseLedgerIndex_();
  var savedCount = 0;
  var preservedManualCount = 0;

  results.forEach(function (result) {
    var existing = existingByBank[result.bank_transaction_id];
    if (existing && isValidManualReconciliation_(existing, approvedExpenseIndex)) {
      preservedManualCount += 1;
      return;
    }
    if (existing) {
      var changes = Object.assign({}, result, {
        reconciliation_id: existing.reconciliation_id,
        created_at: existing.created_at || result.created_at
      });
      delete changes.reconciliation_id;
      delete changes.created_at;
      updateSheetRow_(LEDGER_EXT_DB.reconciliationSheet, 'reconciliation_id', existing.reconciliation_id, changes);
    } else {
      result.reconciliation_id = makeId_('REC');
      appendObject_(LEDGER_EXT_DB.reconciliationSheet, LEDGER_EXT_DB.reconciliationHeaders, result);
      existingByBank[result.bank_transaction_id] = result;
    }
    savedCount += 1;
  });

  return { savedCount: savedCount, preservedManualCount: preservedManualCount };
}

function runAutomaticReconciliation_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var banks = getActiveBankExpenseTransactions_();
    var activeBankIndex = indexBy_(banks, 'bank_transaction_id');
    var ledgers = getApprovedExpenseLedgerEntries_();
    var existingRows = readSheetObjects_(LEDGER_EXT_DB.reconciliationSheet)
      .filter(function (row) {
        return !toBoolean_(row.is_deleted) && activeBankIndex[row.bank_transaction_id];
      });
    var results = buildAutomaticReconciliationResults_(banks, ledgers, existingRows);
    var saveSummary = upsertReconciliationResults_(results);
    return {
      totalCount: results.length + saveSummary.preservedManualCount,
      normalCount: results.filter(function (item) { return item.status === '정상'; }).length + saveSummary.preservedManualCount,
      reviewCount: results.filter(function (item) { return item.status === '확인 필요'; }).length,
      missingCount: results.filter(function (item) { return item.status === '장부 누락 의심'; }).length,
      savedCount: saveSummary.savedCount,
      preservedManualCount: saveSummary.preservedManualCount
    };
  } finally {
    lock.releaseLock();
  }
}

function buildBankTransactionRow_(transaction) {
  var transactionDate = String(transaction.transaction_date || '').trim();
  var counterparty = normalizeBankDuplicateText_(transaction.counterparty || transaction.bank_description);
  var amount = -Math.abs(Number(transaction.withdrawal_amount || transaction.amount || 0));
  var fileName = String(transaction.source_file_name || transaction.file_name || '').trim();
  if (!transactionDate || !counterparty || !amount || !fileName) {
    throw new Error('필수값이 없는 계좌 거래는 저장할 수 없습니다.');
  }

  return {
    bank_transaction_id: '',
    transaction_date: transactionDate,
    counterparty: counterparty,
    description: String(transaction.description || '은행 OCR 지출 거래').trim().slice(0, 200),
    amount: amount,
    file_name: fileName,
    created_at: nowIso_(),
    is_deleted: false
  };
}

function getExistingBankTransactionKeys_(rows) {
  return rows.reduce(function (index, row) {
    if (!toBoolean_(row.is_deleted)) {
      index[buildBankTransactionDuplicateKey_(row)] = row;
    }
    return index;
  }, {});
}

function buildBankTransactionDuplicateKey_(transaction) {
  return [
    String(transaction.file_name || transaction.source_file_name || '').trim().toLowerCase(),
    stringifyDate_(transaction.transaction_date),
    normalizeBankDuplicateText_(transaction.counterparty || transaction.bank_description).toLowerCase(),
    Number(transaction.amount || 0)
  ].join('|');
}

function normalizeBankDuplicateText_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function makeUniqueBankTransactionId_(existingIds) {
  var id = '';
  do {
    id = makeId_('BNK');
  } while (existingIds[id]);
  return id;
}

function saveBankOcrLog_(result) {
  result = result || {};
  var rawText = String(result.raw_text || '');
  var storedText = rawText.slice(0, 45000);
  if (rawText.length > storedText.length) {
    storedText += '\n\n[원문이 45,000자를 초과하여 일부만 저장되었습니다.]';
  }
  if (/^[=+@]/.test(storedText)) storedText = "'" + storedText;

  var row = {
    ocr_log_id: makeId_('OCR'),
    file_name: String(result.file_name || ''),
    file_type: String(result.file_type || ''),
    file_size: Number(result.file_size || 0),
    ocr_status: result.ocr_status || '실패',
    parse_status: result.parse_status || '미실행',
    text_length: Number(result.text_length || rawText.length || 0),
    raw_text: storedText,
    extracted_transaction_count: Number(result.extracted_transaction_count || 0),
    expense_count: Number(result.expense_count || 0),
    review_count: Number(result.review_count || 0),
    error_message: String(result.error_message || '').slice(0, 1000),
    created_at: nowIso_(),
    is_deleted: false
  };
  appendObject_(LEDGER_EXT_DB.bankOcrLogSheet, LEDGER_EXT_DB.bankOcrLogHeaders, row);
  return normalizeBankOcrLog_(row);
}

function normalizeBankOcrLog_(row) {
  return {
    ocr_log_id: row.ocr_log_id || '',
    file_name: row.file_name || '',
    file_type: row.file_type || '',
    file_size: Number(row.file_size || 0),
    ocr_status: row.ocr_status || '실패',
    parse_status: row.parse_status || '미실행',
    text_length: Number(row.text_length || 0),
    raw_text: String(row.raw_text || '').replace(/^'(?=[=+@])/, ''),
    extracted_transaction_count: Number(row.extracted_transaction_count || 0),
    expense_count: Number(row.expense_count || 0),
    review_count: Number(row.review_count || 0),
    error_message: row.error_message || '',
    created_at: stringifyDateTime_(row.created_at)
  };
}

function apiV1_getBankOcrLogs(request) {
  initLedgerDatabase();
  request = request || {};
  var limit = Math.min(50, Math.max(1, Number(request.limit || 10)));
  return {
    items: readSheetObjects_(LEDGER_EXT_DB.bankOcrLogSheet)
      .filter(function (row) { return !toBoolean_(row.is_deleted); })
      .map(normalizeBankOcrLog_)
      .sort(function (left, right) {
        return String(right.created_at || '').localeCompare(String(left.created_at || ''));
      })
      .slice(0, limit)
  };
}

function normalizeBankUploadFile_(file) {
  file = file || {};
  var fileName = String(file.file_name || file.name || '').trim();
  var fileType = String(file.file_type || file.mime_type || '').trim().toLowerCase();
  if (!fileType) fileType = bankMimeTypeFromName_(fileName);
  return {
    file_name: fileName,
    file_type: fileType,
    file_size: Number(file.file_size || 0),
    content_base64: String(file.content_base64 || file.data || '').replace(/^data:[^,]+,/, '')
  };
}

function bankMimeTypeFromName_(fileName) {
  var extension = String(fileName || '').toLowerCase().split('.').pop();
  return {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    pdf: 'application/pdf'
  }[extension] || 'application/octet-stream';
}

function validateBankOcrFile_(file) {
  if (!file.file_name) throw new Error('파일명이 없습니다.');
  if (!file.content_base64) throw new Error('파일 내용이 없습니다.');
  var supportedMimeTypes = [
    'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/bmp', 'image/webp', 'application/pdf'
  ];
  if (supportedMimeTypes.indexOf(file.file_type) === -1) {
    throw new Error('OCR은 현재 이미지 또는 PDF 파일만 지원합니다.');
  }
}

function extractBankOcrText_(file) {
  var bytes = Utilities.base64Decode(file.content_base64);
  var blob = Utilities.newBlob(bytes, file.file_type, sanitizeFileName_(file.file_name));
  var documentId = '';

  try {
    var created = Drive.Files.create({
      name: 'OCR_' + sanitizeFileName_(file.file_name),
      mimeType: 'application/vnd.google-apps.document'
    }, blob, {
      ocrLanguage: 'ko',
      fields: 'id'
    });
    documentId = created.id;
    return DocumentApp.openById(documentId).getBody().getText() || '';
  } finally {
    if (documentId) {
      try {
        Drive.Files.remove(documentId);
      } catch (removeError) {
        try {
          DriveApp.getFileById(documentId).setTrashed(true);
        } catch (trashError) {
          // OCR 결과 반환을 유지하기 위해 임시 파일 정리 실패는 별도로 전파하지 않는다.
        }
      }
    }
  }
}

function parseBankOcrTransactions_(ocrText, file, fileIndex, baseYear) {
  var lines = String(ocrText || '')
    .replace(/\r/g, '\n')
    .split(/\n+/)
    .map(function (line) { return line.replace(/[\u00a0\t]+/g, ' ').replace(/\s+/g, ' ').trim(); })
    .filter(Boolean);
  var blocks = buildBankTransactionBlocks_(lines);
  var items = [];
  var reviewRequiredItems = [];

  blocks.forEach(function (block, blockIndex) {
    var parsed = parseBankTransactionBlock_(block, baseYear);
    if (parsed.skip) return;

    var common = {
      bank_transaction_id: 'BANK-OCR-' + (fileIndex + 1) + '-' + (blockIndex + 1),
      transaction_date: parsed.transaction_date || '',
      counterparty: parsed.counterparty || '',
      withdrawal_amount: parsed.withdrawal_amount || 0,
      source_file_name: file.file_name,
      source_file_index: fileIndex,
      source_transaction_index: blockIndex,
      transaction_type: parsed.isExpense ? '지출' : '',
      description: parsed.description || '',
      raw_text: block.join(' | ')
    };

    if (parsed.reviewReason) {
      common.review_reason = parsed.reviewReason;
      reviewRequiredItems.push(common);
      return;
    }

    items.push(Object.assign({}, common, {
      reconciliation_id: '',
      transaction_id: '',
      bank_description: common.counterparty,
      ledger_description: '',
      amount: -Math.abs(common.withdrawal_amount),
      difference_amount: -Math.abs(common.withdrawal_amount),
      status: '확인 필요',
      action_label: '확인',
      note: 'OCR로 추출된 지출 거래이며 아직 장부와 매칭되지 않았습니다.'
    }));
  });

  return {
    extractedTransactionCount: blocks.length,
    items: items,
    reviewRequiredItems: reviewRequiredItems
  };
}

function buildBankTransactionBlocks_(lines) {
  var blocks = [];
  var current = [];

  lines.forEach(function (line) {
    if (containsBankDate_(line)) {
      if (current.length) blocks.push(current);
      current = [line];
      return;
    }
    if (current.length && current.length < 10) current.push(line);
  });
  if (current.length) blocks.push(current);
  return blocks;
}

function parseBankTransactionBlock_(block, baseYear) {
  var text = block.join('\n');
  var transactionDate = extractBankDate_(text, baseYear);
  var expenseKeyword = /(출금(?:액)?|지출|이체출금|자동이체|카드\s*결제|체크\s*카드|송금|ATM\s*출금)/i.test(text);
  var incomeKeyword = /(입금(?:액)?|수입|이체입금|급여|환급)/i.test(text);
  var withdrawalAmount = extractBankWithdrawalAmount_(text);
  var hasNegativeAmount = /(?:^|\s)-\s*(?:₩|￦)?\s*\d[\d,]*(?:\s*원)?(?:\s|$)/m.test(text);

  if (incomeKeyword && !expenseKeyword && !hasNegativeAmount) return { skip: true };
  if (!transactionDate) {
    return { reviewReason: '거래일을 확인할 수 없습니다.', isExpense: false, withdrawal_amount: withdrawalAmount };
  }
  if (!withdrawalAmount) {
    return { reviewReason: '출금액을 확인할 수 없습니다.', transaction_date: transactionDate, isExpense: false };
  }
  if (!expenseKeyword && !hasNegativeAmount) {
    return {
      reviewReason: '입금과 출금 중 어느 거래인지 확실하지 않습니다.',
      transaction_date: transactionDate,
      counterparty: extractBankCounterparty_(block),
      withdrawal_amount: withdrawalAmount,
      isExpense: false
    };
  }

  var counterparty = extractBankCounterparty_(block);
  if (!counterparty) {
    return {
      reviewReason: '거래처 또는 출금처를 확인할 수 없습니다.',
      transaction_date: transactionDate,
      withdrawal_amount: withdrawalAmount,
      description: extractBankDescription_(text),
      isExpense: true
    };
  }

  return {
    transaction_date: transactionDate,
    counterparty: counterparty,
    withdrawal_amount: withdrawalAmount,
    description: extractBankDescription_(text),
    isExpense: true
  };
}

function extractBankDescription_(text) {
  var value = String(text || '');
  var labeled = value.match(/(?:거래\s*내용|내용|적요)\s*[:：]?\s*([^\n]+)/i);
  if (labeled) return String(labeled[1] || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (/체크\s*카드/i.test(value)) return '체크카드 결제';
  if (/카드\s*결제/i.test(value)) return '카드 결제';
  if (/자동이체/i.test(value)) return '자동이체';
  if (/이체출금/i.test(value)) return '이체출금';
  if (/ATM\s*출금/i.test(value)) return 'ATM 출금';
  if (/송금/i.test(value)) return '송금';
  return '은행 OCR 지출 거래';
}

function containsBankDate_(value) {
  return /(?:20\d{2}[.\/-]\s*\d{1,2}[.\/-]\s*\d{1,2}|20\d{2}\s*년\s*\d{1,2}\s*월\s*\d{1,2}\s*일|(?:^|\s)\d{1,2}[.\/-]\s*\d{1,2}(?:\s|$)|\d{1,2}\s*월\s*\d{1,2}\s*일)/.test(String(value || ''));
}

function extractBankDate_(value, baseYear) {
  var text = String(value || '');
  var match = text.match(/(20\d{2})\s*(?:[.\/-]|년)\s*(\d{1,2})\s*(?:[.\/-]|월)\s*(\d{1,2})(?:\s*일)?/);
  var year;
  var month;
  var day;

  if (match) {
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    match = text.match(/(?:^|\s)(\d{1,2})\s*(?:[.\/-]|월)\s*(\d{1,2})(?:\s*일)?(?:\s|$)/);
    if (!match) return '';
    year = Number(baseYear) || Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy'));
    month = Number(match[1]);
    day = Number(match[2]);
  }

  var date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '';
  return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}

function extractBankWithdrawalAmount_(text) {
  var labeled = String(text || '').match(/(?:출금(?:액)?|지출|이체출금|자동이체|카드\s*결제|체크\s*카드|송금|ATM\s*출금)\s*[:：]?\s*-?\s*(?:₩|￦)?\s*([\d,]+)\s*원?/i);
  if (labeled) return bankAmountNumber_(labeled[1]);

  var negative = String(text || '').match(/(?:^|\s)-\s*(?:₩|￦)?\s*([\d,]+)\s*원?(?:\s|$)/m);
  if (negative) return bankAmountNumber_(negative[1]);

  var candidateText = String(text || '')
    .split('\n')
    .filter(function (line) { return !/(잔액|거래\s*후)/i.test(line); })
    .join('\n')
    .replace(/20\d{2}[.\/-]\d{1,2}[.\/-]\d{1,2}/g, ' ')
    .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' ');
  var candidates = candidateText.match(/(?:₩|￦)?\s*\d{1,3}(?:,\d{3})+\s*원?|(?:₩|￦)\s*\d+\s*원?|\d+\s*원/g);
  if (candidates && candidates.length) return bankAmountNumber_(candidates[0]);
  return 0;
}

function bankAmountNumber_(value) {
  var amount = Number(String(value || '').replace(/[^\d]/g, ''));
  return isFinite(amount) && amount > 0 ? amount : 0;
}

function extractBankCounterparty_(block) {
  var text = block.join('\n');
  var labeled = text.match(/(?:거래처|출금처|받는\s*분|상대\s*계좌명|예금주|가맹점)\s*[:：]?\s*([^\n]+)/i);
  if (labeled) return cleanBankCounterparty_(labeled[1]);

  var candidates = block.filter(function (line) {
    if (containsBankDate_(line)) return false;
    if (/(출금|입금|지출|잔액|거래\s*후|계좌|금액|일시|시간|구분|내용|적요|송금|카드|ATM)/i.test(line)) return false;
    if (/^[\d\s,.:/\-₩￦원]+$/.test(line)) return false;
    return /[가-힣A-Za-z]/.test(line);
  });
  if (candidates.length) return cleanBankCounterparty_(candidates[0]);

  for (var index = 0; index < block.length; index += 1) {
    if (!containsBankDate_(block[index])) continue;
    var inlineCounterparty = String(block[index] || '')
      .replace(/20\d{2}\s*(?:[.\/-]|년)\s*\d{1,2}\s*(?:[.\/-]|월)\s*\d{1,2}(?:\s*일)?/g, ' ')
      .replace(/(?:^|\s)\d{1,2}\s*(?:[.\/-]|월)\s*\d{1,2}(?:\s*일)?(?:\s|$)/g, ' ')
      .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' ')
      .replace(/-?\s*(?:₩|￦)?\s*\d[\d,]*\s*원?/g, ' ')
      .replace(/출금(?:액)?|지출|이체출금|자동이체|카드\s*결제|체크\s*카드|송금|ATM\s*출금/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (/[가-힣A-Za-z]/.test(inlineCounterparty)) return cleanBankCounterparty_(inlineCounterparty);
  }
  return '';
}

function cleanBankCounterparty_(value) {
  return String(value || '')
    .replace(/(?:출금|입금|잔액)\s*[:：]?.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}

function bankOcrErrorMessage_(error) {
  var message = error && error.message ? String(error.message) : String(error || 'OCR 처리에 실패했습니다.');
  if (/Drive is not defined|not enabled|accessNotConfigured/i.test(message)) {
    return 'Google Drive OCR 서비스를 사용할 수 없습니다. Drive API 설정과 권한을 확인해 주세요.';
  }
  return message.slice(0, 240);
}

function apiV1_getReconciliationList(filter) {
  initLedgerDatabase();
  filter = filter || {};
  var keyword = String(filter.keyword || '').trim().toLowerCase();
  var approvedExpenseIndex = getApprovedExpenseLedgerIndex_();
  var bankIndex = indexBy_(getActiveBankExpenseTransactions_(), 'bank_transaction_id');
  var evidenceIndex = readSheetObjects_(LEDGER_DB.evidenceSheet)
    .map(normalizeEvidenceRow_)
    .filter(function (item) { return !toBoolean_(item.is_deleted); })
    .reduce(function (index, item) {
      index[item.transaction_id] = true;
      return index;
    }, {});
  var items = getOfficialReconciliationRows_()
    .map(function (item) {
      return normalizeReconciliationItem_(item, approvedExpenseIndex, bankIndex, evidenceIndex);
    });

  if (keyword) {
    items = items.filter(function (item) {
      return [item.ledger_description, item.bank_description, item.status, item.action_label]
        .join(' ').toLowerCase().indexOf(keyword) > -1;
    });
  }

  return {
    items: items,
    summary: buildReconciliationSummary_()
  };
}

function apiV1_getReconciliationDetail(reconciliationId) {
  var item = apiV1_getReconciliationList({}).items.filter(function (row) {
    return row.reconciliation_id === reconciliationId;
  })[0];
  return item || null;
}

function apiV1_getReconciliationCandidates(request) {
  request = request || {};
  var reconciliationId = typeof request === 'string' ? request : request.reconciliation_id;
  var row = readSheetObjects_(LEDGER_EXT_DB.reconciliationSheet).filter(function (item) {
    return !toBoolean_(item.is_deleted) && item.reconciliation_id === reconciliationId;
  })[0];
  if (!row) throw new Error('대조 결과를 찾을 수 없습니다.');

  var ledgers = getApprovedExpenseLedgerEntries_();
  var ledgerIndex = indexBy_(ledgers, 'transaction_id');
  var note = parseReconciliationNote_(row.note);
  var scores = {};
  (note.candidates || []).forEach(function (candidate) {
    scores[candidate.transaction_id] = candidate;
  });
  var candidateIds = note.candidate_transaction_ids || [];

  if (!candidateIds.length) {
    var bank = getActiveBankExpenseTransactions_().filter(function (item) {
      return item.bank_transaction_id === row.bank_transaction_id;
    })[0];
    if (bank) {
      var recalculated = getReconciliationCandidates_(bank, ledgers).slice(0, 5);
      candidateIds = recalculated.map(function (candidate) { return candidate.transaction_id; });
      recalculated.forEach(function (candidate) { scores[candidate.transaction_id] = candidate; });
    }
  }

  return {
    reconciliation_id: reconciliationId,
    reason: note.reason || String(row.note || ''),
    items: candidateIds.map(function (transactionId) {
      var ledger = ledgerIndex[transactionId];
      if (!ledger) return null;
      var score = scores[transactionId] || {};
      return {
        transaction_id: ledger.transaction_id,
        transaction_date: ledger.transaction_date,
        department_name: ledger.department_name,
        counterparty: ledger.counterparty,
        description: ledger.description,
        amount: Number(ledger.amount || 0),
        score: Number(score.score || 0),
        date_difference: Number(score.date_difference || 0),
        match_detail: score.match_detail || ''
      };
    }).filter(Boolean)
  };
}

function apiV1_linkReconciliation(request) {
  request = request || {};
  var approvedExpenseIndex = getApprovedExpenseLedgerIndex_();
  var ledger = approvedExpenseIndex[request.transaction_id];
  if (!ledger) throw new Error('승인된 지출 장부만 대조 결과에 연결할 수 있습니다.');

  var duplicateLink = getOfficialReconciliationRows_().filter(function (row) {
    return row.reconciliation_id !== request.reconciliation_id && row.transaction_id === request.transaction_id;
  })[0];
  if (duplicateLink) throw new Error('이 장부는 이미 다른 계좌 거래에 연결되어 있습니다.');

  updateSheetRow_(LEDGER_EXT_DB.reconciliationSheet, 'reconciliation_id', request.reconciliation_id, {
    transaction_id: ledger.transaction_id,
    ledger_description: [ledger.counterparty, ledger.description].filter(Boolean).join(' · '),
    difference_amount: 0,
    status: '정상',
    action_label: '장부 상세보기',
    note: reconciliationNote_('사용자가 후보 장부를 확인하여 연결했습니다.', [{
      transaction_id: ledger.transaction_id,
      transaction_date: ledger.transaction_date,
      counterparty: ledger.counterparty,
      description: ledger.description,
      amount: Number(ledger.amount || 0),
      score: 100,
      date_difference: 0,
      text_matched: true,
      match_detail: '수동 연결'
    }], 'manual'),
    updated_at: nowIso_()
  });
  appendProcessLog_('RECONCILIATION', request.reconciliation_id, 'manual-link', '대조 결과를 승인된 지출 장부와 수동 연결했습니다.');
  return { ok: true, item: apiV1_getReconciliationDetail(request.reconciliation_id) };
}

function apiV1_createLedgerFromReconciliation(request) {
  request = request || {};
  var reconciliation = apiV1_getReconciliationDetail(request.reconciliation_id);
  if (!reconciliation) throw new Error('Reconciliation not found.');

  var created = saveLedgerEntry_({
    transaction_type: Number(reconciliation.amount || 0) >= 0 ? '수입' : '지출',
    transaction_date: reconciliation.transaction_date,
    department_name: request.department_name || '사무국',
    amount: Math.abs(Number(reconciliation.amount || 0)),
    counterparty: reconciliation.bank_description,
    event_name: request.event_name || '해당없음',
    description: reconciliation.ledger_description || reconciliation.bank_description,
    note: '계좌 대조 결과에서 생성',
    has_evidence: false
  }, '대기');

  appendProcessLog_('RECONCILIATION', request.reconciliation_id, 'create-ledger', '계좌 대조 결과에서 대기 상태의 장부 항목을 생성했습니다. 승인 후 대조 결과에 연결할 수 있습니다.');
  return created;
}

function apiV1_getSettlementSummary(filter) {
  var items = filterLedgerEntries_(getApprovedLedgerEntries_(), filter || {});
  var approvedTransactionIds = items.reduce(function (index, item) {
    index[item.transaction_id] = true;
    return index;
  }, {});
  var approvedEventIds = items.reduce(function (index, item) {
    if (item.event_id) index[item.event_id] = true;
    return index;
  }, {});
  var totalIncome = items.reduce(function (sum, item) {
    return sum + (item.transaction_type === '수입' ? Number(item.amount || 0) : 0);
  }, 0);
  var totalExpense = items.reduce(function (sum, item) {
    return sum + (item.transaction_type === '지출' ? Number(item.amount || 0) : 0);
  }, 0);
  return {
    period_name: '2026년도 상반기',
    totalIncome: totalIncome,
    totalExpense: totalExpense,
    balance: totalIncome - totalExpense,
    eventCount: Object.keys(approvedEventIds).length,
    evidenceCount: readSheetObjects_(LEDGER_DB.evidenceSheet).filter(function (evidence) {
      return !toBoolean_(evidence.is_deleted) && approvedTransactionIds[evidence.transaction_id];
    }).length
  };
}

function apiV1_generateSettlementReport(request) {
  initLedgerDatabase();
  request = request || {};
  var summary = apiV1_getSettlementSummary(request.filter || {});
  var report = {
    report_id: makeId_('RPT'),
    period_name: request.period_name || summary.period_name,
    event_name: request.event_name || '전체 행사',
    total_income: summary.totalIncome,
    total_expense: summary.totalExpense,
    balance: summary.balance,
    evidence_count: summary.evidenceCount,
    report_status: '생성완료',
    created_at: nowIso_(),
    updated_at: nowIso_(),
    is_deleted: false
  };
  appendObject_(LEDGER_EXT_DB.settlementReportSheet, LEDGER_EXT_DB.settlementReportHeaders, report);
  appendProcessLog_('SETTLEMENT_REPORT', report.report_id, 'generate', '결산 보고서를 생성했습니다.');
  return { ok: true, report: normalizeSettlementReport_(report), summary: summary };
}

function apiV1_getSettlementReport(reportId) {
  initLedgerDatabase();
  var reports = readSheetObjects_(LEDGER_EXT_DB.settlementReportSheet)
    .filter(function (report) { return !toBoolean_(report.is_deleted); })
    .map(normalizeSettlementReport_);
  if (reportId) {
    return reports.filter(function (report) { return report.report_id === reportId; })[0] || null;
  }
  return reports[reports.length - 1] || apiV1_generateSettlementReport({}).report;
}

function apiV1_exportSettlementReport(request) {
  var report = apiV1_getSettlementReport(request && request.report_id);
  appendProcessLog_('SETTLEMENT_REPORT', report.report_id, 'export', '결산 보고서 내보내기를 요청했습니다.');
  return {
    ok: true,
    export: {
      fileName: 'settlement_report_' + report.report_id + '.xlsx',
      format: request && request.format || 'xlsx',
      generatedAt: nowIso_(),
      report: report
    }
  };
}

function apiV1_getEvidenceAuditList(filter) {
  initLedgerDatabase();
  var evidenceRows = readSheetObjects_(LEDGER_DB.evidenceSheet).filter(function (item) {
    return !toBoolean_(item.is_deleted);
  });
  var logs = readSheetObjects_(LEDGER_EXT_DB.processLogSheet).filter(function (item) {
    return !toBoolean_(item.is_deleted);
  });

  var items = evidenceRows.map(function (evidence, index) {
    return {
      audit_id: evidence.evidence_id || 'EVD-' + (index + 1),
      sequence: padNumber_(index + 1, 3),
      evidence_name: evidence.file_name || '증빙자료',
      upload_status: evidence.file_path ? '완료' : '미제출',
      actor: '운영자',
      changed_at: stringifyDateTime_(evidence.updated_at || evidence.created_at),
      file_path: evidence.file_path || ''
    };
  });

  logs.filter(function (log) { return log.target_type === 'EVIDENCE'; }).forEach(function (log) {
    items.push({
      audit_id: log.log_id,
      sequence: '-',
      evidence_name: log.message,
      upload_status: log.action,
      actor: log.actor,
      changed_at: stringifyDateTime_(log.created_at),
      file_path: ''
    });
  });

  return { items: items };
}

function removeLegacyReconciliationMockData_() {
  var properties = PropertiesService.getScriptProperties();
  if (properties.getProperty(LEGACY_RECONCILIATION_MOCK_CLEANUP_KEY) === 'done') return;

  deleteSheetRowsByIds_(
    LEDGER_EXT_DB.reconciliationSheet,
    'reconciliation_id',
    ['REC-001', 'REC-002', 'REC-003']
  );
  deleteSheetRowsByIds_(
    LEDGER_EXT_DB.bankTransactionSheet,
    'bank_transaction_id',
    ['BNK-20240801-001', 'BNK-20240802-001', 'BNK-20240803-001']
  );
  properties.setProperty(LEGACY_RECONCILIATION_MOCK_CLEANUP_KEY, 'done');
}

function deleteSheetRowsByIds_(sheetName, idField, ids) {
  var sheet = getDbSheet_(sheetName);
  if (sheet.getLastRow() < 2) return 0;

  var values = sheet.getDataRange().getValues();
  var idColumn = values[0].indexOf(idField);
  if (idColumn < 0) return 0;
  var idIndex = ids.reduce(function (index, id) {
    index[id] = true;
    return index;
  }, {});
  var deletedCount = 0;

  for (var rowIndex = values.length - 1; rowIndex >= 1; rowIndex -= 1) {
    if (!idIndex[String(values[rowIndex][idColumn] || '')]) continue;
    sheet.deleteRow(rowIndex + 1);
    deletedCount += 1;
  }
  return deletedCount;
}

function getOfficialReconciliationRows_() {
  var approvedLedgerIndex = getApprovedExpenseLedgerIndex_();
  var activeBankIndex = indexBy_(getActiveBankExpenseTransactions_(), 'bank_transaction_id');
  return readSheetObjects_(LEDGER_EXT_DB.reconciliationSheet)
    .filter(function (item) {
      return !toBoolean_(item.is_deleted) && activeBankIndex[item.bank_transaction_id];
    })
    .map(function (item) {
      if (!item.transaction_id || approvedLedgerIndex[item.transaction_id]) {
        if (item.status !== '불일치') return item;
        var legacy = Object.assign({}, item);
        legacy.status = '장부 누락 의심';
        legacy.action_label = '장부 등록';
        return legacy;
      }

      var sanitized = Object.assign({}, item);
      sanitized.transaction_id = '';
      sanitized.ledger_description = '';
      sanitized.difference_amount = Number(sanitized.amount || 0);
      sanitized.status = '장부 누락 의심';
      sanitized.action_label = '장부 등록';
      sanitized.note = reconciliationNote_('연결된 장부가 승인된 지출 상태가 아니므로 대조 대상에서 제외했습니다.', [], 'auto');
      return sanitized;
    });
}

function normalizeReconciliationItem_(item, approvedExpenseIndex, bankIndex, evidenceIndex) {
  approvedExpenseIndex = approvedExpenseIndex || {};
  bankIndex = bankIndex || {};
  evidenceIndex = evidenceIndex || {};
  var ledger = approvedExpenseIndex[item.transaction_id] || null;
  var bank = bankIndex[item.bank_transaction_id] || {};
  var note = parseReconciliationNote_(item.note);
  return {
    reconciliation_id: item.reconciliation_id,
    transaction_id: item.transaction_id || '',
    bank_transaction_id: item.bank_transaction_id || '',
    transaction_date: stringifyDate_(item.transaction_date),
    ledger_description: item.ledger_description || '',
    bank_description: item.bank_description || '',
    amount: Number(item.amount || 0),
    difference_amount: Number(item.difference_amount || 0),
    status: item.status || '대기',
    action_label: item.action_label || '상세보기',
    note: item.note || '',
    match_reason: note.reason || String(item.note || ''),
    candidate_transaction_ids: note.candidate_transaction_ids || [],
    candidate_count: (note.candidate_transaction_ids || []).length,
    source_file_name: bank.file_name || '',
    bank_counterparty: bank.counterparty || item.bank_description || '',
    bank_detail: bank.description || '',
    ledger_amount: ledger ? -Math.abs(Number(ledger.amount || 0)) : null,
    has_evidence: ledger ? Boolean(evidenceIndex[ledger.transaction_id]) : false
  };
}

function normalizeSettlementReport_(report) {
  return {
    report_id: report.report_id,
    period_name: report.period_name,
    event_name: report.event_name,
    total_income: Number(report.total_income || 0),
    total_expense: Number(report.total_expense || 0),
    balance: Number(report.balance || 0),
    evidence_count: Number(report.evidence_count || 0),
    report_status: report.report_status || '생성완료',
    created_at: stringifyDateTime_(report.created_at)
  };
}

function buildReconciliationSummary_() {
  var items = getOfficialReconciliationRows_();
  return {
    totalCount: items.length,
    matchedCount: items.filter(function (item) { return item.status === '정상' || item.status === '수동연결'; }).length,
    reviewCount: items.filter(function (item) { return item.status === '확인 필요'; }).length,
    missingCount: items.filter(function (item) { return item.status === '장부 누락 의심' || item.status === '불일치'; }).length
  };
}

function updateSheetRow_(sheetName, key, keyValue, changes) {
  var sheet = getDbSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  var headers = values[0] || [];
  var keyCol = headers.indexOf(key);
  if (keyCol < 0) throw new Error('Key not found: ' + key);

  for (var i = 1; i < values.length; i += 1) {
    if (String(values[i][keyCol]) === String(keyValue)) {
      Object.keys(changes).forEach(function (field) {
        var col = headers.indexOf(field);
        if (col > -1) sheet.getRange(i + 1, col + 1).setValue(changes[field]);
      });
      return true;
    }
  }
  throw new Error('Row not found: ' + keyValue);
}

function appendProcessLog_(targetType, targetId, action, message) {
  appendObject_(LEDGER_EXT_DB.processLogSheet, LEDGER_EXT_DB.processLogHeaders, {
    log_id: makeId_('LOG'),
    target_type: targetType,
    target_id: targetId,
    action: action,
    actor: getCurrentUserName_(),
    message: message,
    created_at: nowIso_(),
    is_deleted: false
  });
}

function padNumber_(value, length) {
  var text = String(value);
  while (text.length < length) text = '0' + text;
  return text;
}
