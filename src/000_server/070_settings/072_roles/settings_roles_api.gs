// Settings 역할 관리 데이터 조회
function loadSettingsRolesData() {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  return okResponse_(Object.assign(buildSettingsBaseData_(current), {
    roles: listRolesForSettings_()
  }));
}
