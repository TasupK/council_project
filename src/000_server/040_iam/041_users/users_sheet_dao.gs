// 사용자 시트 행 조회
function listUserRows_() {
  try {
    return readTableRows_(openUserSpreadsheet_(), getUserDbTableSchema_('users').sheetName);
  } catch (e) {
    console.error('Failed to read user rows.', e);
    return [];
  }
}
