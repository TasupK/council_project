/**
 * [070_settings / settings_roles_mutation_service]
 * ST-13: 역할 추가·수정 → UserDB 역할 시트
 * 프론트: 300_settings/320_roles/settings_roles_js.html
 */

function slugifyRoleIdPart_(value) {
  var text = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!text) text = 'custom';
  return text.substring(0, 24);
}

function generateSettingsRoleId_(name) {
  var base = 'role_' + slugifyRoleIdPart_(name);
  var roleMap = buildRolesById_();
  if (!roleMap[base]) return base;
  var suffix = Utilities.getUuid().replace(/-/g, '').substring(0, 6);
  return base + '_' + suffix;
}

function createSettingsRole_(input) {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  var payload = input || {};
  var name = normalizeTextValue_(payload.name);
  if (!name) return failResponse_('VALIDATION_ERROR', '역할명이 필요합니다.');

  var roleId = normalizeTextValue_(payload.id) || generateSettingsRoleId_(name);
  if (buildRolesById_()[roleId]) {
    return failResponse_('VALIDATION_ERROR', '이미 존재하는 역할ID입니다.', { id: roleId });
  }

  var actorEmail = current.user && current.user.email ? current.user.email : '';
  var now = new Date();
  insertSheetCrudItem_('user', 'roles', {
    id: roleId,
    name: name,
    isSystem: 'FALSE',
    description: normalizeTextValue_(payload.description),
    active: toSheetActiveFlag_(payload.status || 'active'),
    updatedAt: now,
    updatedBy: actorEmail
  });

  return okResponse_({
    role: buildRolesById_()[roleId],
    roles: getSettingsRolesData_()
  });
}

function updateSettingsRole_(input) {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  var payload = input || {};
  var roleId = normalizeTextValue_(payload.id);
  if (!roleId) return failResponse_('VALIDATION_ERROR', '역할ID가 필요합니다.');

  var roleMap = buildRolesById_();
  var existing = roleMap[roleId];
  if (!existing) return failResponse_('NOT_FOUND', '역할을 찾을 수 없습니다.', { id: roleId });

  var changes = {};
  if (payload.name != null) {
    var name = normalizeTextValue_(payload.name);
    if (!name) return failResponse_('VALIDATION_ERROR', '역할명이 필요합니다.');
    changes.name = name;
  }
  if (payload.description != null) changes.description = normalizeTextValue_(payload.description);
  if (payload.status != null) {
    if (existing.protected && payload.status === 'inactive') {
      return failResponse_('VALIDATION_ERROR', '시스템 역할은 비활성화할 수 없습니다.');
    }
    changes.active = toSheetActiveFlag_(payload.status);
  }

  var actorEmail = current.user && current.user.email ? current.user.email : '';
  changes.updatedAt = new Date();
  changes.updatedBy = actorEmail;
  updateSheetCrudItemById_('user', 'roles', roleId, changes);

  return okResponse_({
    role: buildRolesById_()[roleId],
    roles: getSettingsRolesData_()
  });
}

function saveSettingsRoleChanges_(input) {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;

  var changes = (input && input.changes) || [];
  if (!changes.length) return failResponse_('VALIDATION_ERROR', '저장할 변경사항이 없습니다.');

  var saved = [];
  for (var i = 0; i < changes.length; i += 1) {
    var item = changes[i] || {};
    var response = item.isNew ? createSettingsRole_(item) : updateSettingsRole_(item);
    if (!response || !response.ok) {
      return response || failResponse_('INTERNAL_ERROR', '역할 저장에 실패했습니다.');
    }
    saved.push(response.role);
  }

  return okResponse_({
    roles: getSettingsRolesData_(),
    saved: saved
  });
}
