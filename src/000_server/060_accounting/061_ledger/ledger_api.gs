/** 수입지출원장 public API */

function api_getLedgerDatabaseInfo() {
  return apiHandler_({ operation: 'getLedgerDatabaseInfo', requireLogin: true, access: accountingApiAccess_('view'), service: function () { return getLedgerDatabaseInfoData_(); } });
}

function api_getLedgerList(filter) {
  return apiHandler_({
    operation: 'getLedgerList', input: filter, requireLogin: true, access: accountingApiAccess_('view'),
    service: function (request) {
      var items = filterLedgerEntries_(getLedgerEntriesData_(), request || {});
      return { items: items, page: { pageNo: 1, pageSize: items.length, totalCount: items.length } };
    }
  });
}

function api_getLedgerSummary(filter) {
  return apiHandler_({ operation: 'getLedgerSummary', input: filter, requireLogin: true, access: accountingApiAccess_('view'), service: function (request) { return getLedgerSummaryData_(request || {}); } });
}

function api_getLedgerDetail(transactionId) {
  return apiHandler_({ operation: 'getLedgerDetail', input: transactionId, requireLogin: true, access: accountingApiAccess_('view'), service: function (id) { return findLedgerEntryDtoById_(id); } });
}

function api_getLedgerEventOptions() {
  return apiHandler_({ operation: 'getLedgerEventOptions', requireLogin: true, access: accountingApiAccess_('view'), service: function () { return getLedgerEventOptionsData_(); } });
}

function api_createLedgerEntry(request) {
  return apiHandler_({ operation: 'createLedgerEntry', input: request, requireLogin: true, access: accountingApiAccess_('edit'), service: function (input, context) { return createLedgerEntryData_(input || {}, context, 'ACTIVE'); } });
}

function api_saveLedgerDraft(request) {
  return apiHandler_({ operation: 'saveLedgerDraft', input: request, requireLogin: true, access: accountingApiAccess_('edit'), service: function (input, context) { return createLedgerDraftData_(input || {}, context); } });
}

function api_updateLedgerEntry(request) {
  return apiHandler_({ operation: 'updateLedgerEntry', input: request, requireLogin: true, access: accountingApiAccess_('edit'), service: function (input, context) { return updateLedgerEntryData_(input || {}, context); } });
}

function api_deleteLedgerEntry(request) {
  return apiHandler_({ operation: 'deleteLedgerEntry', input: request, requireLogin: true, access: accountingApiAccess_('edit'), service: function (input, context) { return deleteLedgerEntryData_(input || {}, context); } });
}

function api_processLedgerEntry(request) {
  return apiHandler_({ operation: 'processLedgerEntry', input: request, requireLogin: true, access: accountingApiAccess_('approve'), service: function (input, context) { return processLedgerEntryData_(input || {}, context); } });
}
