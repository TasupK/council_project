// 1. 설정 홈 데이터 조회
function loadSettingsHomeData() {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;
  return okResponse_(buildSettingsBaseData_(current));
}

// 2. 사용자 관리 데이터 조회
function loadSettingsUsersData() {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  return okResponse_(Object.assign(buildSettingsBaseData_(current), {
    users: listUsersForSettings_(),
    roles: listRolesForSettings_()
  }));
}

// 3. 역할 관리 데이터 조회
function loadSettingsRolesData() {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  return okResponse_(Object.assign(buildSettingsBaseData_(current), {
    roles: listRolesForSettings_()
  }));
}

// 4. 업무 권한 설정 데이터 조회
function loadSettingsPermissionsData() {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  return okResponse_(Object.assign(buildSettingsBaseData_(current), {
    roles: listRolesForSettings_(),
    permissionTree: buildPermissionTreeFromDb_(),
    permissionsByRole: buildPermissionsByRoleFromDb_(),
    columns: SETTINGS_PERMISSION_COLUMNS
  }));
}

// 5. 설정 API 관리자 권한 확인
function getAdminSettingsCurrent_() {
  var current = api_getCurrentUser();
  if (!current.ok) return current;
  if (!current.isAdmin) {
    return failResponse_('FORBIDDEN', '설정 화면은 시스템 관리자만 이용할 수 있습니다.');
  }
  return current;
}

// 6. 설정 API 공통 응답 생성
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
