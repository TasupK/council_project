// Settings 업무 권한 데이터 조회
function api_getSettingsPermissions(input) {
  return apiHandler_({
    operation: 'getSettingsPermissions',
    input: input,
    service: function () {
      return unwrapSettingsServiceResult_(getSettingsPermissionsData_(requireSettingsCurrent_()));
    }
  });
}
