/** 거래증빙 public API */

function api_getEvidenceFileContent(request) {
  return apiHandler_({
    operation: 'getEvidenceFileContent',
    input: request,
    requireLogin: true,
    service: function (input) {
      return getEvidenceFileContent_(input);
    }
  });
}
