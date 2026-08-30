/**
 * [070_settings / settings_users_mutation_service]
 * ST-12: 사용자 추가·프로필·상태·역할 배정 저장 → UserDB 사용자 / 사용자역할
 * 프론트: 300_settings/310_users/settings_users_js.html
 */

function toSheetActiveFlag_(status) {
  return status === 'inactive' || status === false || status === 'FALSE' || status === '비활성' ? 'FALSE' : 'TRUE';
}

function toSheetAssignedStatus_(active) {
  return active ? '활성' : '비활성';
}

function buildSettingsUserResponse_(email) {
  var roleMap = buildRolesById_();
  var userRoleMap = buildActiveRoleIdsByEmail_();
  var departmentMap = buildDepartmentsById_();
  var roleIds = userRoleMap[email] || [];
  var roles = roleIds.map(function (roleId) {
    return buildRoleSummaryForUser_(roleMap[roleId], roleId);
  });
  var row = findUserRowByEmail_(email);
  if (!row) return null;
  return mapUserDto_(row, roleIds, roles, departmentMap);
}

function validateSettingsDepartmentId_(departmentId) {
  var id = normalizeTextValue_(departmentId);
  if (!id) return { ok: true, departmentId: '' };
  var department = buildDepartmentsById_()[id];
  if (!department || department.status !== 'active') {
    return { ok: false, response: failResponse_('VALIDATION_ERROR', '활성 부서만 배정할 수 있습니다.', { departmentId: id }) };
  }
  return { ok: true, departmentId: id };
}

function validateSettingsRoleIds_(roleIds) {
  var roleMap = buildRolesById_();
  var cleaned = [];
  (roleIds || []).forEach(function (roleId) {
    var id = normalizeTextValue_(roleId);
    if (!id) return;
    if (!roleMap[id]) {
      cleaned.__error = failResponse_('VALIDATION_ERROR', '존재하지 않는 역할입니다: ' + id);
      return;
    }
    if (cleaned.indexOf(id) === -1) cleaned.push(id);
  });
  if (cleaned.__error) return { ok: false, response: cleaned.__error };
  return { ok: true, roleIds: cleaned };
}

/** 사용자역할 시트를 desiredRoleIds 와 동기화 (없으면 추가, 불필요하면 비활성) */
function syncSettingsUserRoles_(email, desiredRoleIds, actorEmail) {
  var fields = getUserDbFields_('userRoles');
  var desired = {};
  (desiredRoleIds || []).forEach(function (roleId) {
    desired[roleId] = true;
  });

  var items = listSheetCrudItems_('user', 'userRoles').filter(function (item) {
    return normalizeEmail_(item.email) === email;
  });
  var seen = {};

  items.forEach(function (item) {
    var roleId = normalizeTextValue_(item.roleId);
    seen[roleId] = true;
    var shouldActive = !!desired[roleId];
    var currentlyActive = isActiveStatus_(item.assignedStatus);
    if (shouldActive === currentlyActive) return;
    updateSheetCrudItemByRowNumber_('user', 'userRoles', item._rowNumber, {
      assignedStatus: toSheetAssignedStatus_(shouldActive)
    });
  });

  Object.keys(desired).forEach(function (roleId) {
    if (seen[roleId]) return;
    insertSheetCrudItem_('user', 'userRoles', {
      email: email,
      roleId: roleId,
      assignedStatus: toSheetAssignedStatus_(true)
    });
  });
}

