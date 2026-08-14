/**
 * 학생회 통합 업무관리 · 설정(사용자·권한) API
 * 저장소: Google Sheets (실제 데이터베이스)
 */

var DB_KEY = 'COUNCIL_SETTINGS_DB_V1';
var SPREADSHEET_ID_KEY = 'COUNCIL_DB_SPREADSHEET_ID';
var DRIVE_FOLDER_ID_KEY = 'COUNCIL_DRIVE_FOLDER_ID';
var ADMIN_ROLE_ID = 'role_admin';
/** 운영 DB: 사용자_2026 (계정·역할·권한) */
var OPERATIONAL_SPREADSHEET_ID = '1ofZ0M6lclOZudKp_36WCUk1_7ZjBCS8ACQ0x0dshe7g';
/** 운영 DB: 학생회_운영_2026 (학년도·장부·회비·행사) */
var OPERATIONAL_OPS_SPREADSHEET_ID = '1EI8MbFx2HSuizl0QFygRAZydYiv77W-6pQO10mRN55E';
/** 1차 API 정의 시트 (기능 설계 참조용) */
var API_SPEC_SPREADSHEET_ID = '1XUPJO-tY3wI4SSb8lWORL084Y4QNSNGgPmaIU8sgzzE';
var PERM_KEYS = ['menu', 'view', 'edit', 'approve', 'export'];
var PERM_COLUMNS = [
  { key: 'menu', label: '메뉴 접근', hint: '(자동)' },
  { key: 'view', label: '조회' },
  { key: 'edit', label: '등록 및 수정' },
  { key: 'approve', label: '승인 및 보관' },
  { key: 'export', label: '다운로드' }
];
var SHEETS = {
  departments: '부서',
  users: '사용자',
  roles: '역할',
  permissionCatalog: '권한',
  userRoles: '사용자역할',
  rolePermissions: '역할권한',
  notificationTypes: '알림유형',
  userNotifications: '사용자알림설정',
  auditLogs: '권한감사로그'
};
var ACTION_TO_KEY = {
  '메뉴 접근': 'menu',
  '조회': 'view',
  '등록 및 수정': 'edit',
  '승인 및 보관': 'approve',
  '다운로드': 'export'
};
var KEY_TO_ACTION = {
  menu: '메뉴 접근',
  view: '조회',
  edit: '등록 및 수정',
  approve: '승인 및 보관',
  export: '다운로드'
};
var PAGE_PERMISSION_DEFS = [
  { id: 'home', area: '메인화면', actions: ['조회'] },
  { id: 'ledger', area: '장부관리', actions: ['조회', '등록 및 수정', '승인 및 보관', '다운로드'] },
  { id: 'fee', area: '학생회비관리', actions: ['조회', '등록 및 수정', '승인 및 보관', '다운로드'] },
  { id: 'event', area: '행사복지관리', actions: ['조회', '등록 및 수정', '승인 및 보관', '다운로드'] },
  { id: 'settings', area: '설정', actions: ['조회', '등록 및 수정', '승인 및 보관', '다운로드'] }
];

function toClient_(obj) {
  return JSON.parse(JSON.stringify(obj == null ? {} : obj));
}

function ok_(data) {
  return toClient_(Object.assign({ ok: true }, data || {}));
}

function fail_(code, message, extra) {
  return toClient_(Object.assign({ ok: false, code: code || 'ERROR', message: message || '오류가 발생했습니다.' }, extra || {}));
}

function getConfiguredSpreadsheetId_() {
  var props = PropertiesService.getScriptProperties();
  return props.getProperty(SPREADSHEET_ID_KEY) || OPERATIONAL_SPREADSHEET_ID;
}

function isDbConfigured_() {
  var id = getConfiguredSpreadsheetId_();
  if (!id) return false;
  try {
    SpreadsheetApp.openById(id);
    return true;
  } catch (e) {
    return false;
  }
}

/** 예전 임시 시트 ID만 정리. 운영 DB ID는 유지 */
function cleanupOrphanDbLink_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(SPREADSHEET_ID_KEY);
  if (id && id !== OPERATIONAL_SPREADSHEET_ID && !props.getProperty(DRIVE_FOLDER_ID_KEY)) {
    props.deleteProperty(SPREADSHEET_ID_KEY);
  }
}

function getDbMode_() {
  cleanupOrphanDbLink_();
  return isDbConfigured_() ? 'connected' : 'preview';
}

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('학생회 통합 업무관리')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** ---------- Public APIs (google.script.run) ---------- */

function ping() {
  return toClient_({ ok: true, now: new Date().toISOString() });
}

/** 로그인 후 한 번 호출 — 설정 데이터 전체를 메모리 캐시용으로 반환 */
function loadAllData() {
  cleanupOrphanDbLink_();
  var login = apiV1_checkLogin();
  if (!login.ok) return login;

  var db = ensureDb_();
  var info = getSpreadsheetInfo_();
  var meta = (db && db.meta) || createSeedDb_().meta;
  var email = getActiveUserEmail_();
  var current = apiV1_getCurrentUser();
  var isAdmin = !!(current.ok && current.isAdmin);

  var users = (db.users || []).map(function (u) { return enrichUser_(u, db); });
  var roles = (db.roles || []).map(function (r) { return enrichRole_(r, db); });
  var tree = buildPermissionTree_(db);
  var permissionsByRole = {};
  roles.forEach(function (r) {
    permissionsByRole[r.id] = db.permissions[r.id] || {};
  });

  return ok_({
    apiVersion: 'v1',
    dbMode: getDbMode_(),
    app: {
      name: '학생회 통합 업무관리',
      version: 'v0.7',
      term: meta.term || '2026학년도',
      baseDate: meta.baseDate || '',
      syncStatus: info.connected ? 'Google Sheets DB 연결됨' : '미리보기(운영 Drive 미연결)'
    },
    database: {
      connected: !!info.connected,
      mode: getDbMode_(),
      type: 'Google Sheets',
      spreadsheetId: info.spreadsheetId || '',
      spreadsheetUrl: info.spreadsheetUrl || '',
      opsSpreadsheetId: OPERATIONAL_OPS_SPREADSHEET_ID,
      opsSpreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + OPERATIONAL_OPS_SPREADSHEET_ID + '/edit',
      opsConnected: !!(meta.ops && meta.ops.connected),
      folderId: PropertiesService.getScriptProperties().getProperty(DRIVE_FOLDER_ID_KEY) || '',
      error: info.error || ''
    },
    session: {
      email: email,
      isAdmin: isAdmin,
      preview: getDbMode_() === 'preview',
      allowedPages: (current.permissions && current.permissions.allowedPages) || []
    },
    currentUser: current.user || {},
    academicYears: apiV1_getAcademicYearList().items || [],
    departments: departmentNames_(db),
    users: users,
    roles: roles,
    permissionTree: tree,
    permissionsByRole: permissionsByRole,
    permissionMeta: db.permissionMeta || {},
    columns: PERM_COLUMNS,
    nav: buildNavForUser_(current)
  });
}

/** Google Drive 폴더 ID로 DB 스프레드시트 연결 후 전체 데이터 반환 (운영 Drive 확정 시 사용) */
function connectDriveFolder(folderId) {
  folderId = String(folderId || '').trim();
  if (!folderId) throw new Error('Google Drive 폴더 ID를 입력하세요.');
  var spreadsheetId = findSpreadsheetInFolder_(folderId);
  if (!spreadsheetId) {
    throw new Error('폴더에서 스프레드시트를 찾을 수 없습니다. 운영 DB 시트가 준비되면 폴더에 넣어주세요.');
  }
  PropertiesService.getScriptProperties().setProperty(DRIVE_FOLDER_ID_KEY, folderId);
  PropertiesService.getScriptProperties().setProperty(SPREADSHEET_ID_KEY, spreadsheetId);
  return loadAllData();
}

/** 스프레드시트 ID로 직접 연결 (운영 DB 확정 시) */
function connectSpreadsheet(spreadsheetId) {
  spreadsheetId = String(spreadsheetId || '').trim();
  if (!spreadsheetId) throw new Error('스프레드시트 ID를 입력하세요.');
  SpreadsheetApp.openById(spreadsheetId);
  PropertiesService.getScriptProperties().setProperty(SPREADSHEET_ID_KEY, spreadsheetId);
  return loadAllData();
}

