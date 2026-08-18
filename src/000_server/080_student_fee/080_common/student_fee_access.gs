// Student Fee 도메인의 API access 선언을 IAM screen/action으로 변환한다.

function studentFeeApiAccess_(action, screenId) {
  return {
    domain: 'student_fee',
    action: action,
    screenId: screenId || '',
    resolve: resolveStudentFeeAccess_
  };
}

function resolveStudentFeeAccess_(access) {
  return resolvePermissionByAliases_(access || {}, ['studentfee', '학생회비', '회비']);
}
