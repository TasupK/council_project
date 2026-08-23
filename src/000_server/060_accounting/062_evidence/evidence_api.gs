/** 거래증빙 public API */

function api_getLedgerEvidenceFileContent(request) {
  return apiHandler_({ operation: 'getEvidenceFileContent', input: request, requireLogin: true, access: accountingApiAccess_('view'), service: function (input) { return readEvidenceFileContent_(input || {}); } });
}

function api_getLedgerEvidenceAudits(filter) {
  return apiHandler_({ operation: 'getEvidenceAuditList', input: filter, requireLogin: true, access: accountingApiAccess_('view'), service: function (input) { return getEvidenceAuditListData_(input || {}); } });
}

function api_validateLedgerEvidenceOcr(request) {
  return apiHandler_({ operation: 'validateLedgerEvidenceOcr', input: request, requireLogin: true, access: accountingApiAccess_('edit'), service: function (input, context) { return validateEvidenceOcrData_(input || {}, context); } });
}