/** 운영 DB 연결 해제 — 미리보기(시드) 모드로 전환 */
function disconnectDatabase() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(SPREADSHEET_ID_KEY);
  props.deleteProperty(DRIVE_FOLDER_ID_KEY);
  return loadAllData();
}

/** ---------- COM_API v1 (공통 API, 1차 설계 시트 기준) ---------- */

/** COM_API_001 로그인 계정 확인 */
function apiV1_checkLogin() {
  cleanupOrphanDbLink_();
  var email = getActiveUserEmail_();
  if (!email) return fail_('NO_SESSION', 'Google 로그인이 필요합니다.');

  var db = ensureDb_();
  var user = findUserByEmail_(db, email);
  if (!user && getDbMode_() === 'connected') {
    db = provisionCurrentUser_(db, email);
    user = findUserByEmail_(db, email);
  }

  if (!user && getDbMode_() === 'preview') {
    return ok_({
      email: email,
      user: {
        id: 'preview_user',
        name: email.split('@')[0],
        email: email,
        roleIds: [ADMIN_ROLE_ID],
        roles: [{ id: ADMIN_ROLE_ID, name: '시스템 관리자' }],
        status: 'active'
      },
      dbMode: 'preview',
      preview: true,
      message: '운영 DB 미연결 — 미리보기 모드로 접속합니다.'
    });
  }

  if (!user) return fail_('NOT_REGISTERED', '등록되지 않은 Google 계정입니다.', { email: email });
  if (user.status !== 'active') return fail_('INACTIVE', '비활성화된 계정입니다.', { email: email });

  return ok_({
    email: email,
    user: enrichUser_(user, db),
    dbMode: getDbMode_(),
    preview: false
  });
}

/** COM_API_002 현재 사용자 조회 */
function apiV1_getCurrentUser() {
  var login = apiV1_checkLogin();
  if (!login.ok) return login;

  var db = ensureDb_();
  var user = login.user;
  var roleIds = user.roleIds || [];
  var roles = roleIds.map(function (id) {
    var r = findById_(db.roles, id);
    return r ? enrichRole_(r, db) : { id: id, name: id };
  });
  var permissions = buildUserPermissions_(db, roleIds);
  var sessionUser = resolveSessionUser_(db, login.email);

  return ok_({
    user: {
      id: user.id,
      name: sessionUser.name,
      title: sessionUser.title,
      email: login.email,
      department: user.department || '',
      status: user.status,
      roleIds: roleIds,
      roles: roles
    },
    permissions: permissions,
    isAdmin: roleIds.indexOf(ADMIN_ROLE_ID) !== -1,
    dbMode: getDbMode_(),
    menus: permissions.menus || []
  });
}

/** COM_API_003 로그아웃 — Apps Script 웹앱은 클라이언트 세션 정리 */
function apiV1_logout() {
  return ok_({ message: '클라이언트 세션을 정리했습니다. Google 계정 전환은 브라우저에서 로그아웃하세요.' });
}

/** COM_API_004 사용자 목록 조회 */
function apiV1_listUsers(filters) {
  assertAdmin_();
  return getUsers(filters);
}

/** COM_API_005 사용자 상세 조회 */
function apiV1_getUser(userId) {
  assertAdmin_();
  var db = ensureDb_();
  var user = findById_(db.users, userId);
  if (!user) throw new Error('사용자를 찾을 수 없습니다.');
  return ok_({ user: enrichUser_(user, db) });
}

/** COM_API_006 사용자 등록 */
function apiV1_createUser(payload) {
  assertAdmin_();
  assertWritableDb_();
  return saveUserChanges({ changes: [], newUsers: [payload || {}] });
}

/** COM_API_007 사용자 정보 수정 */
function apiV1_updateUser(payload) {
  assertAdmin_();
  assertWritableDb_();
  payload = payload || {};
  if (!payload.id) throw new Error('사용자 ID가 필요합니다.');
  return saveUserChanges({ changes: [payload], newUsers: [] });
}

/** COM_API_008 사용자 상태 처리 (단일/일괄) */
function apiV1_processUsers(payload) {
  assertAdmin_();
  assertWritableDb_();
  payload = payload || {};
  var ids = payload.ids || [];
  var action = String(payload.action || '').toLowerCase();
  if (!ids.length) throw new Error('처리할 사용자 ID가 필요합니다.');
  var status = action === 'activate' || action === 'active' ? 'active' : 'inactive';
  var changes = ids.map(function (id) { return { id: id, status: status }; });
  return saveUserChanges({ changes: changes, newUsers: [] });
}

/** COM_API_009 역할 목록 조회 */
function apiV1_listRoles(filters) {
  assertAdmin_();
  return getRoles(filters);
}

/** COM_API_010 역할 상세 조회 */
function apiV1_getRole(roleId) {
  assertAdmin_();
  var db = ensureDb_();
  var role = findById_(db.roles, roleId);
  if (!role) throw new Error('역할을 찾을 수 없습니다.');
  var matrix = getPermissionMatrix(roleId);
  return ok_({
    role: enrichRole_(role, db),
    permissions: matrix.values || {},
    permissionMeta: db.permissionMeta[roleId] || {}
  });
}

/** COM_API_011 역할 등록 */
function apiV1_createRole(payload) {
  assertAdmin_();
  assertWritableDb_();
  return saveRoleChanges({ changes: [], newRoles: [payload || {}] });
}

/** COM_API_012 역할 정보 수정 */
function apiV1_updateRole(payload) {
  assertAdmin_();
  assertWritableDb_();
  payload = payload || {};
  if (!payload.id) throw new Error('역할 ID가 필요합니다.');
  return saveRoleChanges({ changes: [payload], newRoles: [] });
}

/** COM_API_013 역할 상태 처리 (단일/일괄) */
function apiV1_processRoles(payload) {
  assertAdmin_();
  assertWritableDb_();
  payload = payload || {};
  var ids = payload.ids || [];
  var action = String(payload.action || '').toLowerCase();
  if (!ids.length) throw new Error('처리할 역할 ID가 필요합니다.');
  var status = action === 'activate' || action === 'active' ? 'active' : 'inactive';
  var changes = ids.map(function (id) { return { id: id, status: status }; });
  return saveRoleChanges({ changes: changes, newRoles: [] });
}

/** COM_API_014 권한표 조회 */
function apiV1_getPermissionMatrix(roleId) {
  assertAdmin_();
  return getPermissionMatrix(roleId);
}

/** COM_API_015 역할별 권한 조회 */
function apiV1_getRolePermissions(roleId) {
  assertAdmin_();
  return getPermissionMatrix(roleId);
}

/** COM_API_016 역할별 권한 저장 */
function apiV1_saveRolePermissions(payload) {
  assertAdmin_();
  assertWritableDb_();
  return savePermissionChanges(payload);
}

/** COM_API_017 내 정보 조회 */
function apiV1_getMyProfile() {
  var current = apiV1_getCurrentUser();
  if (!current.ok) return current;
  return ok_({ profile: current.user });
}

/** COM_API_018 내 권한 조회 */
function apiV1_getMyPermissions() {
  var current = apiV1_getCurrentUser();
  if (!current.ok) return current;
  return ok_({
    roles: current.user.roles || [],
    permissions: current.permissions || {}
  });
}

/** COM_API_019 내 알림 설정 수정 — DB 준비 전 스텁 */
function apiV1_updateMyNotification(payload) {
  var login = apiV1_checkLogin();
  if (!login.ok) return login;
  if (!isDbConfigured_()) {
    return ok_({ message: '미리보기 모드 — 알림 설정은 운영 DB 연결 후 저장됩니다.', saved: false, payload: payload || {} });
  }
  appendAuditLog_('USER_NOTIFICATION', login.email, '알림 설정 변경', JSON.stringify(payload || {}));
  return ok_({ message: '알림 설정이 저장되었습니다.', saved: true });
}

/** COM_API_020 학년도 목록 조회 */
function apiV1_getAcademicYearList() {
  var db = ensureDb_();
  var ops = db.meta && db.meta.ops ? db.meta.ops : {};
  var current = db.meta.term || '2026학년도';
  var items = (ops.semesters || []).map(function (s) {
    return {
      id: s.id,
      label: (s.year ? s.year + '학년도 ' : '') + (s.term || s.id),
      isCurrent: !!s.active
    };
  });
  if (!items.length) {
    items = [{ id: '2026', label: current, isCurrent: true }];
  }
  return ok_({ current: current, items: items });
}

