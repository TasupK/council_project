/**
 * 설정 업무 권한 매트릭스 조회 — 화면×행위 체크 그리드
 */
function getSettingsPermissionsData_(current) {
  return okResponse_(Object.assign(buildSettingsBaseView_(current), {
    roles: getSettingsRolesData_(),
    permissionTree: buildSettingsPermissionTreeFromDb_(),
    permissionsByRole: buildSettingsPermissionsByRoleFromDb_(),
    columns: SETTINGS_PERMISSION_COLUMNS
  }));
}
