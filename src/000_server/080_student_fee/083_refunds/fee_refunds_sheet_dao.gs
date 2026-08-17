// 1. 환불내역 전체 조회
function findAllFeeRefundRows_() {
  return readOperationTableClientRows_('feeRefunds');
}

// 2. 환불내역 단건 조회
function findFeeRefundRowById_(refundId) {
  return findOperationTableRowById_('feeRefunds', refundId);
}

// 3. 환불신청ID 기준 환불내역 조회
function findFeeRefundRowByRequestId_(requestId) {
  var rows = findAllFeeRefundRows_();
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i].requestId) === String(requestId)) return rows[i];
  }
  return null;
}

// 4. 환불내역 등록
function insertFeeRefundRow_(row) {
  return appendOperationTableRow_('feeRefunds', row);
}

// 5. 환불내역 수정
function updateFeeRefundRowById_(refundId, changes) {
  return updateOperationTableRow_('feeRefunds', refundId, changes);
}
