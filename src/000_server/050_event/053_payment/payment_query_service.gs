// 행사 입금 조회와 화면용 read model을 담당한다.

function buildEventPaymentTotalsByApplicationId_() {
  var totals = {};
  listEventPaymentClientRows_().forEach(function (payment) {
    var applicationId = String(payment.applicationId || '');
    if (!applicationId) return;
    totals[applicationId] = Number(totals[applicationId] || 0) + Number(payment.paidAmount || 0);
  });
  return totals;
}

function getEventPaymentRowsByApplicationId_(applicationId) {
  var targetId = String(applicationId || '').trim();
  if (!targetId) return [];
  return listEventPaymentClientRows_().filter(function (payment) {
    return String(payment.applicationId || '').trim() === targetId;
  });
}
