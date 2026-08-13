// 1. 클라이언트 응답으로 전달 가능한 값으로 변환
function toClientResponse_(obj) {
  return JSON.parse(JSON.stringify(obj == null ? {} : obj));
}

// 2. 성공 응답 생성
function okResponse_(data) {
  return toClientResponse_(Object.assign({ ok: true }, data || {}));
}

// 3. 실패 응답 생성
function failResponse_(code, message, extra) {
  return toClientResponse_(Object.assign({
    ok: false,
    code: code || 'ERROR',
    message: message || '오류가 발생했습니다.'
  }, extra || {}));
}
