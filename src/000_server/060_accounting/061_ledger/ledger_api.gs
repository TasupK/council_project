/** 수입지출원장 public API */

function api_getLedgerDatabaseInfo() {
  return apiHandler_({
    operation: 'getLedgerDatabaseInfo',
    requireLogin: true,
    service: function () {
      return getLedgerDatabaseInfo_();
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
      return findLedgerEntryDtoById_(id);
    }
  });
}

function api_getLedgerEventOptions() {
  return apiHandler_({
    operation: 'getLedgerEventOptions',
    requireLogin: true,
    service: function () {
      return getLedgerEventOptions_();
    }
  });
}

function api_createLedgerEntry(request) {
  return apiHandler_({
    operation: 'createLedgerEntry',
    input: request,
    requireLogin: true,
    service: function (input, context) {
      return saveLedgerEntry_(input || {}, context);
    }
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
      return processLedgerEntry_(input);
    }
  });
}
