// Accounting 도메인의 API access 선언을 IAM screen/action으로 변환한다.

function resolveAccountingAccess_(access) {
  return resolvePermissionByAliases_(access || {}, ['accounting', '회계', '장부', '정산', '결산']);
}
