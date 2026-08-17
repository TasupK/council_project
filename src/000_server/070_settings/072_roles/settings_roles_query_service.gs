// Settings 역할 화면 조회 모델 구성
function listRolesForSettings_() {
  var fields = getUserDbFields_('userRoles');
  var assignedCounts = {};
  var roleMap = getRolesById_();
  listUserRoleRows_().forEach(function (row) {
    if (!isActiveStatus_(row[fields.assignedStatus])) return;
    var roleId = normalizeTextValue_(row[fields.roleId]);
    assignedCounts[roleId] = (assignedCounts[roleId] || 0) + 1;
  });

  return Object.keys(roleMap).map(function (roleId) {
    var role = roleMap[roleId];
    role.assignedCount = assignedCounts[roleId] || 0;
    return role;
  });
}
