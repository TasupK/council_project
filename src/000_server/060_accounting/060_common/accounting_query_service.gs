/** Accounting 화면용 read-only 조합과 DTO 변환 */

function getLedgerEntriesData_() {
  var evidenceByTransaction = groupBy_(listLedgerEvidenceRows_(), 'transactionId');
  var eventsById = listAccountingEventRows_().reduce(function (index, event) {
    index[event.id] = event;
    return index;
  }, {});

  return listLedgerRows_().filter(function (item) {
    return String(item.recordStatus || 'ACTIVE') !== 'DELETED';
  }).map(function (item) {
    var dto = mapLedgerEntryDto_(item);
    dto.event_name = eventsById[item.eventId] ? eventsById[item.eventId].name : '해당없음';
    dto.evidence = (evidenceByTransaction[item.id] || []).map(mapEvidenceDto_);
    dto.has_evidence = dto.evidence.length > 0;
    return dto;
  }).sort(function (a, b) {
    return String(b.transaction_date).localeCompare(String(a.transaction_date));
  });
}

function mapLedgerEntryDto_(item) {
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

function mapEvidenceDto_(item) {
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

function getLedgerDetailData_(transactionId) {
  return getLedgerEntriesData_().filter(function (item) {
    return String(item.transaction_id) === String(transactionId);
  })[0] || null;
}

function getLedgerDatabaseInfoData_() {
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

function getLedgerEventOptionsData_() {
  var items = getLedgerEntriesData_().filter(function (item) { return item.record_status === 'ACTIVE'; });
  return listAccountingEventRows_().map(function (event) {
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

function getLedgerSummaryData_(filter) {
  var items = filterLedgerEntries_(getLedgerEntriesData_(), filter || {});
  var active = items.filter(function (item) { return item.record_status === 'ACTIVE'; });
  return {
    totalIncome: active.reduce(function (sum, item) { return sum + (item.transaction_type === '수입' ? Number(item.amount || 0) : 0); }, 0),
    totalExpense: active.reduce(function (sum, item) { return sum + (item.transaction_type === '지출' ? Number(item.amount || 0) : 0); }, 0),
    pendingCount: active.filter(function (item) { return item.status === '미확인'; }).length,
    reviewCount: active.filter(function (item) { return item.status === '확인필요'; }).length,
    draftCount: items.filter(function (item) { return item.record_status === 'DRAFT'; }).length
  };
}
