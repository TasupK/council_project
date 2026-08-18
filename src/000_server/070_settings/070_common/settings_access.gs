// 1. Settings 조회 접근 확인
function getSettingsCurrent_() {
  var current = api_getCurrentUser();
  if (!current.ok) return current;
  if (current.isAdmin || (current.domainAccess && current.domainAccess.settings)) return current;
  return failResponse_('FORBIDDEN', '설정 화면에 접근할 권한이 없습니다.');
}

// 2. Settings 관리자 변경 권한 확인
function getAdminSettingsCurrent_() {
  var current = api_getCurrentUser();
  if (!current.ok) return current;
  if (!current.isAdmin) {
    return failResponse_('FORBIDDEN', '설정 변경은 시스템 관리자만 이용할 수 있습니다.');
  }
  return current;
}
