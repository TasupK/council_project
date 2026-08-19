// 1. 행사 입금 행 조회
function listEventPaymentClientRows_() {
  return readOperationTableClientRows_('eventPayments');
}

// 2. 신청ID 기준 행사 입금 행 조회
function findEventPaymentRowsByApplicationId_(applicationId) {
  var targetId = String(applicationId || '').trim();
  if (!targetId) return [];
  return listEventPaymentClientRows_().filter(function (payment) {
    return String(payment.applicationId || '').trim() === targetId;
  });
}

// 3. 행사 입금 행 추가
function insertEventPaymentRow_(payment) {
  return appendOperationTableRow_('eventPayments', payment);
}

// 4. 행사 입금 행 수정
function updateEventPaymentRowById_(paymentId, changes) {
  return updateOperationTableRow_('eventPayments', paymentId, changes);
}
