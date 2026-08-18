// Settings 부서 조직도 데이터 조회
function loadSettingsDepartmentsData() {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;
  return okResponse_(Object.assign(buildSettingsBaseData_(current), buildSettingsDepartmentChart_()));
}