/** COM_API_021 부서 목록 조회 */
function apiV1_getDepartmentList() {
  var db = ensureDb_();
  var records = db.departmentRecords || [];
  var items = records.length
    ? records.map(function (d) {
        return { id: d.id, name: d.name, status: d.status || 'active' };
      })
    : (db.departments || []).map(function (name, i) {
        return { id: 'dept_' + (i + 1), name: name, status: 'active' };
      });
  return ok_({ total: items.length, items: items });
}

/** COM_API_022 담당자 목록 조회 */
function apiV1_listAssignees(filters) {
  filters = filters || {};
  var db = ensureDb_();
  var q = String(filters.q || '').trim().toLowerCase();
  var dept = filters.department || '';
  var roleId = filters.roleId || '';
  var list = db.users.filter(function (u) {
    if (u.status !== 'active') return false;
    if (dept && u.department !== dept) return false;
    if (roleId && (u.roleIds || []).indexOf(roleId) === -1) return false;
    if (q) {
      var hay = (u.name + ' ' + u.email).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }).map(function (u) { return enrichUser_(u, db); });
  return ok_({ total: list.length, assignees: list });
}

/** COM_API_023 공통 파일 업로드 — 운영 Drive 연결 후 구현 */
function apiV1_uploadFile(payload) {
  assertWritableDb_();
  return fail_('NOT_IMPLEMENTED', '파일 업로드 API는 운영 Drive·FILE 테이블 준비 후 연결됩니다.', { payload: payload || {} });
}

/** COM_API_024 공통 파일 조회 — 운영 Drive 연결 후 구현 */
function apiV1_getFile(fileId) {
  return fail_('NOT_IMPLEMENTED', '파일 조회 API는 운영 Drive·FILE 테이블 준비 후 연결됩니다.', { fileId: fileId });
}

/** COM_API_025 공통 코드 조회 */
function apiV1_listCodes(group) {
  group = String(group || '').trim();
  var codes = {
    user_status: [
      { code: 'active', label: '활성' },
      { code: 'inactive', label: '비활성' }
    ],
    role_type: [
      { code: 'default', label: '기본 역할' },
      { code: 'custom', label: '사용자 정의' }
    ],
    perm_action: PERM_COLUMNS.map(function (c) { return { code: c.key, label: c.label }; })
  };
  if (group && codes[group]) return ok_({ group: group, items: codes[group] });
  return ok_({ groups: Object.keys(codes), codes: codes });
}

/** COM_API_026 감사·변경 이력 조회 */
function apiV1_listAuditLogs(filters) {
  assertAdmin_();
  filters = filters || {};
  var logs = readAuditLogs_();
  var q = String(filters.q || '').trim().toLowerCase();
  var list = logs.filter(function (log) {
    if (q && (log.summary + ' ' + log.actor + ' ' + log.target).toLowerCase().indexOf(q) === -1) return false;
    return true;
  });
  return ok_({ total: list.length, logs: list.slice(0, 100) });
}

function buildNavForUser_(current) {
  var allowed = (current && current.permissions && current.permissions.allowedPages) || [];
  var isAdmin = !!(current && current.ok && current.isAdmin);
  var all = [
    { id: 'home', label: '메인화면', group: 'main' },
    { id: 'ledger', label: '장부관리', group: 'main' },
    { id: 'fee', label: '학생회비관리', group: 'main' },
    { id: 'event', label: '행사복지관리', group: 'main' },
    { id: 'settings', label: '설정', group: 'system', adminOnly: true }
  ];
  return all.filter(function (item) {
    if (isAdmin) return true;
    return allowed.indexOf(item.id) >= 0;
  });
}

function canAccessPage_(permissions, pageId, isAdmin) {
  if (isAdmin) return true;
  var allowed = (permissions && permissions.allowedPages) || [];
  return allowed.indexOf(pageId) >= 0;
}

function buildUserPermissions_(db, roleIds) {
  var screens = db.screens || [];
  var merged = {};
  (roleIds || []).forEach(function (roleId) {
    var byScreen = db.permissions[roleId] || {};
    Object.keys(byScreen).forEach(function (screenId) {
      if (!merged[screenId]) merged[screenId] = emptyPerm_();
      PERM_KEYS.forEach(function (k) {
        merged[screenId][k] = merged[screenId][k] || !!byScreen[screenId][k];
      });
    });
  });
  var pageIds = PAGE_PERMISSION_DEFS.map(function (p) { return p.id; });
  var allowedPages = pageIds.filter(function (id) {
    var p = merged[id];
    return p && (p.menu || p.view);
  });
  var menus = screens.filter(function (s) {
    var p = merged[s.id];
    return p && (p.menu || p.view);
  }).map(function (s) { return { id: s.id, name: s.name, group: s.group }; });
  return { byScreen: merged, menus: menus, allowedPages: allowedPages };
}

function assertAdmin_() {
  var current = apiV1_getCurrentUser();
  if (!current.ok) throw new Error(current.message || '로그인이 필요합니다.');
  if (!current.isAdmin) throw new Error('시스템 관리자 권한이 필요합니다.');
  return current;
}

function assertWritableDb_() {
  if (!isDbConfigured_()) {
    throw new Error('운영 DB가 아직 연결되지 않았습니다. 실제 Google Drive 연결 후 저장할 수 있습니다.');
  }
}

function appendAuditLog_(category, actor, summary, detail) {
  if (!isDbConfigured_()) return;
  try {
    var ss = getSpreadsheet_();
    var sheet = ss.getSheetByName(SHEETS.auditLogs);
    if (!sheet) return;
    var now = nowStamp_();
    var email = getActiveUserEmail_() || actor || '';
    sheet.appendRow([
      'log_' + Utilities.getUuid().replace(/-/g, '').slice(0, 12),
      now,
      email,
      category || '',
      '설정',
      '',
      '',
      String(detail || ''),
      String(summary || '')
    ]);
  } catch (e) {
    // 감사 이력 실패는 본 업무를 막지 않음
  }
}

function readAuditLogs_() {
  if (!isDbConfigured_()) return [];
  try {
    return readRows_(getSpreadsheet_(), SHEETS.auditLogs).filter(function (r) {
      return String(r[0] || '').trim();
    }).map(function (r) {
      return {
        at: formatCellDate_(r[1]),
        category: String(r[3] || ''),
        actor: String(r[2] || ''),
        summary: String(r[8] || ''),
        target: String(r[5] || '')
      };
    }).reverse();
  } catch (e) {
    return [];
  }
}

function getBootstrap() {
  var fallback = createSeedDb_();
  var db = fallback;
  var info = {
    connected: false,
    type: 'Google Sheets',
    spreadsheetId: '',
    spreadsheetUrl: '',
    error: ''
  };
  try {
    db = ensureDb_() || fallback;
    info = getSpreadsheetInfo_();
  } catch (err) {
    info.error = err && err.message ? err.message : String(err);
    db = fallback;
  }
  var meta = (db && db.meta) || fallback.meta;
  var currentUser = meta.currentUser || fallback.meta.currentUser;
  return toClient_({
    ok: true,
    app: {
      name: '학생회 통합 업무관리',
      version: 'v0.3',
      term: meta.term || '2026학년도',
      baseDate: meta.baseDate || '',
      syncStatus: info.connected ? 'Google Sheets DB 연결됨' : (info.error ? ('DB 연결 실패: ' + info.error) : 'DB 준비 중')
    },
    database: {
      connected: !!info.connected,
      type: 'Google Sheets',
      spreadsheetId: info.spreadsheetId || '',
      spreadsheetUrl: info.spreadsheetUrl || '',
      error: info.error || ''
    },
    currentUser: {
      name: (currentUser && currentUser.name) || '운영자',
      title: (currentUser && currentUser.title) || '관리자'
    },
    departments: db && db.departments && db.departments.length ? db.departments : fallback.departments,
    nav: [
      { id: 'home', label: '메인화면', group: 'main' },
      { id: 'ledger', label: '장부관리', group: 'main' },
      { id: 'fee', label: '학생회비관리', group: 'main' },
      { id: 'event', label: '행사복지관리', group: 'main' },
      { id: 'settings', label: '설정', group: 'system' }
    ]
  });
}

function getUsers(filters) {
  filters = filters || {};
  var db = ensureDb_();
  var q = String(filters.q || '').trim().toLowerCase();
  var roleId = filters.roleId || '';
  var status = filters.status || '';

  var list = db.users.map(function (u) {
    return enrichUser_(u, db);
  }).filter(function (u) {
    if (q) {
      var hay = (u.name + ' ' + u.email + ' ' + (u.studentId || '') + ' ' + (u.phone || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    if (roleId && u.roleIds.indexOf(roleId) === -1) return false;
    if (status && u.status !== status) return false;
    return true;
  });

  return toClient_({
    ok: true,
    total: list.length,
    users: list,
    roles: db.roles.map(summarizeRole_),
    departments: departmentNames_(db)
  });
}

function saveUserChanges(payload) {
  payload = payload || {};
  var changes = payload.changes || [];
  var newUsers = payload.newUsers || [];
  var db = ensureDb_();
  var now = today_();
  var actor = getActiveUserEmail_() || db.meta.currentUser.name;

  newUsers.forEach(function (nu) {
    validateUserInput_(nu, true);
    if (findUserByEmail_(db, nu.email)) {
      throw new Error('이미 등록된 이메일입니다: ' + nu.email);
    }
    db.users.push({
      id: String(nu.email).trim().toLowerCase(),
      name: String(nu.name).trim(),
      email: String(nu.email).trim().toLowerCase(),
      studentId: String(nu.studentId || '').trim(),
      phone: String(nu.phone || '').trim(),
      department: nu.department,
      departmentId: departmentIdByName_(db, nu.department),
      roleIds: normalizeRoleIds_(nu.roleIds || nu.roleId),
      status: nu.status === 'inactive' ? 'inactive' : 'active',
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor,
      isNew: false
    });
  });

  changes.forEach(function (ch) {
    var user = findById_(db.users, ch.id);
    if (!user) throw new Error('사용자를 찾을 수 없습니다: ' + ch.id);
    if (ch.name != null) user.name = String(ch.name).trim();
    if (ch.email != null) {
      var email = String(ch.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('이메일 형식이 올바르지 않습니다.');
      }
      var other = findUserByEmail_(db, email);
      if (other && other.id !== user.id) {
        throw new Error('이미 등록된 이메일입니다: ' + email);
      }
      user.email = email;
    }
    if (ch.studentId != null) user.studentId = String(ch.studentId).trim();
    if (ch.phone != null) user.phone = String(ch.phone).trim();
    if (ch.department != null) {
      user.department = ch.department;
      user.departmentId = departmentIdByName_(db, ch.department);
    }
    if (ch.roleIds != null || ch.roleId != null) {
      user.roleIds = normalizeRoleIds_(ch.roleIds || ch.roleId);
    }
    if (ch.status != null) {
      user.status = ch.status === 'inactive' ? 'inactive' : 'active';
    }
    user.updatedAt = now;
    user.updatedBy = actor;
  });

  saveDb_(db);
  appendAuditLog_('USER', db.meta.currentUser.name, '사용자 변경 저장', changes.length + '건 수정, ' + newUsers.length + '건 신규');
  return { ok: true, message: '사용자 변경사항이 저장되었습니다.', total: db.users.length };
}

function getRoles(filters) {
  filters = filters || {};
  var db = ensureDb_();
  var q = String(filters.q || '').trim().toLowerCase();
  var type = filters.type || '';
  var status = filters.status || '';

  var list = db.roles.map(function (r) {
    return enrichRole_(r, db);
  }).filter(function (r) {
    if (q) {
      var hay = (r.name + ' ' + (r.description || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    if (type && r.type !== type) return false;
    if (status && r.status !== status) return false;
    return true;
  });

  return toClient_({ ok: true, total: list.length, roles: list });
}

function saveRoleChanges(payload) {
  payload = payload || {};
  var changes = payload.changes || [];
  var newRoles = payload.newRoles || [];
  var db = ensureDb_();
  var now = today_();
  var actor = getActiveUserEmail_() || db.meta.currentUser.name;

  newRoles.forEach(function (nr) {
    if (!nr.name || !String(nr.name).trim()) throw new Error('역할명을 입력하세요.');
    db.roles.push({
      id: nextId_(db, 'role'),
      name: String(nr.name).trim(),
      type: 'custom',
      description: String(nr.description || '').trim(),
      status: nr.status === 'inactive' ? 'inactive' : 'active',
      protected: false,
      createdAt: now,
      createdBy: actor,
      updatedAt: now,
      updatedBy: actor
    });
  });

  var blocked = [];
  changes.forEach(function (ch) {
    var role = findById_(db.roles, ch.id);
    if (!role) throw new Error('역할을 찾을 수 없습니다: ' + ch.id);

    if (role.protected) {
      if (ch.name != null || ch.description != null || ch.status === 'inactive') {
        throw new Error('보호된 기본 역할은 변경할 수 없습니다: ' + role.name);
      }
    }

    if (ch.status === 'inactive' && role.status !== 'inactive') {
      var assigned = countUsersForRole_(db, role.id);
      if (assigned > 0) {
        blocked.push({
          roleId: role.id,
          roleName: role.name,
          assignedCount: assigned
        });
        return;
      }
    }

    if (ch.name != null) role.name = String(ch.name).trim();
    if (ch.description != null) role.description = String(ch.description).trim();
    if (ch.status != null) role.status = ch.status === 'inactive' ? 'inactive' : 'active';
    role.updatedAt = now;
    role.updatedBy = actor;
  });

  if (blocked.length) {
    return {
      ok: false,
      code: 'ROLE_DEACTIVATE_BLOCKED',
      blocked: blocked,
      message: blocked[0].roleName + ' 역할에 사용자 ' + blocked[0].assignedCount + '명이 배정되어 있습니다.'
    };
  }

  saveDb_(db);
  appendAuditLog_('ROLE', db.meta.currentUser.name, '역할 변경 저장', changes.length + '건 수정, ' + newRoles.length + '건 신규');
  return { ok: true, message: '역할 변경사항이 저장되었습니다.', total: db.roles.length };
}

function getPermissionMatrix(roleId) {
  var db = ensureDb_();
  var role = findById_(db.roles, roleId);
  if (!role) throw new Error('역할을 찾을 수 없습니다.');

  var tree = buildPermissionTree_(db);
  var perms = db.permissions[roleId] || {};

  return toClient_({
    ok: true,
    role: enrichRole_(role, db),
    columns: PERM_COLUMNS,
    tree: tree,
    values: perms,
    lastSavedAt: db.permissionMeta[roleId] ? db.permissionMeta[roleId].savedAt : (role.updatedAt || ''),
    lastSavedBy: db.permissionMeta[roleId] ? db.permissionMeta[roleId].savedBy : (role.updatedBy || '')
  });
}

function savePermissionChanges(payload) {
  payload = payload || {};
  var roleId = payload.roleId;
  var changes = payload.changes || {};
  var db = ensureDb_();
  var role = findById_(db.roles, roleId);
  if (!role) throw new Error('역할을 찾을 수 없습니다.');
  if (role.protected) {
    return {
      ok: false,
      code: 'PROTECTED_ROLE',
      message: '보호 역할은 변경할 수 없습니다',
      role: enrichRole_(role, db)
    };
  }

  if (!db.permissions[roleId]) db.permissions[roleId] = {};
  Object.keys(changes).forEach(function (screenId) {
    if (!db.permissions[roleId][screenId]) {
      db.permissions[roleId][screenId] = emptyPerm_();
    }
    var patch = changes[screenId] || {};
    PERM_KEYS.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) {
        db.permissions[roleId][screenId][k] = !!patch[k];
      }
    });
  });

  db.permissionMeta[roleId] = {
    savedAt: today_(),
    savedBy: db.meta.currentUser.name
  };
  role.updatedAt = today_();
  role.updatedBy = db.meta.currentUser.name;
  saveDb_(db);
  appendAuditLog_('PERMISSION', db.meta.currentUser.name, '권한 변경 저장', role.name + ' / ' + Object.keys(changes).length + '화면');
  return { ok: true, message: '권한 변경사항이 저장되었습니다.' };
}

function resetSettingsDemoData() {
  saveDb_(createSeedDb_());
  return { ok: true, message: '데모 데이터가 초기화되었습니다.', database: getSpreadsheetInfo_() };
}

function getDatabaseInfo() {
  ensureDb_();
  return { ok: true, database: getSpreadsheetInfo_() };
}

/** Apps Script 편집기에서 한 번 실행하면 DB 시트가 생성됩니다. */
function setupDatabase() {
  var db = ensureDb_();
  var info = getSpreadsheetInfo_();
  Logger.log('DB spreadsheet: ' + info.spreadsheetUrl);
  return {
    ok: true,
    message: 'Google Sheets 데이터베이스가 준비되었습니다.',
    database: info,
    counts: {
      users: db.users.length,
      roles: db.roles.length,
      screens: (db.screens || []).length
    }
  };
}

/** ---------- Google Sheets DB (사용자_2026 스키마) ---------- */

function ensureDb_() {
  if (!isDbConfigured_()) {
    return createSeedDb_();
  }
  var ss = getSpreadsheet_();
  PropertiesService.getScriptProperties().setProperty(SPREADSHEET_ID_KEY, ss.getId());
  return readOperationalDb_(ss);
}

function saveDb_(db) {
  assertWritableDb_();
  writeOperationalDb_(getSpreadsheet_(), db);
}

function getSpreadsheet_() {
  var id = getConfiguredSpreadsheetId_();
  if (!id) throw new Error('운영 DB가 연결되지 않았습니다.');
  return SpreadsheetApp.openById(id);
}

function getOrCreateSpreadsheet_() {
  return getSpreadsheet_();
}

function getSpreadsheetInfo_() {
  var id = getConfiguredSpreadsheetId_() || '';
  var connected = false;
  var error = '';
  if (id) {
    try {
      SpreadsheetApp.openById(id);
      connected = true;
    } catch (e) {
      error = e && e.message ? e.message : String(e);
    }
  }
  return {
    connected: connected,
    type: 'Google Sheets',
    spreadsheetId: id,
    spreadsheetUrl: id ? ('https://docs.google.com/spreadsheets/d/' + id + '/edit') : '',
    error: error
  };
}

function departmentNames_(db) {
  return (db.departmentRecords || []).filter(function (d) {
    return d.status === 'active' && d.name;
  }).sort(function (a, b) {
    return (a.order || 0) - (b.order || 0);
  }).map(function (d) { return d.name; });
}

function departmentIdByName_(db, name) {
  var found = (db.departmentRecords || []).filter(function (d) { return d.name === name; })[0];
  return found ? found.id : '';
}

function departmentNameById_(db, id) {
  var found = (db.departmentRecords || []).filter(function (d) { return d.id === id; })[0];
  return found ? found.name : '';
}

function readOperationalDb_(ss) {
  var deptRows = nonemptyRows_(readRows_(ss, SHEETS.departments));
  var departmentRecords = deptRows.map(function (r) {
    return {
      id: String(r[0] || '').trim(),
      name: String(r[1] || '').trim(),
      description: String(r[2] || '').trim(),
      status: asActiveStatus_(r[3]),
      order: Number(r[4] || 0),
      createdAt: formatCellDate_(r[5]),
      createdBy: String(r[6] || ''),
      updatedAt: formatCellDate_(r[7])
    };
  }).filter(function (d) { return d.id || d.name; });

  var roleRows = nonemptyRows_(readRows_(ss, SHEETS.roles));
  var roles = roleRows.map(function (r) {
    var system = asBool_(r[4]);
    return {
      id: String(r[0] || '').trim(),
      name: String(r[1] || '').trim(),
      description: String(r[2] || '').trim(),
      status: asActiveStatus_(r[3]),
      protected: system,
      type: system ? 'default' : 'custom',
      createdAt: formatCellDate_(r[5]),
      createdBy: String(r[6] || ''),
      updatedAt: formatCellDate_(r[7]),
      updatedBy: String(r[6] || '')
    };
  }).filter(function (r) { return r.id; });

  var userRoleRows = nonemptyRows_(readRows_(ss, SHEETS.userRoles)).map(function (r) {
    return {
      id: String(r[0] || '').trim(),
      email: String(r[1] || '').trim().toLowerCase(),
      roleId: String(r[2] || '').trim(),
      assignStatus: String(r[3] || '').trim(),
      assignedAt: formatCellDate_(r[4]),
      assignedBy: String(r[5] || ''),
      releasedAt: formatCellDate_(r[6]),
      releasedBy: String(r[7] || ''),
      releaseReason: String(r[8] || '')
    };
  }).filter(function (x) { return x.email && x.roleId; });

  var rolesByEmail = {};
  userRoleRows.forEach(function (ur) {
    if (ur.assignStatus && ur.assignStatus !== '활성') return;
    if (!rolesByEmail[ur.email]) rolesByEmail[ur.email] = [];
    if (rolesByEmail[ur.email].indexOf(ur.roleId) === -1) rolesByEmail[ur.email].push(ur.roleId);
  });

  var userRows = nonemptyRows_(readRows_(ss, SHEETS.users));
  var users = userRows.map(function (r) {
    var email = String(r[0] || '').trim().toLowerCase();
    var deptId = String(r[4] || '').trim();
    return {
      id: email,
      email: email,
      name: String(r[1] || '').trim(),
      studentId: String(r[2] || '').trim(),
      phone: String(r[3] || '').trim(),
      departmentId: deptId,
      department: departmentNameById_({ departmentRecords: departmentRecords }, deptId),
      status: asActiveStatus_(r[5]),
      createdAt: formatCellDate_(r[6]),
      createdBy: String(r[7] || ''),
      inactiveAt: formatCellDate_(r[8]),
      inactiveBy: String(r[9] || ''),
      inactiveReason: String(r[10] || ''),
      updatedAt: formatCellDate_(r[11]),
      updatedBy: String(r[7] || ''),
      roleIds: rolesByEmail[email] || []
    };
  }).filter(function (u) { return u.email; });

  var catalog = nonemptyRows_(readRows_(ss, SHEETS.permissionCatalog)).map(function (r) {
    return {
      id: String(r[0] || '').trim(),
      area: String(r[1] || '').trim(),
      action: String(r[2] || '').trim(),
      name: String(r[3] || '').trim(),
      description: String(r[4] || '').trim(),
      active: asBool_(r[5])
    };
  }).filter(function (p) { return p.id; });
  catalog = ensurePagePermissionCatalog_(catalog);

  var rolePermRows = nonemptyRows_(readRows_(ss, SHEETS.rolePermissions));
  var permissions = {};
  var permIdToAreaKey = {};
  catalog.forEach(function (p) {
    var key = ACTION_TO_KEY[p.action];
    if (!key) return;
    permIdToAreaKey[p.id] = { areaId: areaId_(p.area), key: key };
  });
  rolePermRows.forEach(function (r) {
    var roleId = String(r[0] || '').trim();
    var permId = String(r[1] || '').trim();
    if (!roleId || !permId) return;
    if (!permissions[roleId]) permissions[roleId] = {};
    var mapped = permIdToAreaKey[permId];
    if (!mapped) return;
    if (!permissions[roleId][mapped.areaId]) permissions[roleId][mapped.areaId] = emptyPerm_();
    permissions[roleId][mapped.areaId][mapped.key] = true;
  });

  var screens = screensFromCatalog_(catalog);
  roles.forEach(function (role) {
    if (!role.protected) return;
    if (!permissions[role.id]) permissions[role.id] = {};
    screens.forEach(function (s) {
      if (!permissions[role.id][s.id]) permissions[role.id][s.id] = emptyPerm_();
      PERM_KEYS.forEach(function (k) {
        if (s.applicable && s.applicable[k]) permissions[role.id][s.id][k] = true;
      });
    });
  });

  var permissionMeta = {};
  rolePermRows.forEach(function (r) {
    var roleId = String(r[0] || '').trim();
    if (!roleId) return;
    permissionMeta[roleId] = {
      savedAt: formatCellDate_(r[2]),
      savedBy: String(r[3] || '')
    };
  });

  var ops = readOpsConfig_();
  var actor = getActiveUserEmail_() || 'system';
  var term = ops.settings && ops.settings['학년도']
    ? String(ops.settings['학년도']).replace(/\.0$/, '') + '학년도'
    : '2026학년도';
  var baseDate = (ops.settings && (ops.settings['운영시작일'] || ops.settings['회계시작일'])) || today_();
  return {
    meta: {
      term: term,
      baseDate: baseDate,
      seq: { user: users.length, role: roles.length },
      currentUser: { name: actor, title: '관리자' },
      ops: ops
    },
    departmentRecords: departmentRecords,
    departments: departmentRecords.map(function (d) { return d.name; }).filter(Boolean),
    roles: roles,
    users: users,
    userRoles: userRoleRows,
    permissionCatalog: catalog,
    screens: screens,
    permissions: permissions,
    permissionMeta: permissionMeta
  };
}

function writeOperationalDb_(ss, db) {
  var actor = getActiveUserEmail_() || (db.meta && db.meta.currentUser && db.meta.currentUser.name) || '';
  var now = today_();

  writeDataSheet_(ss, SHEETS.departments,
    ['부서ID', '부서명', '부서설명', '활성여부', '표시순서', '등록일시', '등록자이메일', '수정일시'],
    (db.departmentRecords || []).map(function (d, i) {
      return [
        d.id || ('dept_' + (i + 1)),
        d.name || '',
        d.description || '',
        asFlag_(d.status === 'active'),
        d.order || (i + 1),
        d.createdAt || now,
        d.createdBy || actor,
        d.updatedAt || now
      ];
    })
  );

  writeDataSheet_(ss, SHEETS.roles,
    ['역할ID', '역할명', '역할설명', '활성여부', '시스템역할여부', '등록일시', '등록자이메일', '수정일시'],
    (db.roles || []).map(function (r) {
      return [
        r.id,
        r.name || '',
        r.description || '',
        asFlag_(r.status === 'active'),
        asFlag_(!!r.protected || r.type === 'default'),
        r.createdAt || now,
        r.createdBy || actor,
        r.updatedAt || now
      ];
    })
  );

  writeDataSheet_(ss, SHEETS.users,
    ['Google이메일', '성명', '학번', '연락처', '부서ID', '활성여부', '등록일시', '등록자이메일', '비활성일시', '비활성처리자이메일', '비활성사유', '최종수정일시'],
    (db.users || []).map(function (u) {
      var deptId = u.departmentId || departmentIdByName_(db, u.department);
      var inactive = u.status !== 'active';
      return [
        u.email,
        u.name || '',
        u.studentId || '',
        u.phone || '',
        deptId || '',
        asFlag_(!inactive),
        u.createdAt || now,
        u.createdBy || actor,
        inactive ? (u.inactiveAt || now) : '',
        inactive ? (u.inactiveBy || actor) : '',
        inactive ? (u.inactiveReason || '') : '',
        u.updatedAt || now
      ];
    })
  );

  var userRoleRows = syncUserRoleRows_(db, actor, now);
  writeDataSheet_(ss, SHEETS.userRoles,
    ['사용자역할ID', 'Google이메일', '역할ID', '배정상태', '배정일시', '배정자이메일', '해제일시', '해제자이메일', '해제사유'],
    userRoleRows.map(function (ur) {
      return [
        ur.id,
        ur.email,
        ur.roleId,
        ur.assignStatus || '활성',
        ur.assignedAt || now,
        ur.assignedBy || actor,
        ur.releasedAt || '',
        ur.releasedBy || '',
        ur.releaseReason || ''
      ];
    })
  );

  writeDataSheet_(ss, SHEETS.permissionCatalog,
    ['권한ID', '업무영역', '행위', '권한명', '권한설명', '활성여부'],
    (db.permissionCatalog || []).map(function (p) {
      return [p.id, p.area || '', p.action || '', p.name || '', p.description || '', asFlag_(p.active !== false)];
    })
  );

  var rolePermRows = [];
  Object.keys(db.permissions || {}).forEach(function (roleId) {
    var byArea = db.permissions[roleId] || {};
    Object.keys(byArea).forEach(function (areaId) {
      var flags = byArea[areaId] || {};
      PERM_KEYS.forEach(function (key) {
        if (!flags[key]) return;
        var permId = catalogPermId_(db, areaId, key);
        if (!permId) return;
        var meta = db.permissionMeta[roleId] || {};
        rolePermRows.push([roleId, permId, meta.savedAt || now, meta.savedBy || actor]);
      });
    });
  });
  writeDataSheet_(ss, SHEETS.rolePermissions,
    ['역할ID', '권한ID', '등록일시', '등록자이메일'],
    rolePermRows
  );
}

function syncUserRoleRows_(db, actor, now) {
  var existing = (db.userRoles || []).slice();
  var byKey = {};
  existing.forEach(function (ur) {
    byKey[ur.email + '|' + ur.roleId] = ur;
  });
  (db.users || []).forEach(function (u) {
    var wanted = u.roleIds || [];
    wanted.forEach(function (roleId) {
      var key = u.email + '|' + roleId;
      if (byKey[key] && byKey[key].assignStatus === '활성') return;
      if (byKey[key]) {
        byKey[key].assignStatus = '활성';
        byKey[key].assignedAt = now;
        byKey[key].assignedBy = actor;
        byKey[key].releasedAt = '';
        byKey[key].releasedBy = '';
        byKey[key].releaseReason = '';
      } else {
        var row = {
          id: 'user_role_' + String(u.email).split('@')[0] + '_' + roleId,
          email: u.email,
          roleId: roleId,
          assignStatus: '활성',
          assignedAt: now,
          assignedBy: actor
        };
        existing.push(row);
        byKey[key] = row;
      }
    });
    existing.forEach(function (ur) {
      if (ur.email !== u.email) return;
      if (wanted.indexOf(ur.roleId) === -1 && ur.assignStatus === '활성') {
        ur.assignStatus = '해제';
        ur.releasedAt = now;
        ur.releasedBy = actor;
        ur.releaseReason = '역할 변경';
      }
    });
  });
  db.userRoles = existing;
  return existing.filter(function (ur) { return ur.email && ur.roleId; });
}

function catalogPermId_(db, areaId, key) {
  var action = KEY_TO_ACTION[key];
  var found = (db.permissionCatalog || []).filter(function (p) {
    return areaId_(p.area) === areaId && p.action === action;
  })[0];
  return found ? found.id : '';
}

function ensurePagePermissionCatalog_(catalog) {
  catalog = catalog || [];
  var byId = {};
  catalog.forEach(function (p) { byId[p.id] = true; });
  PAGE_PERMISSION_DEFS.forEach(function (page) {
    page.actions.forEach(function (action) {
      var key = ACTION_TO_KEY[action];
      var id = page.id + '_' + (key || 'view');
      if (byId[id]) return;
      catalog.push({
        id: id,
        area: page.area,
        action: action,
        name: page.area + ' ' + action,
        description: page.area + ' 페이지의 ' + action + ' 권한입니다. 조회가 있어야 해당 메뉴에 들어갈 수 있습니다.',
        active: true
      });
      byId[id] = true;
    });
  });
  return catalog;
}

function readOpsConfig_() {
  var result = {
    connected: false,
    spreadsheetId: OPERATIONAL_OPS_SPREADSHEET_ID,
    spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/' + OPERATIONAL_OPS_SPREADSHEET_ID + '/edit',
    settings: {},
    semesters: [],
    error: ''
  };
  try {
    var ss = SpreadsheetApp.openById(OPERATIONAL_OPS_SPREADSHEET_ID);
    result.connected = true;
    nonemptyRows_(readRows_(ss, '_설정')).forEach(function (r) {
      var key = String(r[0] || '').trim();
      if (!key) return;
      result.settings[key] = formatCellDate_(r[1]) || String(r[1] == null ? '' : r[1]).replace(/\.0$/, '');
    });
    nonemptyRows_(readRows_(ss, '학기기준')).forEach(function (r) {
      var id = String(r[0] || '').trim();
      if (!id) return;
      result.semesters.push({
        id: id,
        year: String(r[1] || '').replace(/\.0$/, ''),
        term: String(r[2] || ''),
        start: formatCellDate_(r[3]),
        end: formatCellDate_(r[4]),
        active: asBool_(r[5])
      });
    });
  } catch (e) {
    result.error = e && e.message ? e.message : String(e);
  }
  return result;
}

function screensFromCatalog_(catalog) {
  var areas = {};
  (catalog || []).forEach(function (p) {
    if (!p.active && p.active !== undefined && p.active !== true) return;
    if (!p.area) return;
    var id = areaId_(p.area);
    if (!areas[id]) {
      areas[id] = { id: id, name: p.area, parentId: null, group: p.area, applicable: emptyPerm_() };
    }
    var key = ACTION_TO_KEY[p.action];
    if (key) areas[id].applicable[key] = true;
  });
  return Object.keys(areas).map(function (k) { return areas[k]; });
}

function areaId_(name) {
  var map = {
    '설정': 'settings',
    '사용자': 'users',
    '역할': 'roles',
    '권한': 'permissions',
    '메인화면': 'home',
    '장부관리': 'ledger',
    '학생회비관리': 'fee',
    '행사복지관리': 'event'
  };
  if (map[name]) return map[name];
  return String(name || 'area').toLowerCase().replace(/\s+/g, '_');
}

function nonemptyRows_(rows) {
  return (rows || []).filter(function (r) {
    return r && r.some(function (cell) {
      var s = String(cell == null ? '' : cell).trim();
      return s && s !== '0';
    });
  });
}

function asActiveStatus_(value) {
  return asBool_(value) ? 'active' : 'inactive';
}

function asFlag_(on) {
  return on ? 1 : 0;
}

function nowStamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
}

function writeDataSheet_(ss, name, headers, rows) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  var lastRow = Math.max(sheet.getLastRow(), 1);
  var lastCol = Math.max(sheet.getLastColumn(), headers.length);
  if (lastRow > 1) sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (rows && rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

function provisionCurrentUser_(db, email) {
  var now = today_();
  db.users.push({
    id: email,
    email: email,
    name: email.split('@')[0],
    studentId: '',
    phone: '',
    departmentId: '',
    department: '',
    roleIds: [ADMIN_ROLE_ID],
    status: 'active',
    createdAt: now,
    createdBy: email,
    updatedAt: now,
    updatedBy: email
  });
  if (!findById_(db.roles, ADMIN_ROLE_ID)) {
    db.roles.unshift({
      id: ADMIN_ROLE_ID,
      name: '관리자',
      description: '시스템 관리자',
      status: 'active',
      protected: true,
      type: 'default',
      createdAt: now,
      createdBy: email,
      updatedAt: now,
      updatedBy: email
    });
  }
  try {
    saveDb_(db);
  } catch (e) {
    // 시트 쓰기 권한이 없으면 메모리에서만 관리자 세션 유지
  }
  return db;
}

function mergeDbDefaults_(db, fallback) {
  return db || fallback || createSeedDb_();
}


function writeSheet_(ss, name, headers, rows) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  sheet.clear();
  var values = [headers].concat(rows || []);
  sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  sheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#eef0f3');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

function readRows_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];
  return values.slice(1);
}

function readSheetWithHeader_(ss, name) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) return { headers: [], rows: [] };
  var values = sheet.getDataRange().getValues();
  if (!values || !values.length) return { headers: [], rows: [] };
  return {
    headers: values[0].map(function (h) { return String(h).trim(); }),
    rows: values.slice(1)
  };
}

