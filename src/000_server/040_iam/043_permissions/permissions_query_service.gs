// 1. 권한 시트 행을 화면/API 응답용 객체로 변환
function mapPermissionDto_(row) {
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

// 2. 권한ID 기준 활성 권한 목록 생성
function buildPermissionsById_() {
  var map = {};
  listPermissionRows_().forEach(function (row) {
    var permission = mapPermissionDto_(row);
    if (permission.id && permission.status === 'active') map[permission.id] = permission;
  });
  return map;
}

// 3. 역할ID 기준 권한ID 목록 생성
function buildPermissionIdsByRoleId_() {
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

// 4. 권한 행위명을 런타임 권한 키로 변환
function mapActionToPermissionKey_(action) {
  action = normalizeTextValue_(action);
  if (action.indexOf('조회') !== -1) return 'view';
  if (action.indexOf('등록') !== -1 || action.indexOf('수정') !== -1) return 'edit';
  if (action.indexOf('승인') !== -1 || action.indexOf('보관') !== -1) return 'approve';
  if (action.indexOf('다운로드') !== -1 || action.indexOf('출력') !== -1) return 'export';
  if (action.indexOf('메뉴') !== -1 || action.indexOf('접근') !== -1) return 'menu';
  return 'view';
}

// 5. 권한ID를 화면 권한 노드ID로 변환 (인증·기존 로직용)
function resolvePermissionScreenId_(permission) {
  return 'perm_' + permission.id;
}

// 5-1. 설정 매트릭스용 화면 그룹 ID
function resolvePermissionScreenGroupId_(permission) {
  var id = normalizeTextValue_(permission && permission.id);
  var base = id.replace(/_(view|edit|approve|export|menu)$/i, '');
  if (!base) base = id || 'unknown';
  return 'screen_' + base;
}

// 5-2. 설정 매트릭스 표시 이름
function resolvePermissionScreenGroupName_(permissionsInGroup) {
  var sample = permissionsInGroup && permissionsInGroup[0];
  if (!sample) return '';
  var name = normalizeTextValue_(sample.name) || normalizeTextValue_(sample.id);
  name = name.replace(/\s*(조회|등록 및 수정|등록\/수정|승인 및 보관|다운로드|메뉴 접근|메뉴)\s*$/g, '').trim();
  if (!name) name = normalizeTextValue_(sample.id).replace(/_(view|edit|approve|export|menu)$/i, '');
  return name || sample.id;
}

// 6. 활성 권한을 런타임 메뉴/권한 트리로 구성
function buildPermissionTreeFromDb_() {
  var grouped = {};
  listPermissionRows_().forEach(function (row) {
    var permission = mapPermissionDto_(row);
    if (!permission.id || permission.status !== 'active') return;
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
        var key = mapActionToPermissionKey_(permission.action);
        var applicable = { menu: true, view: false, edit: false, approve: false, export: false };
        applicable[key] = true;
        return {
          id: resolvePermissionScreenId_(permission),
          name: permission.name || permission.action,
          group: permission.area,
          applicable: applicable,
          children: []
        };
      })
    };
  });
}

// 6-1. 설정 화면용 권한 트리 (화면 1행 × 행위 열)
function buildSettingsPermissionTreeFromDb_() {
  var grouped = {};
  listPermissionRows_().forEach(function (row) {
    var permission = mapPermissionDto_(row);
    if (!permission.id || permission.status !== 'active') return;
    if (!grouped[permission.area]) grouped[permission.area] = {};
    var screenId = resolvePermissionScreenGroupId_(permission);
    if (!grouped[permission.area][screenId]) grouped[permission.area][screenId] = [];
    grouped[permission.area][screenId].push(permission);
  });

  return Object.keys(grouped).map(function (area) {
    var screens = grouped[area];
    var children = Object.keys(screens).map(function (screenId) {
      var perms = screens[screenId];
      var permissionIdsByKey = {};
      var availableKeys = { menu: false, view: false, edit: false, approve: false, export: false };
      perms.forEach(function (permission) {
        var key = mapActionToPermissionKey_(permission.action);
        permissionIdsByKey[key] = permission.id;
        availableKeys[key] = true;
      });
      return {
        id: screenId,
        name: resolvePermissionScreenGroupName_(perms),
        group: area,
        applicable: { menu: true, view: true, edit: true, approve: true, export: true },
        availableKeys: availableKeys,
        permissionIdsByKey: permissionIdsByKey,
        children: []
      };
    }).sort(function (a, b) {
      return String(a.name).localeCompare(String(b.name), 'ko');
    });
    return {
      id: 'area_' + area,
      name: area,
      group: area,
      applicable: { menu: true, view: true, edit: true, approve: true, export: true },
      availableKeys: { menu: false, view: false, edit: false, approve: false, export: false },
      children: children
    };
  });
}

