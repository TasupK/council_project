// 행사 출석 조회와 화면용 조합을 담당한다.

function getAttendanceListData_(request) {
  var eventId = requireEventRequestId_(request);
  var filter = request.filter && typeof request.filter === 'object' ? request.filter : {};
  var keyword = normalizeEventText_(filter.keyword).toLowerCase();
  var attendanceById = {};
  listEventAttendanceClientRows_().forEach(function (row) {
    attendanceById[String(row.applicationId)] = row;
  });
  var paymentTotals = buildEventPaymentTotalsByApplicationId_();
  var rows = listEventApplicationClientRows_().filter(function (row) {
    return String(row.eventId) === String(eventId);
  }).map(function (applicant) {
    var attendance = attendanceById[String(applicant.id)] || {};
    return {
      applicationId: applicant.id,
      studentId: applicant.studentId,
      name: applicant.name,
      phone: applicant.phone,
      applicantType: applicant.applicantType,
      appliedFee: applicant.appliedFee,
      paidAmount: paymentTotals[applicant.id] || 0,
      confirmedAt: attendance.confirmedAt || '',
      status: attendance.status || '',
      managerId: attendance.managerId || ''
    };
  }).filter(function (row) {
    if (keyword && [row.name, row.studentId, row.phone].join(' ').toLowerCase().indexOf(keyword) < 0) return false;
    // TODO(API 상세 계약): fee_status는 paidAmount/appliedFee 비교로 파생한다.
    var isPaid = Number(row.paidAmount || 0) >= Number(row.appliedFee || 0);
    if (filter.feeStatus === 'paid' && !isPaid) return false;
    if (filter.feeStatus === 'unpaid' && isPaid) return false;
    if (filter.status && row.status !== filter.status) return false;
    return true;
  });
  return paginateEventItems_(rows, request);
}