function colIndex_(headers, name, fallback) {
  var i = headers.indexOf(name);
  return i >= 0 ? i : fallback;
}

function userSheetHasStudentColumns_(ss) {
  var sheet = ss.getSheetByName(SHEETS.users);
  if (!sheet) return false;
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  return headers.indexOf('학번') >= 0 && headers.indexOf('연락처') >= 0;
}

function readKeyValueSheet_(ss, name) {
  var map = {};
  readRows_(ss, name).forEach(function (r) {
    var key = String(r[0] || '').trim();
    if (key) map[key] = r[1];
  });
  return map;
}

function removeDefaultSheet_(ss) {
  var extra = ss.getSheetByName('시트1') || ss.getSheetByName('Sheet1');
  if (extra && ss.getSheets().length > 1) {
    ss.deleteSheet(extra);
  }
}

function asBool_(value) {
  if (value === true || value === false) return value;
  var s = String(value == null ? '' : value).trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'Y' || s === 'YES' || s === '예';
}

function formatCellDate_(value) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
  }
  return String(value);
}

function createSeedDb_() {
  var roles = [
    { id: 'role_admin', name: '시스템 관리자', type: 'default', description: '전체 설정 및 권한 관리', status: 'active', protected: true, updatedAt: '2026-07-31', updatedBy: '운영자' },
    { id: 'role_finance', name: '회계 담당', type: 'default', description: '장부·결산 업무 처리', status: 'active', protected: false, updatedAt: '2026-07-30', updatedBy: '운영자' },
    { id: 'role_event', name: '행사 담당', type: 'default', description: '행사 신청·참가자 업무 처리', status: 'active', protected: false, updatedAt: '2026-07-29', updatedBy: '운영자' },
    { id: 'role_audit', name: '감사 조회', type: 'default', description: '결산·감사 자료 조회', status: 'active', protected: false, updatedAt: '2026-07-28', updatedBy: '운영자' },
    { id: 'role_viewer', name: '일반 조회', type: 'default', description: '기본 정보 조회', status: 'inactive', protected: false, updatedAt: '2026-07-20', updatedBy: '운영자' },
    { id: 'role_ops', name: '행사 운영', type: 'custom', description: '행사 신청·출석·정산 운영', status: 'active', protected: false, updatedAt: '2026-08-02', updatedBy: '운영자' }
  ];

  var users = [
    { id: 'user_1', name: '운영 담당자 A', email: 'operator01@example.edu', studentId: '20260001', phone: '010-0000-0001', department: '운영국', roleIds: ['role_admin', 'role_event'], status: 'active', updatedAt: '2026-08-02', updatedBy: '운영자' },
    { id: 'user_2', name: '회계 담당자 A', email: 'finance01@example.edu', studentId: '20260002', phone: '010-0000-0002', department: '회계국', roleIds: ['role_finance'], status: 'active', updatedAt: '2026-07-31', updatedBy: '운영자' },
    { id: 'user_3', name: '행사 담당자 A', email: 'event01@example.edu', studentId: '20260003', phone: '010-0000-0003', department: '복지국', roleIds: ['role_event'], status: 'active', updatedAt: '2026-07-30', updatedBy: '운영자' },
    { id: 'user_4', name: '감사 담당자 A', email: 'audit01@example.edu', studentId: '20260004', phone: '010-0000-0004', department: '감사위원회', roleIds: ['role_audit'], status: 'active', updatedAt: '2026-07-29', updatedBy: '운영자' },
    { id: 'user_5', name: '이전 담당자 A', email: 'former01@example.edu', studentId: '20260005', phone: '010-0000-0005', department: '운영국', roleIds: ['role_viewer'], status: 'inactive', updatedAt: '2026-07-20', updatedBy: '운영자' }
  ];

  var screens = buildScreenCatalog_();
  var permissions = {};
  roles.forEach(function (r) {
    permissions[r.id] = defaultPermissionsForRole_(r.id, screens);
  });

  return {
    meta: {
      term: '2026학년도',
      baseDate: '2026-07-31',
      seq: { user: 5, role: 6 },
      currentUser: { name: '운영자', title: '관리자' }
    },
    departments: ['운영국', '회계국', '복지국', '감사위원회', '대외협력국'],
    departmentRecords: ['운영국', '회계국', '복지국', '감사위원회', '대외협력국'].map(function (name, i) {
      return { id: 'dept_' + (i + 1), name: name, description: '', status: 'active', order: i + 1 };
    }),
    permissionCatalog: [],
    userRoles: [],
    roles: roles,
    users: users,
    screens: screens,
    permissions: permissions,
    permissionMeta: {
      role_finance: { savedAt: '2026-08-03', savedBy: '운영자' }
    }
  };
}

