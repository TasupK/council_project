// Settings 부서 조직도 데이터 조회
function api_getSettingsDepartments() {
  var current = getSettingsCurrent_();
  if (!current.ok) return current;
  return okResponse_(Object.assign(buildSettingsBaseView_(current), buildSettingsDepartmentChart_()));
}
