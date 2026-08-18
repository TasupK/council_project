// 1. 로그인 가능 여부 확인
/** COM_API_001 로그인 계정 확인 */
function api_checkLogin() {
  var context = getSessionUserContext_(); // auth_context.gs
  if (!context.ok) return context;
  return okResponse_({
    email: context.email,
    user: context.user,
    isAdmin: context.isAdmin,
    domainAccess: buildDomainAccess_(context.permissions || {}, context.isAdmin),
    dbMode: context.dbMode,
    preview: false
  });
}

// 2. 현재 로그인 사용자 정보 조회
/** COM_API_002 현재 사용자 조회 */
function api_getCurrentUser() {
  var context = getSessionUserContext_();
  if (!context.ok) return context;

  return okResponse_({
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
    domainAccess: buildDomainAccess_(context.permissions || {}, context.isAdmin),
    dbMode: context.dbMode,
    menus: context.permissions.menus || []
  });
}

// 3. 현재 로그인 사용자의 권한 조회
/** COM_API_018 내 권한 조회 */
function api_getMyPermissions() {
  var current = api_getCurrentUser();
  if (!current.ok) return current;
  var permissionDetails = typeof buildEffectivePermissionDetails_ === 'function'
    ? buildEffectivePermissionDetails_(current.permissions || {})
    : [];
  return okResponse_({
    roles: current.user.roles || [],
    permissions: current.permissions || {},
    permissionDetails: permissionDetails
  });
}
