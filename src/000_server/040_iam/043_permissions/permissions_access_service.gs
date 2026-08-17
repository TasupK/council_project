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
  if (permission.id) return permissionScreenId_({ id: permission.id });
  return '';
}

// 3. 권한 검증 실패 생성
function throwPermissionError_(message) {
  var error = new Error(message || '권한이 없습니다.');
  error.code = 'FORBIDDEN';
  throw error;
}
