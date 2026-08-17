// 1. 관리자 역할 여부 판단
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

// 2. 역할별 권한을 사용자 권한으로 병합
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

// 3. 권한이 있는 메뉴 목록 생성
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
