var API_ERROR_TRANSPORT_PREFIX_ = '__APP_ERROR__:';

function unwrapApiRequest_(input) {
  var source = input && typeof input === 'object' ? input : {};
  return source.request && typeof source.request === 'object'
    ? source.request
    : source;
}

function normalizeApiException_(error) {
  var isTyped = error && error.code;
  var payload = isTyped
    ? {
        code: String(error.code || 'PROCESS_FAILED'),
        message: String(error.message || '요청을 처리할 수 없습니다.'),
        details: error.details && typeof error.details === 'object' ? error.details : {}
      }
    : {
        code: 'INTERNAL_ERROR',
        message: '서버 처리 중 오류가 발생했습니다.',
        details: {}
      };

  var normalized = new Error(API_ERROR_TRANSPORT_PREFIX_ + JSON.stringify(payload));
  normalized.code = payload.code;
  normalized.details = payload.details;
  return normalized;
}
