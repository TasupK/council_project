// 1. 로그인 가능 여부 확인
/** COM_API_001 로그인 계정 확인 */
function api_checkLogin() {
  var context = getSessionUserContext_(); // auth_context.gs
  if (!context.ok) return context;
  var domainAccess = typeof buildDomainAccess_ === 'function'
    ? buildDomainAccess_(context.permissions || {}, context.isAdmin)
    : {};
  return okResponse_({
    email: context.email,
    user: context.user,
    isAdmin: context.isAdmin,
    domainAccess: domainAccess,
    dbMode: context.dbMode,
    preview: false
  });
}

function requireAuthenticatedUserData_() {
  var context = getSessionUserContext_();
  if (!context.ok) {
    var error = new Error(context.message || '로그인 정보를 확인할 수 없습니다.');
    error.code = context.code || 'UNAUTHORIZED';
    error.details = {};
    throw error;
  }
  var domainAccess = typeof buildDomainAccess_ === 'function'
    ? buildDomainAccess_(context.permissions || {}, context.isAdmin)
    : {};

  return {
    user: {
      id: context.user.id,
      name: context.user.name,
      title: context.roles.length ? context.roles[0].name : '',
      email: context.email,
      departmentId: context.user.departmentId || '',
      department: context.user.department || '',
      status: context.user.status,
      roleIds: context.user.roleIds || [],
      roles: context.roles || []
    },
    permissions: context.permissions || {},
    isAdmin: context.isAdmin,
    domainAccess: domainAccess,
    dbMode: context.dbMode,
    menus: context.permissions.menus || [],
    notifications: getNotificationSettings_(context.user.notifications)
  };
}

// 2. 현재 로그인 사용자 정보 조회
/** COM_API_002 현재 사용자 조회 */
function api_getCurrentUser() {
  return wrapApiSuccess_(requireAuthenticatedUserData_());
}

function getNotificationSettings_(dbNotiStr) {
  var userSettings = {};
  try {
    userSettings = dbNotiStr ? JSON.parse(dbNotiStr) : {};
  } catch(e) {}

  var defaults = [
    { id: 'account-status', name: '계정 상태 변경', description: '계정 활성·비활성 변경 안내', required: true, inApp: true, gmail: true },
    { id: 'role-permissions', name: '역할·권한 변경', description: '역할 배정 및 업무 권한 변경', required: true, inApp: true, gmail: true },
    { id: 'approval-result', name: '승인·처리 결과', description: '신청·승인·환불 처리 결과', required: true, inApp: true, gmail: true },
    { id: 'deadline', name: '마감 사전 알림', description: '마감 3일 전 사전 안내', required: false, inApp: true, gmail: true },
    { id: 'daily-summary', name: '일일 업무 요약', description: '오늘의 처리 항목 요약', required: false, inApp: true, gmail: true },
    { id: 'event-schedule', name: '행사 일정·변경', description: '행사 일정과 변경 사항 안내', required: false, inApp: true, gmail: true }
  ];

  return defaults.map(function(item) {
    if (userSettings[item.id]) {
      item.inApp = item.required ? true : !!userSettings[item.id].inApp;
      item.gmail = item.required ? true : !!userSettings[item.id].gmail;
    }
    return item;
  });
}

/** COM_API_019 알림 설정 저장 */
function api_saveNotificationSettings(payload) {
  var rawChanges = payload && payload.request ? payload.request : payload;
  var changes = [];
  
  if (Array.isArray(rawChanges)) {
    changes = rawChanges;
  } else if (rawChanges && typeof rawChanges === 'object') {
    changes = Object.keys(rawChanges).map(function(k) { return rawChanges[k]; });
  }
  
  if (!changes || changes.length === 0) {
    throw new Error('Invalid parameters');
  }
  
  var context = getSessionUserContext_();
  if (!context || !context.user || !context.email) throw new Error('로그인이 필요합니다.');
  var email = context.email;
  
  var dbNotiStr = context.user.notifications;
  var userSettings = {};
  try {
    userSettings = dbNotiStr ? JSON.parse(dbNotiStr) : {};
  } catch(e) {}

  changes.forEach(function(c) {
    userSettings[c.id] = { inApp: c.inApp, gmail: c.gmail };
  });

  updateSheetCrudItemById_('user', 'users', email, { notifications: JSON.stringify(userSettings) });
  
  if (typeof clearLoginContextCache_ === 'function') {
    clearLoginContextCache_(email);
  }

  var results = changes.map(function(c) { return { id: c.id, success: true }; });
  return wrapApiSuccess_({ results: results });
}

// 3. 현재 로그인 사용자의 권한 조회
/** COM_API_018 내 권한 조회 */
function api_getMyPermissions() {
  var current = requireAuthenticatedUserData_();
  var permissionDetails = typeof buildEffectivePermissionDetails_ === 'function'
    ? buildEffectivePermissionDetails_(current.permissions || {})
    : [];
  return wrapApiSuccess_({
    roles: current.user.roles || [],
    permissions: current.permissions || {},
    permissionDetails: permissionDetails
  });
}
