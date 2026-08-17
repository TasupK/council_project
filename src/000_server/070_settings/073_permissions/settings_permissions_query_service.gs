// Settings 권한 관리 화면 조회 모델 생성
function getSettingsPermissionsData_(current) {
  return okResponse_(Object.assign(buildSettingsBaseData_(current), {
    roles: listRolesForSettings_(),
    permissionTree: buildPermissionTreeFromDb_(),
    permissionsByRole: buildPermissionsByRoleFromDb_(),
    columns: SETTINGS_PERMISSION_COLUMNS
  }));
}
