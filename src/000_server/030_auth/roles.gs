// 1. 역할 시트 행 조회
function listRoleRows_() {
  try {
    return readTableRows_(openUserSpreadsheet_(), getUserDbTableSchema_('roles').sheetName);
  } catch (e) {
    console.error('Failed to read role rows.', e);
    return [];
  }
}

// 2. 사용자-역할 배정 시트 행 조회
function listUserRoleRows_() {
  try {
    return readTableRows_(openUserSpreadsheet_(), getUserDbTableSchema_('userRoles').sheetName);
  } catch (e) {
    console.error('Failed to read user role rows.', e);
    return [];
  }
}

// 3. 역할ID 기준 역할 목록 생성
function getRolesById_() {
  var map = {};
  listRoleRows_().forEach(function (row) {
    var role = toRoleDto_(row);
    if (role.id) map[role.id] = role;
  });
  return map;
}

// 4. Google 이메일 기준 활성 역할ID 목록 생성
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

// 5. 역할 시트 행을 화면/API 응답용 객체로 변환
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

// 6. 로그인 사용자에게 필요한 역할 요약 정보 생성
function summarizeRoleForUser_(role, fallbackId) {
  if (!role) return { id: fallbackId, name: fallbackId };
  return { id: role.id, name: role.name };
}

// 7. 설정 화면에서 사용할 역할 목록 생성
function listRolesForSettings_() {
  var fields = getUserDbFields_('userRoles');
  var assignedCounts = {};
  var roleMap = getRolesById_();
  listUserRoleRows_().forEach(function (row) {
    if (!isActiveStatus_(row[fields.assignedStatus])) return;
    var roleId = normalizeTextValue_(row[fields.roleId]);
    assignedCounts[roleId] = (assignedCounts[roleId] || 0) + 1;
  });

  return Object.keys(roleMap).map(function (roleId) {
    var role = roleMap[roleId];
    role.assignedCount = assignedCounts[roleId] || 0;
    return role;
  });
}
