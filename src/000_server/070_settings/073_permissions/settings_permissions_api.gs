// Settings 업무 권한 데이터 조회
function loadSettingsPermissionsData() {
  var current = getAdminSettingsCurrent_();
  if (!current.ok) return current;
  return getSettingsPermissionsData_(current);
}
