// Event 도메인의 API access 선언을 IAM screen/action으로 변환한다.

function eventApiAccess_(action, screenId) {
  return {
    domain: 'event',
    action: action,
    screenId: screenId || '',
    resolve: resolveEventAccess_
  };
}

function resolveEventAccess_(access) {
  return resolvePermissionByAliases_(access || {}, ['event', '행사', '복지']);
}
