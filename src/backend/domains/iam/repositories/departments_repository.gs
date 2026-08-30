// 부서 시트 행 조회
function listDepartmentRows_() {
  try {
    return readTableRows_(openUserSpreadsheet_(), getUserDbTableSchema_('departments').sheetName);
  } catch (e) {
    console.error('Failed to read department rows.', e);
    return [];
  }
}
