function getEventPaymentTotalsByApplicationId_() {
  var totals = {};
  readOperationTableClientRows_('eventPayments').forEach(function (payment) {
    var applicationId = String(payment.applicationId || '');
    if (!applicationId) return;
    totals[applicationId] = Number(totals[applicationId] || 0) + Number(payment.paidAmount || 0);
  });
  return totals;
}

