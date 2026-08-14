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

// 6. 권한 행위명을 화면 권한 키로 변환
function actionToPermissionKey_(action) {
  if (action.indexOf('조회') !== -1) return 'view';
  if (action.indexOf('등록') !== -1 || action.indexOf('수정') !== -1) return 'edit';
  if (action.indexOf('승인') !== -1 || action.indexOf('보관') !== -1) return 'approve';
  if (action.indexOf('다운로드') !== -1 || action.indexOf('출력') !== -1) return 'export';
  if (action.indexOf('메뉴') !== -1 || action.indexOf('접근') !== -1) return 'menu';
  return 'view';
}

// 7. 권한ID를 화면 권한 노드ID로 변환
function permissionScreenId_(permission) {
  return 'perm_' + permission.id;
}

// 8. 설정 화면에서 사용할 권한 트리 생성
function buildPermissionTreeFromDb_() {
  var grouped = {};
  var permissions = [];
  listPermissionRows_().forEach(function (row) {
    var permission = toPermissionDto_(row);
    if (!permission.id || permission.status !== 'active') return;
    permissions.push(permission);
    if (!grouped[permission.area]) grouped[permission.area] = [];
    grouped[permission.area].push(permission);
  });

  return Object.keys(grouped).map(function (area) {
    return {
      id: 'area_' + area,
      name: area,
      group: area,
      applicable: { menu: true, view: true, edit: true, approve: true, export: true },
      children: grouped[area].map(function (permission) {
        var key = actionToPermissionKey_(permission.action);
        var applicable = { menu: true, view: false, edit: false, approve: false, export: false };
        applicable[key] = true;
        return {
          id: permissionScreenId_(permission),
          name: permission.name || permission.action,
          group: permission.area,
          applicable: applicable,
          children: []
        };
      })
    };
  });
}

// 9. 역할별 권한 매트릭스 생성
function buildPermissionsByRoleFromDb_() {
  var permissionsById = getPermissionsById_();
  var permissionIdsByRole = getPermissionIdsByRoleId_();
  var result = {};

  Object.keys(permissionIdsByRole).forEach(function (roleId) {
    result[roleId] = {};
    permissionIdsByRole[roleId].forEach(function (permissionId) {
      var permission = permissionsById[permissionId];
      if (!permission) return;
      var screenId = permissionScreenId_(permission);
      var key = actionToPermissionKey_(permission.action);
      result[roleId][screenId] = { menu: true, view: false, edit: false, approve: false, export: false };
      result[roleId][screenId][key] = true;
    });
  });

  return result;
}
