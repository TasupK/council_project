// 역할 시트 행 조회
function listRoleRows_() {
  try {
    return readTableRows_(openUserSpreadsheet_(), getUserDbTableSchema_('roles').sheetName);
  } catch (e) {
    console.error('Failed to read role rows.', e);
    return [];
  }
}