function buildScreenCatalog_() {
  return [
    { id: 'home', name: '메인화면', parentId: null, group: '메인화면', applicable: { menu: true, view: true, edit: false, approve: false, export: false } },
    { id: 'ledger', name: '장부관리', parentId: null, group: '장부관리', applicable: { menu: true, view: true, edit: true, approve: true, export: true } },
    { id: 'ledger_income', name: '수입·지출 관리', parentId: 'ledger', group: '장부관리', applicable: { menu: true, view: true, edit: true, approve: true, export: false } },
    { id: 'ledger_reconcile', name: '계좌내역 대조', parentId: 'ledger', group: '장부관리', applicable: { menu: true, view: true, edit: true, approve: true, export: false } },
    { id: 'ledger_report', name: '결산 보고서', parentId: 'ledger', group: '장부관리', applicable: { menu: true, view: true, edit: false, approve: false, export: true } },
    { id: 'ledger_audit', name: '증빙·감사 이력', parentId: 'ledger', group: '장부관리', applicable: { menu: true, view: true, edit: false, approve: false, export: true } },
    { id: 'fee', name: '학생회비관리', parentId: null, group: '학생회비관리', applicable: { menu: true, view: true, edit: true, approve: true, export: true } },
    { id: 'fee_collect', name: '회비 납부 현황', parentId: 'fee', group: '학생회비관리', applicable: { menu: true, view: true, edit: true, approve: true, export: true } },
    { id: 'fee_exempt', name: '감면·환불 처리', parentId: 'fee', group: '학생회비관리', applicable: { menu: true, view: true, edit: true, approve: true, export: false } },
    { id: 'event', name: '행사복지관리', parentId: null, group: '행사복지관리', applicable: { menu: true, view: true, edit: true, approve: true, export: true } },
    { id: 'event_list', name: '행사 목록', parentId: 'event', group: '행사복지관리', applicable: { menu: true, view: true, edit: true, approve: false, export: true } },
    { id: 'event_apply', name: '신청·참가자', parentId: 'event', group: '행사복지관리', applicable: { menu: true, view: true, edit: true, approve: true, export: true } },
    { id: 'event_attend', name: '출석 관리', parentId: 'event', group: '행사복지관리', applicable: { menu: true, view: true, edit: true, approve: true, export: false } },
    { id: 'event_settle', name: '행사 정산', parentId: 'event', group: '행사복지관리', applicable: { menu: true, view: true, edit: true, approve: true, export: true } },
    { id: 'event_welfare', name: '복지 지원', parentId: 'event', group: '행사복지관리', applicable: { menu: true, view: true, edit: true, approve: true, export: false } },
    { id: 'event_report', name: '행사 보고', parentId: 'event', group: '행사복지관리', applicable: { menu: true, view: true, edit: false, approve: false, export: true } },
    { id: 'settings', name: '설정', parentId: null, group: '설정', applicable: { menu: true, view: true, edit: true, approve: false, export: true } },
    { id: 'settings_users', name: '사용자 관리', parentId: 'settings', group: '설정', applicable: { menu: true, view: true, edit: true, approve: false, export: true } },
    { id: 'settings_roles', name: '역할 관리', parentId: 'settings', group: '설정', applicable: { menu: true, view: true, edit: true, approve: false, export: false } },
    { id: 'settings_perms', name: '업무 권한 설정', parentId: 'settings', group: '설정', applicable: { menu: true, view: true, edit: true, approve: false, export: false } }
  ];
}

