// 1. 행사 환불 대상 조회
function getEventRefundListData_(request) {
  var eventId = requireEventRequestId_(request);
  var applicantsById = {};
  readOperationTableClientRows_('eventApplications').forEach(function (applicant) {
    if (String(applicant.eventId) === String(eventId)) applicantsById[applicant.id] = applicant;
  });
  var rows = readOperationTableClientRows_('eventRefunds').filter(function (refund) {
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


