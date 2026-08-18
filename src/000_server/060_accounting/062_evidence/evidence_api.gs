/** 거래증빙 public API */

function api_getEvidenceFileContent(request) {
  return apiHandler_({ operation: 'getEvidenceFileContent', input: request, requireLogin: true, access: { domain: 'accounting', action: 'view' }, service: function (input) { return getEvidenceFileContent_(input || {}); } });
}

function api_getEvidenceAuditList(filter) {
  return apiHandler_({ operation: 'getEvidenceAuditList', input: filter, requireLogin: true, access: { domain: 'accounting', action: 'view' }, service: function (input) { return getEvidenceAuditList_(input || {}); } });
}
