// 1. Student Fee API 입력을 공통 request 형태로 정리
function parseStudentFeeRequest_(input) {
  var source = input && typeof input === 'object' ? input : {};
  return {
    request: source.request && typeof source.request === 'object' ? source.request : source
  };
}

// 2. 여러 후보 키 중 필수 ID 조회
function requireStudentFeeId_(request, candidateKeys) {
  var source = request && typeof request === 'object' ? request : {};
  var keys = candidateKeys && candidateKeys.length ? candidateKeys : ['id'];
  for (var i = 0; i < keys.length; i += 1) {
    var value = String(source[keys[i]] == null ? '' : source[keys[i]]).trim();
    if (value) return value;
  }
  throw new Error(keys.join('/') + ' 값이 필요합니다.');
}

// 3. 필수 텍스트 검증
function requireStudentFeeText_(value, fieldName) {
  var text = String(value == null ? '' : value).trim();
  if (!text) throw new Error(fieldName + ' 값이 필요합니다.');
  return text;
}

// 4. 금액 숫자 검증
function parseStudentFeeAmount_(value, fieldName, minimum) {
  var min = typeof minimum === 'number' ? minimum : 0;
  var amount = Number(String(value == null ? '' : value).replace(/,/g, ''));
  if (!isFinite(amount) || amount < min) {
    throw new Error(fieldName + ' 값이 올바르지 않습니다.');
  }
  return amount;
}
