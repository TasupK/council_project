// Settings 홈과 공통 shell 조회
function loadSettingsHomeData() {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;
  return okResponse_(buildSettingsBaseData_(current));
}

function buildSettingsBaseData_(current) {
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
      spreadsheetId: DB_CONFIG.userSpreadsheetId,
      spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + DB_CONFIG.userSpreadsheetId + '/edit',
      folderId: DB_CONFIG.rootFolderId,
      error: ''
    },
    session: {
      email: current.user.email,
      isAdmin: current.isAdmin,
      preview: false
    },
    currentUser: current.user
  };
}
