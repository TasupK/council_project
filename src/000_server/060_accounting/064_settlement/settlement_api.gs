/** 전체 결산 public API */
function api_getSettlementSummary(filter) { return apiHandler_({ operation: 'getSettlementSummary', input: filter, requireLogin: true, service: function (input) { return getSettlementSummary_(input || {}); } }); }
function api_generateSettlementReport(request) { return apiHandler_({ operation: 'generateSettlementReport', input: request, requireLogin: true, service: function (input, context) { return generateSettlementReport_(input || {}, context); } }); }
function api_getSettlementReportList(filter) { return apiHandler_({ operation: 'getSettlementReportList', input: filter, requireLogin: true, service: function (input) { return getSettlementReportList_(input || {}); } }); }
function api_getSettlementReport(reportId) { return apiHandler_({ operation: 'getSettlementReport', input: reportId, requireLogin: true, service: function (id) { return getSettlementReport_(id); } }); }
function api_exportSettlementReport(request) { return apiHandler_({ operation: 'exportSettlementReport', input: request, requireLogin: true, service: function (input) { return exportSettlementReport_(input || {}); } }); }
