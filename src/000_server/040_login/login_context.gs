// 1. 로그인 사용자 컨텍스트 생성
function getSessionUserContext_() {
  // 사용자 로그인 확인
  var email = getActiveUserEmailFromSession_(); // login_session.gs
  if (!email) return failResponse_('NO_SESSION', 'Google 로그인이 필요합니다.');

  // 로그인 컨텍스트 캐시 조회
  var cachedContext = getCachedLoginContext_(email); // login_cache.gs
  if (cachedContext) return cachedContext;

  // 동시에 발생한 캐시 생성 요청을 한 번으로 제한
  var lock = LockService.getScriptLock();
  var hasLock = lock.tryLock(5000);
  if (hasLock) {
    try {
      cachedContext = getCachedLoginContext_(email);
      if (cachedContext) return cachedContext;

      var lockedContext = buildSessionUserContextFromDb_(email);
      if (lockedContext.ok) cacheLoginContext_(email, lockedContext);
      return lockedContext;
    } finally {
      lock.releaseLock();
    }
  }

  // 잠금 대기시간을 초과하면 캐시 없이 로그인 검증 진행
  var context = buildSessionUserContextFromDb_(email);
  if (context.ok) cacheLoginContext_(email, context);
  return context;
}

// 2. 사용자 DB에서 로그인 컨텍스트 생성
function buildSessionUserContextFromDb_(email) {
  // 사용자 DB 조회 
  var userRow = findUserRowByEmail_(email); // users.gs
  if (!userRow) return failResponse_('NOT_REGISTERED', '등록되지 않은 Google 계정입니다.', { email: email });
  var userFields = getUserDbFields_('users'); // user_db_schema.gs
  if (!isActiveStatus_(userRow[userFields.status])) {
    return failResponse_('INACTIVE', '비활성화된 계정입니다.', { email: email });
  }

  // 사용자 DB 역할 조회
  var roleMap = getRolesById_(); // roles.gs
  var roleIdsByEmail = getActiveRoleIdsByEmail_(); // roles.gs
  var roleIds = roleIdsByEmail[email] || [];
  if (roleIds.length === 0) {
    return failResponse_('NO_ROLE', '배정된 역할이 없는 계정입니다.', { email: email });
  }

  // 로그인 사용자와 연결된 UserDB 참조 무결성 확인
  var loginIntegrity = checkLoginUserDbIntegrity_(email, roleIds); // user_db_integrity.gs
  if (!loginIntegrity.valid) {
    return failResponse_('LOGIN_DB_INTEGRITY_ERROR', '로그인 사용자의 DB 무결성이 올바르지 않습니다.', {
      email: email,
      issues: loginIntegrity.issues
    });
  }

  // 사용자 컨텍스트 데이터 생성
  var roles = roleIds.map(function (roleId) {
    return summarizeRoleForUser_(roleMap[roleId], roleId);
  });
  var user = toUserDto_(userRow, roleIds, roles);
  var permissions = buildUserPermissionsFromDb_(roleIds);

  return okResponse_({
    email: email,
    user: user,
    roles: roles,
    permissions: permissions,
    isAdmin: isAdminRoleSet_(roleIds, roleMap),
    dbMode: 'connected',
    preview: false
  });
}

// 3. 관리자 역할 여부 판단
function isAdminRoleSet_(roleIds, roleMap) {
  for (var i = 0; i < roleIds.length; i += 1) {
    var roleId = roleIds[i];
    var role = roleMap[roleId];
    if (roleId === ADMIN_ROLE_ID) return true;
    if (role && role.protected) return true;
    if (role && role.name && role.name.indexOf('관리자') !== -1) return true;
  }
  return false;
}

// 4. 역할별 권한을 사용자 권한으로 병합
function buildUserPermissionsFromDb_(roleIds) {
  var permissionsByRole = buildPermissionsByRoleFromDb_();
  var merged = {};

  (roleIds || []).forEach(function (roleId) {
    var byScreen = permissionsByRole[roleId] || {};
    Object.keys(byScreen).forEach(function (screenId) {
      if (!merged[screenId]) {
        merged[screenId] = { menu: false, view: false, edit: false, approve: false, export: false };
      }
      SETTINGS_PERMISSION_COLUMNS.forEach(function (column) {
        merged[screenId][column.key] = merged[screenId][column.key] || !!byScreen[screenId][column.key];
      });
    });
  });

  return {
    byScreen: merged,
    menus: buildMenusFromPermissions_(merged)
  };
}

// 5. 권한이 있는 메뉴 목록 생성
function buildMenusFromPermissions_(permissionsByScreen) {
  var tree = buildPermissionTreeFromDb_();
  var menus = [];

  tree.forEach(function (group) {
    var hasAny = group.children.some(function (child) {
      var permission = permissionsByScreen[child.id];
      return permission && (permission.menu || permission.view || permission.edit || permission.approve || permission.export);
    });
    if (hasAny) menus.push({ id: group.id, name: group.name, group: group.group });
  });

  return menus;
}
