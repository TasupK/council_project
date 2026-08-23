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

// Accounting이 Event 내부 Sheet 구조에 의존하지 않도록 제공하는 정규화 read boundary.
function buildEventPaymentAccountingFacts_() {
  var applicationsById = {};
  listEventApplicationClientRows_().forEach(function (application) {
    applicationsById[String(application.id || '').trim()] = application;
  });
  return listEventPaymentClientRows_().map(function (payment) {
    var applicationId = String(payment.applicationId || '').trim();
    var application = applicationsById[applicationId] || {};
    return {
      paymentId: String(payment.id || '').trim(),
      applicationId: applicationId,
      eventId: String(application.eventId || '').trim(),
      paidAmount: Number(payment.paidAmount || 0),
      paymentDate: String(payment.paymentDate || '').trim(),
      depositorName: String(payment.depositorName || '').trim(),
      moneyStatus: String(payment.moneyStatus || '').trim(),
      confirmedAt: String(payment.confirmedAt || '').trim()
    };
  });
}
