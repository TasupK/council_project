// Event 도메인의 화면용 복합 조회를 조합한다.

function getEventListData_(request) {
  var filter = request.filter && typeof request.filter === 'object' ? request.filter : {};
  var keyword = normalizeEventText_(filter.keyword).toLowerCase();
  var rows = findAllEventClientRows_().filter(function (item) {
    if (keyword) {
      var haystack = [item.name, item.id, item.managerId]
        .join(' ').toLowerCase();
      if (haystack.indexOf(keyword) < 0) return false;
    }
    if (filter.managerId && String(item.managerId) !== String(filter.managerId)) return false;
    if (filter.category && String(item.category) !== String(filter.category)) return false;
    if (filter.status && String(item.status) !== String(filter.status)) return false;
    if (filter.startDate && String(item.eventStartAt) < String(filter.startDate)) return false;
    if (filter.endDate && String(item.eventStartAt) > String(filter.endDate)) return false;
    // TODO(API 상세 계약): 별도 종료 필드가 없어 종료 여부는 status='종료'에서 파생한다.
    if (filter.closeStatus === 'closed' && item.status !== '종료') return false;
    if (filter.closeStatus === 'active' && item.status === '종료') return false;
    if (filter.includeClosed === false && !filter.closeStatus && item.status === '종료') return false;
    return true;
  });
  rows.sort(function (a, b) {
    return String(b.eventStartAt).localeCompare(String(a.eventStartAt));
  });

  var result = paginateEventItems_(rows, request);
  var allRows = findAllEventClientRows_();
  // TODO(API 상세 계약): 행사복지 Response 상세 필드 확정 후 summary/options 이름을 대조한다.
  result.summary = {
    total: allRows.length,
    scheduled: allRows.filter(function (row) { return row.status === '예정'; }).length,
    recruiting: allRows.filter(function (row) { return row.status === '모집'; }).length,
    inProgress: allRows.filter(function (row) { return row.status === '진행'; }).length,
    closed: allRows.filter(function (row) { return row.status === '종료'; }).length
  };
  result.options = {
    managers: getUniqueEventValues_(allRows.map(function (row) { return row.managerId; })),
    eventTypes: getUniqueEventValues_(allRows.map(function (row) { return row.category; })),
    eventStatuses: EVENT_STATUSES.slice()
  };
  return result;
}

function getUniqueEventValues_(values) {
  var seen = {};
  return values.filter(function (value) {
    var key = String(value || '').trim();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  }).sort();
}

function getEventDetailData_(request) {
  var event = getEventData_(request);
  var applicants = findAllEventApplicationClientRows_().filter(function (row) {
    return String(row.eventId) === String(event.id);
  });
  var attendanceById = {};
  findAllEventAttendanceClientRows_().forEach(function (row) {
    attendanceById[String(row.applicationId)] = row;
  });
  var approved = applicants.filter(function (row) { return row.status === '승인'; });
  var paymentTotals = getEventPaymentTotalsByApplicationId_();
  var paid = applicants.filter(function (row) {
    return Number(paymentTotals[row.id] || 0) >= Number(row.appliedFee || 0);
  });
  var attended = applicants.filter(function (row) {
    var attendance = attendanceById[String(row.id)];
    return attendance && attendance.status === '출석';
  });
  return {
    event: event,
    summary: {
      totalApplicants: applicants.length,
      approvedApplicants: approved.length,
      paidApplicants: paid.length,
      actualAttendees: attended.length,
      // TODO(회계 연동): 현재 잔액은 행사 DB/API 스키마에 원천 테이블이 없다.
      currentBalance: null
    }
  };
}

function getApplicantListData_(request) {
  var eventId = requireEventRequestId_(request);
  var filter = request.filter && typeof request.filter === 'object' ? request.filter : {};
  var keyword = normalizeEventText_(filter.keyword).toLowerCase();
  var paymentTotals = getEventPaymentTotalsByApplicationId_();
  var rows = findAllEventApplicationClientRows_().filter(function (row) {
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
  var attendance = findEventAttendanceByApplicationId_(applicant.id);
  applicant.paidAmount = getEventPaymentTotalsByApplicationId_()[applicant.id] || 0;
  return {
    applicant: withoutInternalRowNumber_(applicant),
    attendance: withoutInternalRowNumber_(attendance)
  };
}

function getAttendanceListData_(request) {
  var eventId = requireEventRequestId_(request);
  var filter = request.filter && typeof request.filter === 'object' ? request.filter : {};
  var keyword = normalizeEventText_(filter.keyword).toLowerCase();
  var attendanceById = {};
  findAllEventAttendanceClientRows_().forEach(function (row) {
    attendanceById[String(row.applicationId)] = row;
  });
  var paymentTotals = getEventPaymentTotalsByApplicationId_();
  var rows = findAllEventApplicationClientRows_().filter(function (row) {
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

function getEventRefundListData_(request) {
  var eventId = requireEventRequestId_(request);
  var applicantsById = {};
  findAllEventApplicationClientRows_().forEach(function (applicant) {
    if (String(applicant.eventId) === String(eventId)) applicantsById[applicant.id] = applicant;
  });
  var rows = findAllEventRefundClientRows_().filter(function (refund) {
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
