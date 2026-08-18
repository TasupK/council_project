// Settings 사용자 관리 데이터 조회
function loadSettingsUsersData() {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  return okResponse_(Object.assign(buildSettingsBaseData_(current), {
    users: listUsersForSettings_(),
    roles: listRolesForSettings_(),
    departments: listActiveDepartments_()
  }));
}

// Settings 사용자 소속 부서 저장
function saveSettingsUserDepartment(input) {
  return updateSettingsUserDepartment_(input);
}
