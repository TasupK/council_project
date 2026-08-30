function throwEventError_(code, message, details) {
  var error = new Error(message || code);
  error.code = code || 'PROCESS_FAILED';
  if (typeof details !== 'undefined') error.details = details;
  throw error;
}

// TODO(행사 권한): UserDB의 행사 권한 ID가 확정되면 공개 함수에서 동작별 view/edit/approve/export를 검사한다.
