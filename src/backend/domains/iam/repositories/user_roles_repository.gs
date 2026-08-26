// 사용자-역할 배정 시트 행 조회
function listUserRoleRows_() {
  try {
    return readTableRows_(openUserSpreadsheet_(), getUserDbTableSchema_('userRoles').sheetName);
  } catch (e) {
    console.error('Failed to read user role rows.', e);
    return [];
  }
}
