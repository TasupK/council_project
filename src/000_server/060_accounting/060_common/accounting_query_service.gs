/** Accounting 화면용 read-only 조합과 DTO 변환 */

function getLedgerEntries_() {
  var evidenceByTransaction = groupBy_(findAllLedgerEvidenceRows_(), 'transactionId');
  var eventsById = findAllAccountingEventRows_().reduce(function (index, event) {
    index[event.id] = event;
    return index;
  }, {});
  return findAllLedgerRows_().map(function (item) {
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
  return {
    transaction_id: item.id,
    transaction_type: isTruthyValue_(item.expense) ? '지출' : '수입',
    transaction_date: formatDateTimeValue_(item.transactionAt),
    department_id: '',
    department_name: '',
    amount: Number(item.amount || 0),
    counterparty: item.counterparty || '',
    event_id: item.eventId || '',
    description: item.description || '',
    note: '',
    manager: item.managerId || '',
    status: item.matchStatus || '미확인',
    has_evidence: false,
    evidence: [],
    alert: '',
    created_at: formatDateTimeValue_(item.createdAt),
    updated_at: formatDateTimeValue_(item.updatedAt),
    is_deleted: false
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
  var items = getLedgerEntries_();
  return findAllAccountingEventRows_().map(function (event) {
    var balance = items.reduce(function (sum, item) {
      if (String(item.event_id) !== String(event.id)) return sum;
      return sum + (item.transaction_type === '수입' ? Number(item.amount) : -Number(item.amount));
    }, 0);
    return { event_id: event.id, event_name: event.name, balance: balance };
  });
}
