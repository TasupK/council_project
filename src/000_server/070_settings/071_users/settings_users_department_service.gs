// Settings 사용자 소속 부서 변경
function updateSettingsUserDepartment_(input) {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  var payload = input || {};
  var email = normalizeEmail_(payload.email);
  var departmentId = normalizeTextValue_(payload.departmentId);
  if (!email) return failResponse_('VALIDATION_ERROR', '대상 사용자 이메일이 필요합니다.');

  var userRow = findUserRowByEmail_(email);
  if (!userRow) return failResponse_('NOT_FOUND', '대상 사용자를 찾을 수 없습니다.', { email: email });

  var departmentMap = buildDepartmentsById_();
  if (departmentId) {
    var department = departmentMap[departmentId];
    if (!department || department.status !== 'active') {
      return failResponse_('VALIDATION_ERROR', '활성 부서만 배정할 수 있습니다.', { departmentId: departmentId });
    }
  }

  var actorEmail = current.user && current.user.email ? current.user.email : current.email || '';
  updateSheetCrudItemById_('user', 'users', email, {
    departmentId: departmentId,
    updatedAt: new Date(),
    updatedBy: actorEmail
  });
  invalidateLoginContextCache_(email);

  var roleMap = buildRolesById_();
  var userRoleMap = buildActiveRoleIdsByEmail_();
  var roleIds = userRoleMap[email] || [];
  var roles = roleIds.map(function (roleId) {
    return buildRoleSummaryForUser_(roleMap[roleId], roleId);
  });
  var updatedRow = findUserRowByEmail_(email);
  return okResponse_({
    user: mapUserDto_(updatedRow || userRow, roleIds, roles, departmentMap)
  });
}
