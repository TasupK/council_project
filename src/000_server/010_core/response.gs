// 1. 클라이언트 응답으로 전달 가능한 값으로 변환
function toClientResponse_(obj) {
  return JSON.parse(JSON.stringify(obj == null ? {} : obj));
}

// 2. API Contract v1 성공 응답 생성
function wrapApiSuccess_(data) {
  return toClientResponse_({
    ok: true,
    data: data == null ? null : data
  });
}

// 3. Legacy 성공 응답 생성
// API Contract v1로 이관되지 않은 기존 서버 호출을 위해 마이그레이션 동안 유지한다.
function okResponse_(data) {
  return toClientResponse_(Object.assign({ ok: true }, data || {}));
}

// 4. Legacy 실패 응답 생성
// 신규 frontend-consumed API에서는 사용하지 않는다.
function failResponse_(code, message, extra) {
  return toClientResponse_(Object.assign({
    ok: false,
    code: code || 'ERROR',
    message: message || '오류가 발생했습니다.'
  }, extra || {}));
}
