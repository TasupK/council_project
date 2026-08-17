// Settings 사용자 관리 데이터 조회
function loadSettingsUsersData() {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  return okResponse_(Object.assign(buildSettingsBaseData_(current), {
    users: listUsersForSettings_(),
    roles: listRolesForSettings_()
  }));
}