function defaultPermissionsForRole_(roleId, screens) {
  var map = {};
  screens.forEach(function (s) {
    var p = emptyPerm_();
    if (roleId === 'role_admin') {
      PERM_KEYS.forEach(function (k) { p[k] = !!s.applicable[k]; });
    } else if (roleId === 'role_finance') {
      if (s.group === '메인화면' || s.group === '장부관리') {
        p.menu = !!s.applicable.menu;
        p.view = !!s.applicable.view;
        if (s.id === 'ledger_income') { p.edit = true; p.approve = false; }
        if (s.id === 'ledger_reconcile') { p.edit = false; p.approve = true; }
        if (s.id === 'ledger_report') { p.export = false; }
        if (s.id === 'ledger_audit') { p.export = true; }
      }
      if (s.id === 'ledger') { p.menu = true; p.view = true; }
    } else if (roleId === 'role_event' || roleId === 'role_ops') {
      if (s.group === '메인화면' || s.group === '행사복지관리') {
        p.menu = !!s.applicable.menu;
        p.view = !!s.applicable.view;
        p.edit = !!s.applicable.edit;
      }
    } else if (roleId === 'role_audit') {
      if (s.group === '메인화면' || s.group === '장부관리') {
        p.menu = !!s.applicable.menu;
        p.view = !!s.applicable.view;
        p.export = s.id === 'ledger_report' || s.id === 'ledger_audit';
      }
    } else if (roleId === 'role_viewer') {
      if (s.id === 'home') { p.menu = true; p.view = true; }
    }
    map[s.id] = p;
  });
  return map;
}

