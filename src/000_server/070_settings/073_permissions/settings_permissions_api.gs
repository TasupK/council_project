// Settings 업무 권한 데이터 조회
function loadSettingsPermissionsData() {
  var current = getSettingsCurrent_();
  if (!current.ok) return current;
  return getSettingsPermissionsData_(current);
}
