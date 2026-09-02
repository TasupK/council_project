// Settings 홈과 공통 shell 조회
function api_getSettingsHome(input) {
  return apiHandler_({
    operation: 'getSettingsHome',
    input: input,
    service: function () {
      return buildSettingsBaseView_(requireSettingsCurrent_());
    }
  });
}

function buildSettingsBaseView_(current) {
  var connections = getSettingsConnectionCards_(current);
  var userDb = connections.userDb;
  return {
    app: {
      name: APP_TITLE,
      version: 'v0.7',
      term: '2026학년도',
      baseDate: '',
      syncStatus: userDb.connected ? 'Google Sheets DB 연결됨' : 'Google Sheets DB 미연결'
    },
    database: {
      connected: userDb.connected,
      mode: userDb.connected ? 'connected' : 'not_connected',
      type: 'Google Sheets',
      spreadsheetId: userDb.id,
      spreadsheetUrl: userDb.url,
      folderId: connections.rootFolder.id,
      error: userDb.status === 'connection_error' ? '연결 오류' : ''
    },
    connections: connections,
    session: {
      email: current.user.email,
      isAdmin: current.isAdmin,
      canAccessSettings: !!(current.isAdmin || (current.domainAccess && current.domainAccess.settings)),
      preview: false
    },
    currentUser: current.user
  };
}

function api_updateOperationDbConnection(input) {
  return apiHandler_({
    operation: 'updateOperationDbConnection',
    input: input,
    service: function (request) {
      var current = requireConnectionManageCurrent_();
      return updateSettingsConnection_('operationDb', request, current);
    }
  });
}

function api_updateUserDbConnection(input) {
  return apiHandler_({
    operation: 'updateUserDbConnection',
    input: input,
    service: function (request) {
      var current = requireConnectionManageCurrent_();
      return updateSettingsConnection_('userDb', request, current);
    }
  });
}

function api_updateRootFolderConnection(input) {
  return apiHandler_({
    operation: 'updateRootFolderConnection',
    input: input,
    service: function (request) {
      var current = requireConnectionManageCurrent_();
      return updateSettingsConnection_('rootFolder', request, current);
    }
  });
}