function buildPermissionTree_(db) {
  var screens = db.screens && db.screens.length
    ? db.screens
    : screensFromCatalog_(db.permissionCatalog || []);
  if (!screens.length) screens = buildScreenCatalog_();
  var roots = screens.filter(function (s) { return !s.parentId; });
  if (!roots.length) roots = screens;
  return roots.map(function (root) {
    var children = screens.filter(function (s) { return s.parentId === root.id; });
    return {
      id: root.id,
      name: root.name,
      group: root.group || root.name,
      applicable: root.applicable || emptyPerm_(),
      children: children.map(function (c) {
        return {
          id: c.id,
          name: c.name,
          group: c.group,
          applicable: c.applicable,
          children: []
        };
      })
    };
  });
}

function enrichUser_(u, db) {
  var roles = (u.roleIds || []).map(function (id) {
    var r = findById_(db.roles, id);
    return r ? { id: r.id, name: r.name } : { id: id, name: id };
  });
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    studentId: u.studentId || '',
    phone: u.phone || '',
    department: u.department,
    roleIds: (u.roleIds || []).slice(),
    roles: roles,
    status: u.status,
    updatedAt: u.updatedAt,
    updatedBy: u.updatedBy
  };
}

function enrichRole_(r, db) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    typeLabel: r.type === 'custom' ? '사용자 정의' : '기본 역할',
    description: r.description,
    status: r.status,
    protected: !!r.protected,
    assignedCount: countUsersForRole_(db, r.id),
    updatedAt: r.updatedAt,
    updatedBy: r.updatedBy
  };
}

