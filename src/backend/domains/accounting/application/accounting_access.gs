// Accounting 도메인의 API access 선언을 IAM screen/action으로 변환한다.

function accountingApiAccess_(action, screenId) {
  var normalizedAction = String(action || '').trim().toLowerCase();
  var normalizedScreenId = String(screenId || '').trim();
  if (normalizedScreenId && normalizedScreenId.indexOf('perm_') !== 0) {
    normalizedScreenId = 'perm_' + normalizedScreenId + '_' + normalizedAction;
  }
  return {
    domain: 'accounting',
    action: normalizedAction,
    screenId: normalizedScreenId,
    resolve: resolveAccountingAccess_
  };
}

function resolveAccountingAccess_(access) {
  return resolvePermissionByAliases_(access || {}, ['accounting', '회계', '장부', '정산', '결산']);
}
