// 1. 운영 DB 정보와 장부 조회
function api_getLedgerDatabaseInfo() {
  return apiHandler_({
    operation: 'getLedgerDatabaseInfo',
    requireLogin: true,
    service: function () {
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
  });
}

function api_getLedgerList(filter) {
  return apiHandler_({
    operation: 'getLedgerList',
    input: filter,
    requireLogin: true,
    service: function (request) {
      var items = filterLedgerEntries_(getLedgerEntries_(), request || {});
      return { items: items, page: { pageNo: 1, pageSize: items.length, totalCount: items.length } };
    }
  });
}

function api_getLedgerDetail(transactionId) {
  return apiHandler_({
    operation: 'getLedgerDetail',
    input: transactionId,
    requireLogin: true,
    service: function (id) {
      return getLedgerEntries_().filter(function (item) {
        return String(item.transaction_id) === String(id);
      })[0] || null;
    }
  });
}

function api_getLedgerEventOptions() {
  return apiHandler_({
    operation: 'getLedgerEventOptions',
    requireLogin: true,
    service: function () {
      var items = getLedgerEntries_();
      return findAllAccountingEventRows_().map(function (event) {
        var balance = items.reduce(function (sum, item) {
          if (String(item.event_id) !== String(event.id)) return sum;
          return sum + (item.transaction_type === '수입' ? Number(item.amount) : -Number(item.amount));
        }, 0);
        return { event_id: event.id, event_name: event.name, balance: balance };
      });
    }
  });
}

// 2. 장부 등록과 상태 변경
function api_createLedgerEntry(request) {
  return apiHandler_({
    operation: 'createLedgerEntry',
    input: request,
    requireLogin: true,
    service: function (input, context) { return saveLedgerEntry_(input || {}, context); }
  });
}

function api_saveLedgerDraft(request) {
  return apiHandler_({
    operation: 'saveLedgerDraft',
    input: request,
    requireLogin: true,
    service: function (input, context) {
      // TODO(장부 임시저장): 운영 DB에 임시저장 상태 필드가 추가되면 별도 상태로 저장한다.
      return saveLedgerEntry_(input || {}, context);
    }
  });
}

function api_processLedgerEntry(request) {
  return apiHandler_({
    operation: 'processLedgerEntry',
    input: request,
    requireLogin: true,
    service: function (input) {
      var status;
      input = input || {};
      if (!input.transaction_id) throw new Error('transaction_id is required.');
      status = input.action === 'approve' ? '정상' : '확인필요';
      updateLedgerRowById_(input.transaction_id, { matchStatus: status, updatedAt: getCurrentIsoDateTime_() });
      return {
        ok: true,
        transaction_id: input.transaction_id,
        status: status,
        item: findLedgerEntryDtoById_(input.transaction_id)
      };
    }
  });
}