// 7. 역할별 런타임 권한 매트릭스 생성
function buildPermissionsByRoleFromDb_() {
  var permissionsById = buildPermissionsById_();
  var permissionIdsByRole = buildPermissionIdsByRoleId_();
  var result = {};
  Object.keys(permissionIdsByRole).forEach(function (roleId) {
    result[roleId] = {};
    permissionIdsByRole[roleId].forEach(function (permissionId) {
      var permission = permissionsById[permissionId];
      if (!permission) return;
      var screenId = resolvePermissionScreenId_(permission);
      var key = mapActionToPermissionKey_(permission.action);
      result[roleId][screenId] = { menu: false, view: false, edit: false, approve: false, export: false };
      result[roleId][screenId][key] = true;
    });
  });
  return result;
}

// 7-1. 설정 화면용 역할별 권한 매트릭스 생성
function buildSettingsPermissionsByRoleFromDb_() {
  var permissionsById = buildPermissionsById_();
  var permissionIdsByRole = buildPermissionIdsByRoleId_();
  var result = {};
  Object.keys(permissionIdsByRole).forEach(function (roleId) {
    result[roleId] = {};
    permissionIdsByRole[roleId].forEach(function (permissionId) {
      var permission = permissionsById[permissionId];
      if (!permission) return;
      var screenId = resolvePermissionScreenGroupId_(permission);
      var key = mapActionToPermissionKey_(permission.action);
      if (!result[roleId][screenId]) {
        result[roleId][screenId] = { menu: false, view: false, edit: false, approve: false, export: false };
      }
      result[roleId][screenId][key] = true;
    });
  });
  return result;
}

// 8. 역할별 권한을 사용자 권한으로 병합
function buildUserPermissionsFromDb_(roleIds) {
  var permissionsByRole = buildPermissionsByRoleFromDb_();
  var merged = {};
  (roleIds || []).forEach(function (roleId) {
    var byScreen = permissionsByRole[roleId] || {};
    Object.keys(byScreen).forEach(function (screenId) {
      if (!merged[screenId]) merged[screenId] = { menu: false, view: false, edit: false, approve: false, export: false };
      SETTINGS_PERMISSION_COLUMNS.forEach(function (column) {
        merged[screenId][column.key] = merged[screenId][column.key] || !!byScreen[screenId][column.key];
      });
    });
  });
  return { byScreen: merged, menus: buildMenusFromPermissions_(merged) };
}

// 9. 현재 유효 권한을 사람이 읽을 수 있는 상세 목록으로 변환
function buildEffectivePermissionDetails_(permissions) {
  var permissionsById = buildPermissionsById_();
  var byScreen = permissions && permissions.byScreen ? permissions.byScreen : {};
  var details = [];
  Object.keys(permissionsById).forEach(function (permissionId) {
    var permission = permissionsById[permissionId];
    var screenId = resolvePermissionScreenId_(permission);
    var grants = byScreen[screenId];
    if (!grants || !(grants.menu || grants.view || grants.edit || grants.approve || grants.export)) return;
    details.push({
      id: permission.id,
      screenId: screenId,
      area: permission.area,
      action: permission.action,
      name: permission.name || permission.action,
      description: permission.description || '',
      grants: {
        menu: !!grants.menu, view: !!grants.view, edit: !!grants.edit,
        approve: !!grants.approve, export: !!grants.export
      }
    });
  });
  return details;
}

// 10. 권한이 있는 메뉴 목록 생성
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
