// 1. 요청 데이터 해석과 공통 값 검증
function parseEventRequest_(input) {
  var source = input && typeof input === 'object' ? input : {};
  var request = source.request && typeof source.request === 'object'
    ? source.request
    : source;
  return {
    auth: source.auth && typeof source.auth === 'object' ? source.auth : {},
    request: request
  };
}

function requireEventRequestId_(request) {
  var id = String((request && (request.id || request.eventId || request.applicationId)) || '').trim();
  if (!id) throwEventError_('VALIDATION_FAILED', 'id가 필요합니다.');
  return id;
}

function requireEventText_(value, fieldName) {
  var text = String(value === null || typeof value === 'undefined' ? '' : value).trim();
  if (!text) throwEventError_('VALIDATION_FAILED', fieldName + ' 값이 필요합니다.');
  return text;
}

function normalizeEventText_(value) {
  return value === null || typeof value === 'undefined' ? '' : String(value).trim();
}

function parseEventNumber_(value, fieldName, minimum) {
  var number = Number(String(value).replace(/,/g, ''));
  if (!isFinite(number) || number < minimum) {
    throwEventError_('VALIDATION_FAILED', fieldName + ' 값이 올바르지 않습니다.');
  }
  return number;
}

function parseEventDateText_(value, fieldName) {
  var text = requireEventText_(value, fieldName);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throwEventError_('VALIDATION_FAILED', fieldName + '는 yyyy-MM-dd 형식이어야 합니다.');
  }
  return text;
}

function validateEventChoice_(value, choices, fieldName) {
  if (choices.indexOf(value) < 0) {
    throwEventError_('INVALID_STATUS', fieldName + ' 값이 올바르지 않습니다.', { allowed: choices });
  }
  return value;
}
