// Settings 부서 조직도 데이터 조회
function api_getSettingsDepartments(input) {
  return apiHandler_({
    operation: 'getSettingsDepartments',
    input: input,
    service: function () {
      var current = requireSettingsCurrent_();
      return Object.assign(buildSettingsBaseView_(current), buildSettingsDepartmentChart_());
    }
  });
}
