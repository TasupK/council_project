// Settings 홈과 공통 shell 조회
function loadSettingsHomeData() {
  var current = getSettingsCurrent_();
  if (!current.ok) return current;
  return okResponse_(buildSettingsBaseView_(current));
}

function buildSettingsBaseView_(current) {
  var canManageInfrastructure = !!current.isAdmin;
  return {
    app: {
      name: APP_TITLE,
      version: 'v0.7',
      term: '2026학년도',
      baseDate: '',
      syncStatus: 'Google Sheets DB 연결됨'
    },
    database: {
      connected: true,
      mode: 'connected',
      type: 'Google Sheets',
      spreadsheetId: canManageInfrastructure ? DB_CONFIG.userSpreadsheetId : '',
      spreadsheetUrl: canManageInfrastructure ? 'https://docs.google.com/spreadsheets/d/' + DB_CONFIG.userSpreadsheetId + '/edit' : '',
      folderId: canManageInfrastructure ? DB_CONFIG.rootFolderId : '',
      error: ''
    },
    session: {
      email: current.user.email,
      isAdmin: current.isAdmin,
      canAccessSettings: !!(current.isAdmin || (current.domainAccess && current.domainAccess.settings)),
      preview: false
    },
    currentUser: current.user
  };
}
