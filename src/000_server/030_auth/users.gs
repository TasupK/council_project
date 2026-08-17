// 1. 사용자 시트 행 조회
function listUserRows_() {
  try {
    return readTableRows_(openUserSpreadsheet_(), getUserDbTableSchema_('users').sheetName);
  } catch (e) {
    console.error('Failed to read user rows.', e);
    return [];
  }
}

// 2. Google 이메일로 로그인 사용자 행 검색
function findUserRowByEmail_(email) {
  try {
    var fields = getUserDbFields_('users');
    var target = normalizeEmail_(email);
    var rows = listUserRows_();
    for (var i = 0; i < rows.length; i += 1) {
      if (normalizeEmail_(rows[i][fields.email]) === target) return rows[i];
    }
  } catch (e) {
    console.error('Failed to find user row by email.', e);
  }
  return null;
}

// 3. 사용자 시트 행을 화면/API 응답용 객체로 변환
function toUserDto_(row, roleIds, roles) {
  var fields = getUserDbFields_('users');
  return {
    id: normalizeEmail_(row[fields.email]),
    name: normalizeTextValue_(row[fields.name]) || normalizeEmail_(row[fields.email]),
    email: normalizeEmail_(row[fields.email]),
    studentId: normalizeTextValue_(row[fields.studentId]),
    phone: normalizeTextValue_(row[fields.phone]),
    department: '',
    roleIds: roleIds || [],
    roles: roles || [],
    status: isActiveStatus_(row[fields.status]) ? 'active' : 'inactive',
    updatedAt: formatDateValue_(row[fields.updatedAt]),
    updatedBy: normalizeTextValue_(row[fields.updatedBy])
  };
}
