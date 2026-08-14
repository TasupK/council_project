// 1. 운영 DB 정보와 장부 조회
function api_getLedgerDatabaseInfo() {
  requireLoginContext_();
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

function api_getLedgerList(filter) {
  requireLoginContext_();
  var items = filterLedgerEntries_(getLedgerEntries_(), filter || {});
  return { items: items, page: { pageNo: 1, pageSize: items.length, totalCount: items.length } };
}

function api_getLedgerDetail(transactionId) {
  requireLoginContext_();
  return getLedgerEntries_().filter(function (item) {
    return String(item.transaction_id) === String(transactionId);
  })[0] || null;
}

function api_getLedgerEventOptions() {
  requireLoginContext_();
  var items = getLedgerEntries_();
  return readOperationTableRows_('events').map(function (event) {
    var balance = items.reduce(function (sum, item) {
      if (String(item.event_id) !== String(event.id)) return sum;
      return sum + (item.transaction_type === '수입' ? Number(item.amount) : -Number(item.amount));
    }, 0);
    return { event_id: event.id, event_name: event.name, balance: balance };
  });
}

// 2. 장부 등록과 상태 변경
function api_createLedgerEntry(request) {
  return saveLedgerEntry_(request || {});
}

function api_saveLedgerDraft(request) {
  // TODO(장부 임시저장): 운영 DB에 임시저장 상태 필드가 추가되면 별도 상태로 저장한다.
  return saveLedgerEntry_(request || {});
}

function api_processLedgerEntry(request) {
  requireLoginContext_();
  request = request || {};
  if (!request.transaction_id) throw new Error('transaction_id is required.');
  var status = request.action === 'approve' ? '정상' : '확인필요';
  updateOperationTableRow_('ledger', request.transaction_id, { matchStatus: status, updatedAt: getCurrentIsoDateTime_() });
  return { ok: true, transaction_id: request.transaction_id, status: status, item: api_getLedgerDetail(request.transaction_id) };
}
