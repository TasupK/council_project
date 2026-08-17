// 권한 행위명을 Settings 화면 권한 키로 변환
function actionToPermissionKey_(action) {
  if (action.indexOf('조회') !== -1) return 'view';
  if (action.indexOf('등록') !== -1 || action.indexOf('수정') !== -1) return 'edit';
  if (action.indexOf('승인') !== -1 || action.indexOf('보관') !== -1) return 'approve';
  if (action.indexOf('다운로드') !== -1 || action.indexOf('출력') !== -1) return 'export';
  if (action.indexOf('메뉴') !== -1 || action.indexOf('접근') !== -1) return 'menu';
  return 'view';
}

// Settings 화면에서 사용할 권한 트리 생성
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

// 역할별 Settings 권한 매트릭스 생성
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
