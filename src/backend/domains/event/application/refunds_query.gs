// 행사 환불 조회와 화면용 조합을 담당한다.

function buildEventRefundSectionRows_(eventId) {
  var targetEventId = String(eventId || '');
  var applicantsById = {};
  listEventApplicationClientRows_().forEach(function (applicant) {
    if (String(applicant.eventId) === targetEventId) applicantsById[String(applicant.id)] = applicant;
  });
  var refundRows = typeof listEventRefundClientRows_ === 'function'
    ? listEventRefundClientRows_()
    : [];
  var rows = refundRows.filter(function (refund) {
    return Boolean(applicantsById[String(refund.applicationId)]);
  }).map(function (refund) {
    var applicant = applicantsById[String(refund.applicationId)];
    return Object.assign({}, withoutInternalRowNumber_(refund), {
      name: applicant.name || '',
      studentId: applicant.studentId || '',
      phone: applicant.phone || '',
      bankName: applicant.bankName || '',
      accountNumber: applicant.accountNumber || '',
      accountHolder: applicant.accountHolder || '',
      sourceResponseId: applicant.sourceResponseId || ''
    });
  });
  rows.sort(function (a, b) {
    return String(b.refundDate || b.createdAt).localeCompare(String(a.refundDate || a.createdAt));
  });
  return rows;
}

function getEventRefundListData_(request) {
  var eventId = requireEventRequestId_(request);
  var rows = buildEventRefundSectionRows_(eventId);
  return paginateEventItems_(rows, request);
}
