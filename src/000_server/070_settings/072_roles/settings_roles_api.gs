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

function api_saveSettingsRoleChanges(input) {
  return apiHandler_({
    operation: 'saveSettingsRoleChanges',
    input: input,
    service: function (request) {
      return unwrapSettingsServiceResult_(saveSettingsRoleChanges_(request));
    }
  });
}

function api_createSettingsRole(input) {
  return apiHandler_({
    operation: 'createSettingsRole',
    input: input,
    service: function (request) {
      return unwrapSettingsServiceResult_(createSettingsRole_(request));
    }
  });
}

function api_updateSettingsRole(input) {
  return apiHandler_({
    operation: 'updateSettingsRole',
    input: input,
    service: function (request) {
      return unwrapSettingsServiceResult_(updateSettingsRole_(request));
    }
  });
}
