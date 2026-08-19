// 행사 신청자 조회와 화면용 조합을 담당한다.

function getApplicantListData_(request) {
  var eventId = requireEventRequestId_(request);
  var filter = request.filter && typeof request.filter === 'object' ? request.filter : {};
  var keyword = normalizeEventText_(filter.keyword).toLowerCase();
  var paymentTotals = buildEventPaymentTotalsByApplicationId_();
  var rows = listEventApplicationClientRows_().filter(function (row) {
    if (String(row.eventId) !== String(eventId)) return false;
    if (keyword && [row.name, row.studentId, row.phone, row.accountHolder]
      .join(' ').toLowerCase().indexOf(keyword) < 0) return false;
    if (filter.applicantType && row.applicantType !== filter.applicantType) return false;
    if (filter.status && row.status !== filter.status) return false;
    return true;
  });
  rows.forEach(function (row) {
    row.paidAmount = paymentTotals[row.id] || 0;
  });
  rows.sort(function (a, b) { return String(b.sourceResponseAt).localeCompare(String(a.sourceResponseAt)); });
  return paginateEventItems_(rows, request);
}

function getApplicantDetailData_(request) {
  var applicant = findEventApplicationRowById_(requireEventRequestId_(request));
  if (!applicant) throwEventError_('NOT_FOUND', '신청자를 찾을 수 없습니다.');
  var attendance = findEventAttendanceRowByApplicationId_(applicant.id);
  applicant.paidAmount = buildEventPaymentTotalsByApplicationId_()[applicant.id] || 0;
  return {
    applicant: withoutInternalRowNumber_(applicant),
    attendance: withoutInternalRowNumber_(attendance)
  };
}
