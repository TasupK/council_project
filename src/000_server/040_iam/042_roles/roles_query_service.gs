// 1. 역할ID 기준 역할 목록 생성
function getRolesById_() {
  var map = {};
  listRoleRows_().forEach(function (row) {
    var role = toRoleDto_(row);
    if (role.id) map[role.id] = role;
  });
  return map;
}

// 2. Google 이메일 기준 활성 역할ID 목록 생성
function getActiveRoleIdsByEmail_() {
  var fields = getUserDbFields_('userRoles');
  var map = {};
  listUserRoleRows_().forEach(function (row) {
    if (!isActiveStatus_(row[fields.assignedStatus])) return;
    var email = normalizeEmail_(row[fields.email]);
    var roleId = normalizeTextValue_(row[fields.roleId]);
    if (!email || !roleId) return;
    if (!map[email]) map[email] = [];
    if (map[email].indexOf(roleId) === -1) map[email].push(roleId);
  });
  return map;
}

// 3. 역할 시트 행을 화면/API 응답용 객체로 변환
function toRoleDto_(row) {
  var fields = getUserDbFields_('roles');
  var isSystem = isTruthyValue_(row[fields.isSystem]);
  return {
    id: normalizeTextValue_(row[fields.id]),
    name: normalizeTextValue_(row[fields.name]),
    type: isSystem ? 'default' : 'custom',
    typeLabel: isSystem ? '기본 역할' : '사용자 정의',
    description: normalizeTextValue_(row[fields.description]),
    status: isTruthyValue_(row[fields.active]) ? 'active' : 'inactive',
    protected: isSystem,
    assignedCount: 0,
    updatedAt: formatDateValue_(row[fields.updatedAt]),
    updatedBy: normalizeTextValue_(row[fields.updatedBy])
  };
}

// 4. 로그인 사용자에게 필요한 역할 요약 정보 생성
function summarizeRoleForUser_(role, fallbackId) {
  if (!role) return { id: fallbackId, name: fallbackId };
  return { id: role.id, name: role.name };
}

// 5. 관리자 역할 여부 판단
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
