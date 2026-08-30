// 1. 행사 입금 행 조회
function listEventPaymentClientRows_() {
  return readOperationTableClientRows_('eventPayments');
}

// 2. 행사입금ID 기준 단건 조회
function findEventPaymentRowById_(paymentId) {
  var targetId = String(paymentId || '').trim();
  if (!targetId) return null;
  var rows = listEventPaymentClientRows_();
  for (var i = 0; i < rows.length; i += 1) {
    if (String(rows[i].id || '').trim() === targetId) return rows[i];
  }
  return null;
}

// 3. 신청ID 기준 행사 입금 행 조회
function findEventPaymentRowsByApplicationId_(applicationId) {
  var targetId = String(applicationId || '').trim();
  if (!targetId) return [];
  return listEventPaymentClientRows_().filter(function (payment) {
    return String(payment.applicationId || '').trim() === targetId;
  });
}

// 4. 행사 입금 행 추가
function insertEventPaymentRow_(payment) {
  return appendOperationTableRow_('eventPayments', payment);
}

// 5. 행사 입금 행 수정
function updateEventPaymentRowById_(paymentId, changes) {
  return updateOperationTableRow_('eventPayments', paymentId, changes);
}
