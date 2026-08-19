// 행사 조회와 화면용 복합 조회를 조합한다.

function getEventListData_(request) {
  var filter = request.filter && typeof request.filter === 'object' ? request.filter : {};
  var keyword = normalizeEventText_(filter.keyword).toLowerCase();
  var rows = listEventClientRows_().filter(function (item) {
    if (keyword) {
      var haystack = [item.name, item.id, item.managerEmail]
        .join(' ').toLowerCase();
      if (haystack.indexOf(keyword) < 0) return false;
    }
    if (filter.managerEmail && String(item.managerEmail) !== String(filter.managerEmail)) return false;
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
  var allRows = listEventClientRows_();
  // TODO(API 상세 계약): 행사복지 Response 상세 필드 확정 후 summary/options 이름을 대조한다.
  result.summary = {
    total: allRows.length,
    scheduled: allRows.filter(function (row) { return row.status === '예정'; }).length,
    recruiting: allRows.filter(function (row) { return row.status === '모집'; }).length,
    inProgress: allRows.filter(function (row) { return row.status === '진행'; }).length,
    closed: allRows.filter(function (row) { return row.status === '종료'; }).length
  };
  result.options = {
    managers: buildUniqueEventValues_(allRows.map(function (row) { return row.managerEmail; })),
    eventTypes: buildUniqueEventValues_(allRows.map(function (row) { return row.category; })),
    eventStatuses: EVENT_STATUSES.slice()
  };
  return result;
}

function buildUniqueEventValues_(values) {
  var seen = {};
  return values.filter(function (value) {
    var key = String(value || '').trim();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  }).sort();
}

function getEventForEditData_(request) {
  var event = findEventRowById_(requireEventRequestId_(request));
  if (!event) throwEventError_('NOT_FOUND', '행사를 찾을 수 없습니다.');
  return withoutInternalRowNumber_(event);
}

function buildEventFormSyncView_(eventForm) {
  var row = eventForm || {};
  return {
    configured: !!(row.googleFormId || row.responseSheetId),
    googleFormId: row.googleFormId || '',
    responseSheetId: row.responseSheetId || '',
    status: row.status || '미연동',
    lastSyncedAt: row.lastSyncedAt || ''
  };
}

function getEventDetailData_(request) {
  var event = getEventForEditData_(request);
  var applicants = listEventApplicationClientRows_().filter(function (row) {
    return String(row.eventId) === String(event.id);
  });
  var attendanceById = {};
  listEventAttendanceClientRows_().forEach(function (row) {
    attendanceById[String(row.applicationId)] = row;
  });
  var approved = applicants.filter(function (row) { return row.status === '승인'; });
  var paymentTotals = buildEventPaymentTotalsByApplicationId_();
  var paid = applicants.filter(function (row) {
    return Number(paymentTotals[row.id] || 0) >= Number(row.appliedFee || 0);
  });
  var attended = applicants.filter(function (row) {
    var attendance = attendanceById[String(row.id)];
    return attendance && attendance.status === '출석';
  });
  var result = {
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
  // 실제 GAS 런타임에서는 DAO가 항상 로드되며 additive formSync를 제공한다.
  // 격리된 레거시 테스트 harness가 query service만 로드하는 경우 기존 응답 모양을 유지한다.
  if (typeof findEventFormByEventId_ === 'function') {
    result.formSync = buildEventFormSyncView_(findEventFormByEventId_(event.id));
  }
  return result;
}