function createSettingsUser_(input) {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  var payload = input || {};
  var email = normalizeEmail_(payload.email);
  var name = normalizeTextValue_(payload.name);
  if (!email) return failResponse_('VALIDATION_ERROR', 'Google 이메일이 필요합니다.');
  if (!name) return failResponse_('VALIDATION_ERROR', '성명이 필요합니다.');
  if (findUserRowByEmail_(email)) {
    return failResponse_('VALIDATION_ERROR', '이미 등록된 이메일입니다.', { email: email });
  }

  var departmentCheck = validateSettingsDepartmentId_(payload.departmentId);
  if (!departmentCheck.ok) return departmentCheck.response;
  var roleCheck = validateSettingsRoleIds_(payload.roleIds);
  if (!roleCheck.ok) return roleCheck.response;

  var actorEmail = current.user && current.user.email ? current.user.email : '';
  var now = new Date();
  insertSheetCrudItem_('user', 'users', {
    email: email,
    name: name,
    studentId: normalizeTextValue_(payload.studentId),
    phone: normalizeTextValue_(payload.phone),
    departmentId: departmentCheck.departmentId,
    active: toSheetActiveFlag_(payload.status || 'active'),
    updatedAt: now,
    updatedBy: actorEmail
  });
  syncSettingsUserRoles_(email, roleCheck.roleIds, actorEmail);
  invalidateLoginContextCache_(email);

  return okResponse_({
    user: buildSettingsUserResponse_(email),
    users: getSettingsUsersData_()
  });
}

function updateSettingsUser_(input) {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  var payload = input || {};
  var email = normalizeEmail_(payload.email);
  if (!email) return failResponse_('VALIDATION_ERROR', '대상 사용자 이메일이 필요합니다.');
  if (!findUserRowByEmail_(email)) {
    return failResponse_('NOT_FOUND', '대상 사용자를 찾을 수 없습니다.', { email: email });
  }

  var changes = {};
  if (payload.name != null) {
    var name = normalizeTextValue_(payload.name);
    if (!name) return failResponse_('VALIDATION_ERROR', '성명이 필요합니다.');
    changes.name = name;
  }
  if (payload.studentId != null) changes.studentId = normalizeTextValue_(payload.studentId);
  if (payload.phone != null) changes.phone = normalizeTextValue_(payload.phone);
  if (payload.status != null) changes.active = toSheetActiveFlag_(payload.status);
  if (payload.departmentId != null) {
    var departmentCheck = validateSettingsDepartmentId_(payload.departmentId);
    if (!departmentCheck.ok) return departmentCheck.response;
    changes.departmentId = departmentCheck.departmentId;
  }

  var actorEmail = current.user && current.user.email ? current.user.email : '';
  changes.updatedAt = new Date();
  changes.updatedBy = actorEmail;

  var hasProfileChange = Object.keys(changes).some(function (key) {
    return key !== 'updatedAt' && key !== 'updatedBy';
  });
  if (hasProfileChange) {
    updateSheetCrudItemById_('user', 'users', email, changes);
  }

  if (payload.roleIds) {
    var roleCheck = validateSettingsRoleIds_(payload.roleIds);
    if (!roleCheck.ok) return roleCheck.response;
    syncSettingsUserRoles_(email, roleCheck.roleIds, actorEmail);
  } else if (!hasProfileChange) {
    return failResponse_('VALIDATION_ERROR', '저장할 변경사항이 없습니다.');
  }

  invalidateLoginContextCache_(email);
  return okResponse_({
    user: buildSettingsUserResponse_(email),
    users: getSettingsUsersData_()
  });
}

/** 여러 사용자 변경을 한 번에 저장 (화면 변경사항 저장) */
function saveSettingsUserChanges_(input) {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  var changes = (input && input.changes) || [];
  if (!changes.length) return failResponse_('VALIDATION_ERROR', '저장할 변경사항이 없습니다.');

  var results = [];
  for (var i = 0; i < changes.length; i += 1) {
    var item = changes[i] || {};
    var response = item.isNew ? createSettingsUser_(item) : updateSettingsUser_(item);
    if (!response || !response.ok) {
      return response || failResponse_('INTERNAL_ERROR', '사용자 저장에 실패했습니다.');
    }
    results.push(response.user);
  }

  return okResponse_({
    users: getSettingsUsersData_(),
    saved: results
  });
}
