// Settings 역할 관리 데이터 조회
function loadSettingsRolesData() {
  var current = getSettingsCurrent_();
  if (!current.ok) return current;

  return okResponse_(Object.assign(buildSettingsBaseView_(current), {
    roles: getSettingsRolesData_()
  }));
}
