// 1. 권한 시트 행 조회
function listPermissionRows_() {
  try {
    return readTableRows_(openUserSpreadsheet_(), getUserDbTableSchema_('permissions').sheetName);
  } catch (e) {
    console.error('Failed to read permission rows.', e);
    return [];
  }
}

// 2. 역할-권한 매핑 시트 행 조회
function listRolePermissionRows_() {
  try {
    return readTableRows_(openUserSpreadsheet_(), getUserDbTableSchema_('rolePermissions').sheetName);
  } catch (e) {
    console.error('Failed to read role permission rows.', e);
    return [];
  }
}

// 3. 권한 시트 행을 화면/API 응답용 객체로 변환
function toPermissionDto_(row) {
  var fields = getUserDbFields_('permissions');
  return {
    id: normalizeTextValue_(row[fields.id]),
    area: normalizeTextValue_(row[fields.area]),
    action: normalizeTextValue_(row[fields.action]),
    name: normalizeTextValue_(row[fields.name]),
    description: normalizeTextValue_(row[fields.description]),
    status: isTruthyValue_(row[fields.active]) ? 'active' : 'inactive'
  };
}

// 4. 권한ID 기준 활성 권한 목록 생성
function getPermissionsById_() {
  var map = {};
  listPermissionRows_().forEach(function (row) {
    var permission = toPermissionDto_(row);
    if (permission.id && permission.status === 'active') map[permission.id] = permission;
  });
  return map;
}

// 5. 역할ID 기준 권한ID 목록 생성
function getPermissionIdsByRoleId_() {
  var fields = getUserDbFields_('rolePermissions');
  var map = {};
  listRolePermissionRows_().forEach(function (row) {
    var roleId = normalizeTextValue_(row[fields.roleId]);
    var permissionId = normalizeTextValue_(row[fields.permissionId]);
    if (!roleId || !permissionId) return;
    if (!map[roleId]) map[roleId] = [];
    if (map[roleId].indexOf(permissionId) === -1) map[roleId].push(permissionId);
  });
  return map;
}

// 6. 권한ID를 화면 권한 노드ID로 변환
function permissionScreenId_(permission) {
  return 'perm_' + permission.id;
}

// 7. 보호 API 권한 검증
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

// 8. 권한 선언을 화면 권한 노드ID로 변환
function resolveRequiredPermissionScreenId_(permission) {
  if (!permission) return '';
  if (permission.screenId) return permission.screenId;
  if (permission.id) return permissionScreenId_({ id: permission.id });
  return '';
}

// 9. 권한 검증 실패 생성
function throwPermissionError_(message) {
  var error = new Error(message || '권한이 없습니다.');
  error.code = 'FORBIDDEN';
  throw error;
}
