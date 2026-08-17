// 1. 역할별 권한을 사용자 권한으로 병합
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

// 2. 권한이 있는 메뉴 목록 생성
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
