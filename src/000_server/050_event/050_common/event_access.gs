// Event 도메인의 API access 선언을 IAM screen/action으로 변환한다.

function resolveEventAccess_(access) {
  return resolvePermissionByAliases_(access || {}, ['event', '행사', '복지']);
}

// 기존 Forms 동기화 호출부 호환용. API migration 후 제거 가능하다.
function requireEventEditContext_(context) {
  return requirePermission_(context, resolveEventAccess_({ domain: 'event', action: 'edit' }));
}
