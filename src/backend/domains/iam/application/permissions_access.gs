// 1. 보호 API 권한 검증
function requirePermission_(context, permission) {
  var screenId = resolveRequiredPermissionScreenId_(permission);
  var action = permission && permission.action ? permission.action : 'view';
  var grants;

  if (!permission) return true;
  if (!context || !context.ok) throwPermissionError_('로그인 컨텍스트가 없습니다.');
  if (context.isAdmin) return true;
  if (!screenId) throwPermissionError_('권한 ID가 정의되지 않았습니다.');

  grants = context.permissions && context.permissions.byScreen
    ? context.permissions.byScreen[screenId]
    : null;

  if (grants && grants[action]) return true;
  throwPermissionError_('권한이 없습니다.');
}

// 2. 권한 선언을 화면 권한 노드ID로 변환
function resolveRequiredPermissionScreenId_(permission) {
  if (!permission) return '';
  if (permission.screenId) return permission.screenId;
  if (permission.id) return resolvePermissionScreenId_({ id: permission.id });
  return '';
}

// 3. 도메인 별칭과 action으로 활성 권한 screenId를 찾는다.
function resolvePermissionByAliases_(access, aliases) {
  var action = String(access && access.action || '').trim().toLowerCase();
  var explicitScreenId = String(access && access.screenId || '').trim();
  var normalizedAliases = (aliases || []).map(normalizePermissionAccessToken_);
  var candidates = [];
  var permissionsById = buildPermissionsById_();

  Object.keys(permissionsById).forEach(function (permissionId) {
    var permission = permissionsById[permissionId];
    if (!permission || permission.status === 'inactive') return;
    var screenId = resolvePermissionScreenId_(permission);
    if (explicitScreenId && screenId !== explicitScreenId) return;
    if (mapActionToPermissionKey_(String(permission.action || '')) !== action) return;
    var token = normalizePermissionAccessToken_([permission.area, permission.name, permission.description].join(' '));
    var inDomain = normalizedAliases.some(function (alias) { return token.indexOf(alias) !== -1; });
    if (!inDomain) return;
    candidates.push({ screenId: screenId, action: action });
  });

  if (candidates.length === 1) return candidates[0];
  if (!candidates.length) throwPermissionError_('요청한 업무 권한을 찾을 수 없습니다.');
  throwPermissionError_('요청한 업무 권한 매핑이 둘 이상이라 screenId를 명시해야 합니다.');
}

function normalizePermissionAccessToken_(value) {
  return String(value || '').toLowerCase().replace(/[\s_-]+/g, '');
}

// 4. 권한 검증 실패 생성
function throwPermissionError_(message) {
  var error = new Error(message || '권한이 없습니다.');
  error.code = 'FORBIDDEN';
  throw error;
}
