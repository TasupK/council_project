// 1. 회비납부자 전체 조회
function findAllFeePayerRows_() {
  return readOperationTableClientRows_('feePayers');
}

// 2. 학번 기준 회비납부자 조회
function findFeePayerRowById_(studentId) {
  return findOperationTableRowById_('feePayers', studentId);
}

// 3. 회비납부자 등록
function insertFeePayerRow_(row) {
  return appendOperationTableRow_('feePayers', row);
}

// 4. 회비납부자 수정
function updateFeePayerRowById_(studentId, changes) {
  return updateOperationTableRow_('feePayers', studentId, changes);
}
