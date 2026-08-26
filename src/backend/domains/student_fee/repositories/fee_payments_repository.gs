// 1. 납부내역 전체 조회
function listFeePaymentRows_() {
  return readOperationTableClientRows_('feePayments');
}

// 2. 납부내역 단건 조회
function findFeePaymentRowById_(paymentId) {
  return findOperationTableRowById_('feePayments', paymentId);
}

// 3. 납부신청ID 기준 납부내역 조회
function findFeePaymentRowByApplicationId_(applicationId) {
  var rows = listFeePaymentRows_();
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i].applicationId) === String(applicationId)) return rows[i];
  }
  return null;
}

// 4. 납부내역 등록
function insertFeePaymentRow_(row) {
  return appendOperationTableRow_('feePayments', row);
}

// 5. 납부내역 수정
function updateFeePaymentRowById_(paymentId, changes) {
  return updateOperationTableRow_('feePayments', paymentId, changes);
}
