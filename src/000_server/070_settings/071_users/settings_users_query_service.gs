// Settings 사용자 화면 조회 모델 구성
function listUsersForSettings_() {
  var fields = getUserDbFields_('users');
  var roleMap = getRolesById_();
  var userRoleMap = getActiveRoleIdsByEmail_();
  return listUserRows_().map(function (row) {
    var email = normalizeEmail_(row[fields.email]);
    var roleIds = userRoleMap[email] || [];
    var roles = roleIds.map(function (roleId) {
      return summarizeRoleForUser_(roleMap[roleId], roleId);
    });
    return toUserDto_(row, roleIds, roles);
  });
}
