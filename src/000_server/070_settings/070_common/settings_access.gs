// Settings 관리자 접근 확인
function getAdminSettingsCurrent_() {
  var current = api_getCurrentUser();
  if (!current.ok) return current;
  if (!current.isAdmin) {
    return failResponse_('FORBIDDEN', '설정 화면은 시스템 관리자만 이용할 수 있습니다.');
  }
  return current;
}
