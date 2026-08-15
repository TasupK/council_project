function buildEventPayload_(payload, requireAll) {
  var source = payload && typeof payload === 'object' ? payload : {};
  var fields = [
    'name', 'category', 'status', 'managerId',
    'applicationStartAt', 'applicationEndAt', 'eventStartAt', 'eventEndAt',
    'capacity', 'payerFee', 'nonPayerFee', 'description', 'evidenceFolderId'
  ];
  var optionalTextFields = ['evidenceFolderId', 'eventEndAt'];
  var result = {};

  fields.forEach(function (field) {
    if (!requireAll && !Object.prototype.hasOwnProperty.call(source, field)) return;
    var value = source[field];
    if (optionalTextFields.indexOf(field) >= 0) {
      result[field] = normalizeEventText_(value);
      return;
    }
    if (field === 'capacity' || field === 'payerFee' || field === 'nonPayerFee') {
      result[field] = parseEventNumber_(value, field, 0);
    } else if (/At$/.test(field)) {
      result[field] = parseEventDateText_(value, field);
    } else {
      result[field] = requireEventText_(value, field);
    }
  });

  if (Object.prototype.hasOwnProperty.call(result, 'status')) {
    validateEventChoice_(result.status, EVENT_STATUSES, 'status');
  }
  var start = result.applicationStartAt || source.applicationStartAt;
  var end = result.applicationEndAt || source.applicationEndAt;
  if (start && end && String(start) > String(end)) {
    throwEventError_('VALIDATION_FAILED', '모집 종료일은 모집 시작일보다 빠를 수 없습니다.');
  }
  return result;
}

// 1. 행사 목록 조회와 선택지 생성
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

// 2. 행사 생성, 수정, 상태 변경, 상세 조회
function createEventData_(request) {
  var source = request.payload && typeof request.payload === 'object' ? request.payload : {};
  var payload = buildEventPayload_(source, true);
  return withOperationWriteLock_(function () {
    // TODO(API 상세 계약): id 채번 규칙이 스키마에 없어 충돌 없는 UUID를 임시 사용한다.
    payload.id = Utilities.getUuid();
    payload.applicationEnabled = true;
    payload.feeEnabled = Number(payload.payerFee || 0) > 0 || Number(payload.nonPayerFee || 0) > 0;
    payload.attendanceEnabled = true;
    payload.refundEnabled = false;
    payload.fullRefundPolicy = '없음';
    payload.balanceDistributionEnabled = false;
    payload.eventEndAt = payload.eventEndAt || payload.eventStartAt;
    payload.createdAt = getCurrentIsoDateTime_();
    payload.updatedAt = payload.createdAt;
    payload.evidenceFolderId = getEventMaterialFolder_().getId();
    if (source.relatedMaterialFile) {
      uploadEventRelatedMaterial_(source.relatedMaterialFile, payload.id);
    }
    insertEventRow_(payload);
    return withoutInternalRowNumber_(payload);
  });
}

function updateEventData_(request) {
  var id = requireEventRequestId_(request);
  var source = request.payload && typeof request.payload === 'object' ? request.payload : {};
  var patch = buildEventPayload_(source, false);
  patch.updatedAt = getCurrentIsoDateTime_();
  if (!findEventRowById_(id)) {
    throwEventError_('NOT_FOUND', '행사를 찾을 수 없습니다.');
  }
  if (source.relatedMaterialFile) {
    uploadEventRelatedMaterial_(source.relatedMaterialFile, id);
  }
  if (!Object.keys(patch).length) {
    throwEventError_('VALIDATION_FAILED', '수정할 행사 정보가 없습니다.');
  }
  return withOperationWriteLock_(function () {
    updateEventRowById_(id, patch);
    return withoutInternalRowNumber_(findEventRowById_(id));
  });
}

function updateEventStatusData_(request) {
  var id = requireEventRequestId_(request);
  var payload = request.payload && typeof request.payload === 'object' ? request.payload : request;
  var status = requireEventText_(payload.status, 'status');
  validateEventChoice_(status, EVENT_STATUSES, 'status');
  return withOperationWriteLock_(function () {
    updateEventRowById_(id, { status: status });
    return withoutInternalRowNumber_(findEventRowById_(id));
  });
}

function closeEventData_(request) {
  var id = requireEventRequestId_(request);
  return withOperationWriteLock_(function () {
    updateEventRowById_(id, { status: '종료' });
    return withoutInternalRowNumber_(findEventRowById_(id));
  });
}

function getEventData_(request) {
  var event = findEventRowById_(requireEventRequestId_(request));
  if (!event) throwEventError_('NOT_FOUND', '행사를 찾을 수 없습니다.');
  return withoutInternalRowNumber_(event);
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




