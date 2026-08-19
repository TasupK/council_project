var STUDENT_FEE_FORM_SETTING_KEYS_ = {
  googleFormId: '학생회비GoogleFormID',
  enabled: '학생회비Form연동활성여부',
  lastSyncedAt: '학생회비Form마지막동기화일시',
  currentSemesterId: '학생회비현재학기ID'
};

function listStudentFeeSettingRows_() {
  return readOperationTableClientRows_('settings');
}

function findStudentFeeSettingValue_(rows, key) {
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i].key || '').trim() === key) return rows[i].value;
  }
  return '';
}

function getStudentFeeFormSettings_() {
  var rows = listStudentFeeSettingRows_();
  return {
    googleFormId: String(findStudentFeeSettingValue_(rows, STUDENT_FEE_FORM_SETTING_KEYS_.googleFormId) || '').trim(),
    enabled: isTruthyValue_(findStudentFeeSettingValue_(rows, STUDENT_FEE_FORM_SETTING_KEYS_.enabled)),
    lastSyncedAt: String(findStudentFeeSettingValue_(rows, STUDENT_FEE_FORM_SETTING_KEYS_.lastSyncedAt) || '').trim(),
    currentSemesterId: String(findStudentFeeSettingValue_(rows, STUDENT_FEE_FORM_SETTING_KEYS_.currentSemesterId) || '').trim()
  };
}

function updateStudentFeeFormLastSyncedAt_(value) {
  var syncedAt = String(value || '').trim();
  if (!syncedAt) throw new Error('학생회비 Form 마지막동기화일시 값이 필요합니다.');
  return updateOperationTableRow_('settings', STUDENT_FEE_FORM_SETTING_KEYS_.lastSyncedAt, { value: syncedAt });
}
