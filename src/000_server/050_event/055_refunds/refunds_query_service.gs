// 행사 환불 조회와 화면용 조합을 담당한다.

function getEventRefundListData_(request) {
  var eventId = requireEventRequestId_(request);
  var applicantsById = {};
  listEventApplicationClientRows_().forEach(function (applicant) {
    if (String(applicant.eventId) === String(eventId)) applicantsById[applicant.id] = applicant;
  });
  var rows = listEventRefundClientRows_().filter(function (refund) {
    return Boolean(applicantsById[refund.applicationId]);
  }).map(function (refund) {
    var applicant = applicantsById[refund.applicationId];
    return Object.assign({}, refund, {
      name: applicant.name,
      studentId: applicant.studentId
    });
  });
  return paginateEventItems_(rows, request);
}
