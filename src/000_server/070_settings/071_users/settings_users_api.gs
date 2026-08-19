// Settings 사용자 관리 데이터 조회
function api_getSettingsUsers(input) {
  return apiHandler_({
    operation: 'getSettingsUsers',
    input: input,
    service: function () {
      var current = requireSettingsCurrent_();
      return Object.assign(buildSettingsBaseView_(current), {
        users: getSettingsUsersData_(),
        roles: getSettingsRolesData_(),
        departments: getActiveDepartmentsData_()
      });
    }
  });
}

// Settings 사용자 소속 부서 저장
function api_updateSettingsUserDepartment(input) {
  return apiHandler_({
    operation: 'updateSettingsUserDepartment',
    input: input,
    service: function (request) {
      return unwrapSettingsServiceResult_(updateSettingsUserDepartment_(request));
    }
  });
}
