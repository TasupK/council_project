// 업무 권한 설정 데이터 조회
function loadSettingsPermissionsData() {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  return okResponse_(Object.assign(buildSettingsBaseData_(current), {
    roles: listRolesForSettings_(),
    permissionTree: buildPermissionTreeFromDb_(),
    permissionsByRole: buildPermissionsByRoleFromDb_(),
    columns: SETTINGS_PERMISSION_COLUMNS
  }));
}