function summarizeRole_(r) {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    status: r.status,
    protected: !!r.protected
  };
}

function countUsersForRole_(db, roleId) {
  return db.users.filter(function (u) {
    return (u.roleIds || []).indexOf(roleId) !== -1;
  }).length;
}

function validateUserInput_(nu, requireEmail) {
  if (!nu || !String(nu.name || '').trim()) throw new Error('이름을 입력하세요.');
  if (requireEmail && !String(nu.email || '').trim()) throw new Error('이메일을 입력하세요.');
  if (nu.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(nu.email).trim())) {
    throw new Error('이메일 형식이 올바르지 않습니다.');
  }
  if (nu.department) {
    /* optional when 부서 시트가 비어 있음 */
  }
  var roleIds = normalizeRoleIds_(nu.roleIds || nu.roleId);
  if (!roleIds.length) throw new Error('역할을 선택하세요.');
}

function normalizeRoleIds_(value) {
  if (!value) return [];
  if (Object.prototype.toString.call(value) === '[object Array]') {
    return value.filter(Boolean);
  }
  return [value].filter(Boolean);
}

function findUserByEmail_(db, email) {
  var target = String(email || '').trim().toLowerCase();
  return db.users.filter(function (u) { return u.email === target; })[0];
}

function findById_(list, id) {
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function nextId_(db, kind) {
  db.meta.seq[kind] = (db.meta.seq[kind] || 0) + 1;
  return kind + '_' + db.meta.seq[kind];
}

function emptyPerm_() {
  return { menu: false, view: false, edit: false, approve: false, export: false };
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Seoul', 'yyyy-MM-dd');
}

function getActiveUserEmail_() {
  try {
    return String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  } catch (e) {
    return '';
  }
}

function resolveSessionUser_(db, email) {
  var fallback = (db.meta && db.meta.currentUser) || { name: '운영자', title: '관리자' };
  if (!email) return fallback;
  var user = findUserByEmail_(db, email);
  if (!user) {
    return {
      name: fallback.name,
      title: fallback.title
    };
  }
  var primaryRole = (user.roleIds || []).map(function (id) {
    return findById_(db.roles, id);
  }).filter(Boolean)[0];
  return {
    name: user.name || fallback.name,
    title: primaryRole ? primaryRole.name : fallback.title
  };
}

function isSystemAdmin_(db, sessionUser) {
  var email = getActiveUserEmail_();
  if (!email) return true;
  var user = findUserByEmail_(db, email);
  if (!user) return false;
  return (user.roleIds || []).indexOf(ADMIN_ROLE_ID) !== -1 && user.status === 'active';
}

function findSpreadsheetInFolder_(folderId) {
  var folder = DriveApp.getFolderById(folderId);
  var preferred = null;
  var first = null;
  var files = folder.getFilesByType(MimeType.GOOGLE_SHEETS);
  while (files.hasNext()) {
    var file = files.next();
    if (!first) first = file.getId();
    if (file.getName().indexOf('학생회 통합 업무관리 DB') >= 0) {
      preferred = file.getId();
      break;
    }
  }
  return preferred || first;
}
