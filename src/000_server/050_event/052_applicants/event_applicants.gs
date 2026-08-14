// 1. 신청자 목록, 상세, 승인 처리
function getApplicantListData_(request) {
  var eventId = requireEventRequestId_(request);
  var filter = request.filter && typeof request.filter === 'object' ? request.filter : {};
  var keyword = normalizeEventText_(filter.keyword).toLowerCase();
  var paymentTotals = getEventPaymentTotalsByApplicationId_();
  var rows = readOperationTableClientRows_('eventApplications').filter(function (row) {
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
  var applicant = findOperationTableRowById_('eventApplications', requireEventRequestId_(request));
  if (!applicant) throwEventError_('NOT_FOUND', '신청자를 찾을 수 없습니다.');
  var attendance = findEventAttendanceByApplicationId_(applicant.id);
  applicant.paidAmount = getEventPaymentTotalsByApplicationId_()[applicant.id] || 0;
  return {
    applicant: withoutInternalRowNumber_(applicant),
    attendance: withoutInternalRowNumber_(attendance)
  };
}

function processApplicantData_(request) {
  var id = requireEventRequestId_(request);
  var action = requireEventText_(request.action, 'action');
  var allowed = ['confirmDeposit', 'approve', 'reject'];
  if (allowed.indexOf(action) < 0) {
    throwEventError_('VALIDATION_FAILED', '지원하지 않는 신청자 처리 action입니다.', { allowed: allowed });
  }
  return withOperationWriteLock_(function () {
    var applicant = findOperationTableRowById_('eventApplications', id);
    if (!applicant) throwEventError_('NOT_FOUND', '신청자를 찾을 수 없습니다.');
    var patch = {};
    if (action === 'confirmDeposit') {
      throwEventError_('PROCESS_FAILED', '행사 입금 대조 규칙이 확정되지 않아 입금 확인을 처리할 수 없습니다.');
    } else if (action === 'approve') {
      patch.status = '승인';
      patch.processedAt = getCurrentIsoDateTime_();
    } else {
      patch.status = '반려';
      patch.processedAt = '';
    }
    updateOperationTableRow_('eventApplications', id, patch);
    return withoutInternalRowNumber_(findOperationTableRowById_('eventApplications', id));
  });
}



