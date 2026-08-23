/**
 * Settings 역할별 권한 저장
 */
function collectPermissionIdsFromGrants_(grants) {
  var permissionsById = buildPermissionsById_();
  var selected = {};
  Object.keys(grants || {}).forEach(function (screenId) {
    var cell = grants[screenId] || {};
    Object.keys(permissionsById).forEach(function (permissionId) {
      var permission = permissionsById[permissionId];
      var groupId = resolvePermissionScreenGroupId_(permission);
      var legacyId = resolvePermissionScreenId_(permission);
      if (groupId !== screenId && legacyId !== screenId) return;
      var actionKey = mapActionToPermissionKey_(permission.action);
      if (cell[actionKey]) selected[permissionId] = true;
    });
  });
  return Object.keys(selected);
}

function invalidateUsersWithRole_(roleId) {
  var fields = getUserDbFields_('userRoles');
  listUserRoleRows_().forEach(function (row) {
    if (!isActiveStatus_(row[fields.assignedStatus])) return;
    if (normalizeTextValue_(row[fields.roleId]) !== roleId) return;
    invalidateLoginContextCache_(normalizeEmail_(row[fields.email]));
  });
}

function saveSettingsRolePermissions_(input) {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  var payload = input || {};
  var roleId = normalizeTextValue_(payload.roleId);
  if (!roleId) return failResponse_('VALIDATION_ERROR', '역할ID가 필요합니다.');

  var role = buildRolesById_()[roleId];
  if (!role) return failResponse_('NOT_FOUND', '역할을 찾을 수 없습니다.', { roleId: roleId });

  var permissionIds = payload.permissionIds;
  if (!permissionIds) permissionIds = collectPermissionIdsFromGrants_(payload.grants);

  var seen = {};
  permissionIds = (permissionIds || []).map(function (id) {
    return normalizeTextValue_(id);
  }).filter(function (id) {
    if (!id || seen[id]) return false;
    seen[id] = true;
    return true;
  });

  var permissionsById = buildPermissionsById_();
  for (var i = 0; i < permissionIds.length; i += 1) {
    if (!permissionsById[permissionIds[i]]) {
      return failResponse_('VALIDATION_ERROR', '존재하지 않는 권한입니다: ' + permissionIds[i]);
    }
  }

  withSheetCrudWriteLock_(function () {
    deleteSheetCrudRowsWhere_('user', 'rolePermissions', function (item) {
      return normalizeTextValue_(item.roleId) === roleId;
    });
    permissionIds.forEach(function (permissionId) {
      insertSheetCrudItem_('user', 'rolePermissions', {
        roleId: roleId,
        permissionId: permissionId
      });
    });
  });

  invalidateUsersWithRole_(roleId);

  return okResponse_({
    roleId: roleId,
    permissionIds: permissionIds,
    permissionsByRole: buildSettingsPermissionsByRoleFromDb_(),
    roles: getSettingsRolesData_()
  });
}
