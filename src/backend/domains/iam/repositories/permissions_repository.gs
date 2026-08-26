// 권한 시트 행 조회
function listPermissionRows_() {
  try {
    return readTableRows_(openUserSpreadsheet_(), getUserDbTableSchema_('permissions').sheetName);
  } catch (e) {
    console.error('Failed to read permission rows.', e);
    return [];
  }
}
