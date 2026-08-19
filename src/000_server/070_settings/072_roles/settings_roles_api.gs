// Settings 역할 관리 데이터 조회
function api_getSettingsRoles(input) {
  return apiHandler_({
    operation: 'getSettingsRoles',
    input: input,
    service: function () {
      var current = requireSettingsCurrent_();
      return Object.assign(buildSettingsBaseView_(current), {
        roles: getSettingsRolesData_()
      });
    }
  });
}
