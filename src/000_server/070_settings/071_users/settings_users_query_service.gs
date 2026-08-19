// Settings 사용자 화면 조회 모델 구성
function getSettingsUsersData_() {
  var fields = getUserDbFields_('users');
  var roleMap = buildRolesById_();
  var userRoleMap = buildActiveRoleIdsByEmail_();
  var departmentMap = typeof buildDepartmentsById_ === 'function' ? buildDepartmentsById_() : {};
  return listUserRows_().map(function (row) {
    var email = normalizeEmail_(row[fields.email]);
    var roleIds = userRoleMap[email] || [];
    var roles = roleIds.map(function (roleId) {
      return buildRoleSummaryForUser_(roleMap[roleId], roleId);
    });
    return mapUserDto_(row, roleIds, roles, departmentMap);
  });
}
