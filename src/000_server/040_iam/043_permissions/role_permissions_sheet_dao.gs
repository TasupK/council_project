// 역할-권한 매핑 시트 행 조회
function listRolePermissionRows_() {
  try {
    return readTableRows_(openUserSpreadsheet_(), getUserDbTableSchema_('rolePermissions').sheetName);
  } catch (e) {
    console.error('Failed to read role permission rows.', e);
    return [];
  }
}
