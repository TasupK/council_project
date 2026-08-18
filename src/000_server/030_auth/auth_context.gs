// 1. 로그인 사용자 컨텍스트 생성
function getSessionUserContext_() {
  var email = getActiveUserEmailFromSession_();
  if (!email) return failResponse_('NO_SESSION', 'Google 로그인이 필요합니다.');

  var cachedContext = getCachedLoginContext_(email);
  if (cachedContext) return cachedContext;

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

  var context = buildSessionUserContextFromDb_(email);
  if (context.ok) cacheLoginContext_(email, context);
  return context;
}

// 2. IAM 데이터로 로그인 컨텍스트 생성
function buildSessionUserContextFromDb_(email) {
  var userRow = findUserRowByEmail_(email);
  if (!userRow) return failResponse_('NOT_REGISTERED', '등록되지 않은 Google 계정입니다.', { email: email });
  var userFields = getUserDbFields_('users');
  if (!isActiveStatus_(userRow[userFields.status])) {
    return failResponse_('INACTIVE', '비활성화된 계정입니다.', { email: email });
  }

  var roleMap = buildRolesById_();
  var roleIdsByEmail = getActiveRoleIdsByEmail_();
  var roleIds = roleIdsByEmail[email] || [];
  if (roleIds.length === 0) {
    return failResponse_('NO_ROLE', '배정된 역할이 없는 계정입니다.', { email: email });
  }

  var loginIntegrity = checkLoginUserDbIntegrity_(email, roleIds);
  if (!loginIntegrity.valid) {
    return failResponse_('LOGIN_DB_INTEGRITY_ERROR', '로그인 사용자의 DB 무결성이 올바르지 않습니다.', {
      email: email,
      issues: loginIntegrity.issues
    });
  }

  var roles = roleIds.map(function (roleId) {
    return summarizeRoleForUser_(roleMap[roleId], roleId);
  });
  var user = mapUserDto_(userRow, roleIds, roles);
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

// 3. 모든 보호 API에서 사용하는 로그인 컨텍스트 검증
function requireLoginContext_() {
  var context = getSessionUserContext_();
  if (context && context.ok) return context;

  var code = context && context.code ? context.code : 'NO_SESSION';
  var message = context && context.message ? context.message : '로그인이 필요합니다.';
  console.error('Login context validation failed.', { code: code });

  var error = new Error(message);
  error.code = code;
  throw error;
}
