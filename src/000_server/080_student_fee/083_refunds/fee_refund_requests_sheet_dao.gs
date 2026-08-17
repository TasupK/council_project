// 1. 환불신청 전체 조회
function findAllFeeRefundRequestRows_() {
  return readOperationTableClientRows_('feeRefundRequests');
}

// 2. 환불신청 단건 조회
function findFeeRefundRequestRowById_(requestId) {
  return findOperationTableRowById_('feeRefundRequests', requestId);
}

// 3. 환불신청 수정
function updateFeeRefundRequestRowById_(requestId, changes) {
  return updateOperationTableRow_('feeRefundRequests', requestId, changes);
}
