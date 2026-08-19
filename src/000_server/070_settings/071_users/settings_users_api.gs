// Settings 사용자 관리 데이터 조회
function api_getSettingsUsers() {
  var current = getSettingsCurrent_();
  if (!current.ok) return current;

  return okResponse_(Object.assign(buildSettingsBaseView_(current), {
    users: getSettingsUsersData_(),
    roles: getSettingsRolesData_(),
    departments: getActiveDepartmentsData_()
  }));
}

// Settings 사용자 소속 부서 저장
function api_updateSettingsUserDepartment(input) {
  return updateSettingsUserDepartment_(input);
}
