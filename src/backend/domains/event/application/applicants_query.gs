// 행사 신청자 조회와 화면용 조합을 담당한다.

function buildEventExtraAnswersByApplicationId_() {
  var answersByApplicationId = {};
  var rows = typeof listEventExtraAnswerClientRows_ === 'function'
    ? listEventExtraAnswerClientRows_()
    : [];
  rows.forEach(function (answer) {
    var applicationId = String(answer.applicationId || '');
    if (!applicationId) return;
    if (!answersByApplicationId[applicationId]) answersByApplicationId[applicationId] = [];
    answersByApplicationId[applicationId].push(withoutInternalRowNumber_(answer));
  });
  return answersByApplicationId;
}

function buildEventApplicantSectionRows_(eventId) {
  var targetEventId = String(eventId || '');
  var paymentTotals = buildEventPaymentTotalsByApplicationId_();
  var answersByApplicationId = buildEventExtraAnswersByApplicationId_();
  var rows = listEventApplicationClientRows_().filter(function (row) {
    return String(row.eventId) === targetEventId;
  }).map(function (row) {
    var item = Object.assign({}, withoutInternalRowNumber_(row));
    item.paidAmount = paymentTotals[item.id] || 0;
    item.extraAnswers = answersByApplicationId[String(item.id)] || [];
    return item;
  });
  rows.sort(function (a, b) {
    return String(b.sourceResponseAt).localeCompare(String(a.sourceResponseAt));
  });
  return rows;
}

function getApplicantListData_(request) {
  var eventId = requireEventRequestId_(request);
  var filter = request.filter && typeof request.filter === 'object' ? request.filter : {};
  var keyword = normalizeEventText_(filter.keyword).toLowerCase();
  var rows = buildEventApplicantSectionRows_(eventId).filter(function (row) {
    if (keyword && [row.name, row.studentId, row.phone, row.accountHolder]
      .join(' ').toLowerCase().indexOf(keyword) < 0) return false;
    if (filter.applicantType && row.applicantType !== filter.applicantType) return false;
    if (filter.status && row.status !== filter.status) return false;
    return true;
  });
  return paginateEventItems_(rows, request);
}

function getApplicantDetailData_(request) {
  var applicant = findEventApplicationRowById_(requireEventRequestId_(request));
  if (!applicant) throwEventError_('NOT_FOUND', '신청자를 찾을 수 없습니다.');
  var attendance = findEventAttendanceRowByApplicationId_(applicant.id);
  applicant.paidAmount = buildEventPaymentTotalsByApplicationId_()[applicant.id] || 0;
  applicant.extraAnswers = buildEventExtraAnswersByApplicationId_()[String(applicant.id)] || [];
  return {
    applicant: withoutInternalRowNumber_(applicant),
    attendance: withoutInternalRowNumber_(attendance)
  };
}
