/**
 * 행사복지관리 서비스 계층.
 * DB 설계서에 있는 물리 필드만 저장하며, 화면 전용 값은 이 파일에서 만들지 않는다.
 */

function ewThrow_(code, message, details) {
  var error = new Error(message || code);
  error.code = code || 'PROCESS_FAILED';
  if (typeof details !== 'undefined') error.details = details;
  throw error;
}

function ewExecuteApi_(handler) {
  var requestId = Utilities.getUuid();
  var executedAt = ewNow_();
  try {
    return {
      ok: true,
      data: handler(),
      error: null,
      meta: { requestId: requestId, executedAt: executedAt }
    };
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return {
      ok: false,
      data: null,
      error: {
        code: error && error.code ? error.code : 'PROCESS_FAILED',
        message: error && error.message ? error.message : '처리 중 오류가 발생했습니다.',
        details: error && typeof error.details !== 'undefined' ? error.details : null
      },
      meta: { requestId: requestId, executedAt: executedAt }
    };
  }
}

function ewParseRequest_(input) {
  var source = input && typeof input === 'object' ? input : {};
  var request = source.request && typeof source.request === 'object'
    ? source.request
    : source;
  return {
    auth: source.auth && typeof source.auth === 'object' ? source.auth : {},
    request: request
  };
}

function ewRequireId_(request) {
  var id = String((request && (request.id || request.event_id || request.application_id)) || '').trim();
  if (!id) ewThrow_('VALIDATION_FAILED', 'id가 필요합니다.');
  return id;
}

function ewRequiredText_(value, fieldName) {
  var text = String(value === null || typeof value === 'undefined' ? '' : value).trim();
  if (!text) ewThrow_('VALIDATION_FAILED', fieldName + ' 값이 필요합니다.');
  return text;
}

function ewOptionalText_(value) {
  return value === null || typeof value === 'undefined' ? '' : String(value).trim();
}

function ewNumber_(value, fieldName, minimum) {
  var number = Number(String(value).replace(/,/g, ''));
  if (!isFinite(number) || number < minimum) {
    ewThrow_('VALIDATION_FAILED', fieldName + ' 값이 올바르지 않습니다.');
  }
  return number;
}

function ewDateText_(value, fieldName) {
  var text = ewRequiredText_(value, fieldName);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    ewThrow_('VALIDATION_FAILED', fieldName + '은 yyyy-MM-dd 형식이어야 합니다.');
  }
  return text;
}

function ewBoolean_(value) {
  return value === true || value === 1 || String(value).toLowerCase() === 'true' || value === 'Y';
}

function ewValidateChoice_(value, choices, fieldName) {
  if (choices.indexOf(value) < 0) {
    ewThrow_('INVALID_STATUS', fieldName + ' 값이 올바르지 않습니다.', { allowed: choices });
  }
  return value;
}

function ewEventPayload_(payload, requireAll) {
  var source = payload && typeof payload === 'object' ? payload : {};
  var config = ewConfig_();
  var fields = [
    'event_name', 'event_type', 'event_status', 'department', 'manager',
    'recruit_start_date', 'recruit_end_date', 'event_date', 'event_place',
    'capacity', 'fee_amount', 'non_member_fee_amount', 'event_purpose',
    'related_materials', 'additional_notes'
  ];
  var optionalTextFields = ['related_materials', 'additional_notes'];
  var result = {};

  fields.forEach(function (field) {
    if (!requireAll && !Object.prototype.hasOwnProperty.call(source, field)) return;
    var value = source[field];
    if (optionalTextFields.indexOf(field) >= 0) {
      result[field] = ewOptionalText_(value);
      return;
    }
    if (field === 'capacity' || field === 'fee_amount' || field === 'non_member_fee_amount') {
      result[field] = ewNumber_(value, field, 0);
    } else if (/_date$/.test(field)) {
      result[field] = ewDateText_(value, field);
    } else {
      result[field] = ewRequiredText_(value, field);
    }
  });

  if (Object.prototype.hasOwnProperty.call(result, 'event_status')) {
    ewValidateChoice_(result.event_status, config.eventStatuses, 'event_status');
  }
  var start = result.recruit_start_date || source.recruit_start_date;
  var end = result.recruit_end_date || source.recruit_end_date;
  if (start && end && String(start) > String(end)) {
    ewThrow_('VALIDATION_FAILED', '모집 종료일은 모집 시작일보다 빠를 수 없습니다.');
  }
  return result;
}

function ewPaginate_(items, request) {
  var config = ewConfig_();
  var page = Math.max(1, Number(request && request.page) || 1);
  var pageSize = Math.min(
    config.maxPageSize,
    Math.max(1, Number(request && request.pageSize) || config.defaultPageSize)
  );
  var totalCount = items.length;
  var totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  var safePage = Math.min(page, totalPages);
  var offset = (safePage - 1) * pageSize;
  return {
    items: items.slice(offset, offset + pageSize).map(ewWithoutRowNumber_),
    page: safePage,
    pageSize: pageSize,
    totalCount: totalCount,
    totalPages: totalPages
  };
}

function ewGetEventListData_(request) {
  var filter = request.filter && typeof request.filter === 'object' ? request.filter : {};
  var keyword = ewOptionalText_(filter.keyword).toLowerCase();
  var rows = ewReadTable_('event').filter(function (item) {
    if (keyword) {
      var haystack = [item.event_name, item.event_id, item.manager, item.department]
        .join(' ').toLowerCase();
      if (haystack.indexOf(keyword) < 0) return false;
    }
    if (filter.manager && String(item.manager) !== String(filter.manager)) return false;
    if (filter.event_type && String(item.event_type) !== String(filter.event_type)) return false;
    if (filter.event_status && String(item.event_status) !== String(filter.event_status)) return false;
    if (filter.start_date && String(item.event_date) < String(filter.start_date)) return false;
    if (filter.end_date && String(item.event_date) > String(filter.end_date)) return false;
    // TODO(API 상세 계약): 별도 종료 필드가 없어 종료 여부는 event_status='종료'에서 파생한다.
    if (filter.close_status === 'closed' && item.event_status !== '종료') return false;
    if (filter.close_status === 'active' && item.event_status === '종료') return false;
    if (filter.include_closed === false && !filter.close_status && item.event_status === '종료') return false;
    return true;
  });
  rows.sort(function (a, b) {
    return String(b.event_date).localeCompare(String(a.event_date));
  });

  var result = ewPaginate_(rows, request);
  var allRows = ewReadTable_('event');
  // TODO(API 상세 계약): 행사복지 Response 상세 필드 확정 시 summary/options 이름을 대조한다.
  result.summary = {
    total: allRows.length,
    scheduled: allRows.filter(function (row) { return row.event_status === '예정'; }).length,
    recruiting: allRows.filter(function (row) { return row.event_status === '모집중'; }).length,
    inProgress: allRows.filter(function (row) { return row.event_status === '진행중'; }).length,
    closed: allRows.filter(function (row) { return row.event_status === '종료'; }).length
  };
  result.options = {
    managers: ewUnique_(allRows.map(function (row) { return row.manager; })),
    eventTypes: ewUnique_(allRows.map(function (row) { return row.event_type; })),
    eventStatuses: ewConfig_().eventStatuses.slice()
  };
  return result;
}

function ewUnique_(values) {
  var seen = {};
  return values.filter(function (value) {
    var key = String(value || '').trim();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  }).sort();
}

function ewCreateEventData_(request) {
  var source = request.payload && typeof request.payload === 'object' ? request.payload : {};
  var payload = ewEventPayload_(source, true);
  return ewWithWriteLock_(function () {
    // TODO(API 상세 계약): event_id 채번 규칙이 설계서에 없어 충돌 없는 UUID를 임시 사용한다.
    payload.event_id = Utilities.getUuid();
    if (source.related_material_file) {
      payload.related_materials = ewUploadRelatedMaterial_(source.related_material_file, payload.event_id);
    }
    return ewWithoutRowNumber_(ewAppendItem_('event', payload));
  });
}

function ewUpdateEventData_(request) {
  var id = ewRequireId_(request);
  var source = request.payload && typeof request.payload === 'object' ? request.payload : {};
  var patch = ewEventPayload_(source, false);
  if (!ewFindById_('event', id)) {
    ewThrow_('NOT_FOUND', '행사를 찾을 수 없습니다.');
  }
  if (source.related_material_file) {
    patch.related_materials = ewUploadRelatedMaterial_(source.related_material_file, id);
  }
  if (!Object.keys(patch).length) {
    ewThrow_('VALIDATION_FAILED', '수정할 행사 정보가 없습니다.');
  }
  return ewWithWriteLock_(function () {
    return ewWithoutRowNumber_(ewUpdateItem_('event', id, patch));
  });
}

function ewUpdateEventStatusData_(request) {
  var id = ewRequireId_(request);
  var payload = request.payload && typeof request.payload === 'object' ? request.payload : request;
  var status = ewRequiredText_(payload.event_status, 'event_status');
  ewValidateChoice_(status, ewConfig_().eventStatuses, 'event_status');
  return ewWithWriteLock_(function () {
    return ewWithoutRowNumber_(ewUpdateItem_('event', id, { event_status: status }));
  });
}

function ewCloseEventData_(request) {
  var id = ewRequireId_(request);
  return ewWithWriteLock_(function () {
    return ewWithoutRowNumber_(ewUpdateItem_('event', id, { event_status: '종료' }));
  });
}

function ewGetEventData_(request) {
  var event = ewFindById_('event', ewRequireId_(request));
  if (!event) ewThrow_('NOT_FOUND', '행사를 찾을 수 없습니다.');
  return ewWithoutRowNumber_(event);
}

function ewGetEventDetailData_(request) {
  var event = ewGetEventData_(request);
  var applicants = ewReadTable_('applicant').filter(function (row) {
    return String(row.event_id) === String(event.event_id) && !ewBoolean_(row.is_cancelled);
  });
  var attendanceById = {};
  ewReadTable_('attendance').forEach(function (row) {
    attendanceById[String(row.application_id)] = row;
  });
  var approved = applicants.filter(function (row) { return row.approval_status === '승인'; });
  var paid = applicants.filter(function (row) { return Number(row.amount_paid || 0) >= Number(row.amount_due || 0); });
  var attended = applicants.filter(function (row) {
    var attendance = attendanceById[String(row.application_id)];
    return attendance && attendance.attendance_status === '출석';
  });
  return {
    event: event,
    summary: {
      totalApplicants: applicants.length,
      approvedApplicants: approved.length,
      paidApplicants: paid.length,
      actualAttendees: attended.length,
      // TODO(장부 연동): 현재 잔액은 행사 DB/API 설계에 원천 테이블이 없다.
      currentBalance: null
    }
  };
}

function ewGetApplicantListData_(request) {
  var eventId = ewRequireId_(request);
  var filter = request.filter && typeof request.filter === 'object' ? request.filter : {};
  var keyword = ewOptionalText_(filter.keyword).toLowerCase();
  var rows = ewReadTable_('applicant').filter(function (row) {
    if (String(row.event_id) !== String(eventId)) return false;
    if (keyword && [row.name, row.student_id, row.phone, row.depositor_name]
      .join(' ').toLowerCase().indexOf(keyword) < 0) return false;
    if (filter.membership_status && row.membership_status !== filter.membership_status) return false;
    if (filter.approval_status && row.approval_status !== filter.approval_status) return false;
    return true;
  });
  rows.sort(function (a, b) { return String(b.applied_at).localeCompare(String(a.applied_at)); });
  return ewPaginate_(rows, request);
}

function ewGetApplicantDetailData_(request) {
  var applicant = ewFindById_('applicant', ewRequireId_(request));
  if (!applicant) ewThrow_('NOT_FOUND', '신청자를 찾을 수 없습니다.');
  var attendance = ewFindById_('attendance', applicant.application_id);
  return {
    applicant: ewWithoutRowNumber_(applicant),
    attendance: ewWithoutRowNumber_(attendance)
  };
}

function ewProcessApplicantData_(request) {
  var id = ewRequireId_(request);
  var action = ewRequiredText_(request.action, 'action');
  var allowed = ['confirmDeposit', 'approve', 'reject'];
  if (allowed.indexOf(action) < 0) {
    ewThrow_('VALIDATION_FAILED', '지원하지 않는 신청자 처리 action입니다.', { allowed: allowed });
  }
  return ewWithWriteLock_(function () {
    var applicant = ewFindById_('applicant', id);
    if (!applicant) ewThrow_('NOT_FOUND', '신청자를 찾을 수 없습니다.');
    var patch = {};
    if (action === 'confirmDeposit') {
      patch.amount_paid = applicant.amount_due;
      patch.fee_paid_date = ewToday_();
    } else if (action === 'approve') {
      patch.approval_status = '승인';
      patch.approved_at = ewNow_();
    } else {
      patch.approval_status = '반려';
      patch.approved_at = '';
    }
    return ewWithoutRowNumber_(ewUpdateItem_('applicant', id, patch));
  });
}

function ewGetAttendanceListData_(request) {
  var eventId = ewRequireId_(request);
  var filter = request.filter && typeof request.filter === 'object' ? request.filter : {};
  var keyword = ewOptionalText_(filter.keyword).toLowerCase();
  var attendanceById = {};
  ewReadTable_('attendance').forEach(function (row) {
    attendanceById[String(row.application_id)] = row;
  });
  var rows = ewReadTable_('applicant').filter(function (row) {
    return String(row.event_id) === String(eventId);
  }).map(function (applicant) {
    var attendance = attendanceById[String(applicant.application_id)] || {};
    return {
      application_id: applicant.application_id,
      student_id: applicant.student_id,
      name: applicant.name,
      phone: applicant.phone,
      membership_status: applicant.membership_status,
      amount_due: applicant.amount_due,
      amount_paid: applicant.amount_paid,
      fee_confirmed_at: attendance.fee_confirmed_at || '',
      attendance_status: attendance.attendance_status || '',
      attendance_checker: attendance.attendance_checker || ''
    };
  }).filter(function (row) {
    if (keyword && [row.name, row.student_id, row.phone].join(' ').toLowerCase().indexOf(keyword) < 0) return false;
    // TODO(API 상세 계약): fee_status는 amount_paid/amount_due 비교로 파생한다.
    var isPaid = Number(row.amount_paid || 0) >= Number(row.amount_due || 0);
    if (filter.fee_status === 'paid' && !isPaid) return false;
    if (filter.fee_status === 'unpaid' && isPaid) return false;
    if (filter.attendance_status && row.attendance_status !== filter.attendance_status) return false;
    return true;
  });
  return ewPaginate_(rows, request);
}

function ewApplyAttendanceChangesData_(request) {
  var eventId = ewRequireId_(request);
  var items = request.payload && Array.isArray(request.payload.items)
    ? request.payload.items
    : (Array.isArray(request.items) ? request.items : []);
  if (!items.length) ewThrow_('VALIDATION_FAILED', '적용할 출석 변경사항이 없습니다.');
  var allowed = ewConfig_().attendanceStatuses;
  return ewWithWriteLock_(function () {
    return items.map(function (item) {
      var applicationId = ewRequiredText_(item.application_id, 'application_id');
      var applicant = ewFindById_('applicant', applicationId);
      if (!applicant) ewThrow_('NOT_FOUND', '신청자를 찾을 수 없습니다: ' + applicationId);
      if (String(applicant.event_id) !== String(eventId)) {
        ewThrow_('VALIDATION_FAILED', '다른 행사의 출석 정보는 변경할 수 없습니다: ' + applicationId);
      }
      var status = ewRequiredText_(item.attendance_status, 'attendance_status');
      ewValidateChoice_(status, allowed, 'attendance_status');
      var patch = {
        application_id: applicationId,
        student_id: applicant.student_id,
        fee_confirmed_at: item.fee_confirmed_at || '',
        attendance_status: status,
        attendance_checker: ewCurrentUserEmail_()
      };
      var current = ewFindById_('attendance', applicationId);
      return ewWithoutRowNumber_(current
        ? ewUpdateItem_('attendance', applicationId, patch)
        : ewAppendItem_('attendance', patch));
    });
  });
}

function ewGetRefundListData_(request) {
  var eventId = ewRequireId_(request);
  var rows = ewReadTable_('applicant').filter(function (row) {
    return String(row.event_id) === String(eventId) &&
      (ewBoolean_(row.is_cancelled) || Number(row.refund_amount || 0) > 0 || row.refund_processed_at);
  });
  return ewPaginate_(rows, request);
}

function ewUnavailable_(message, details) {
  ewThrow_('PROCESS_FAILED', message, details || { status: '확인 필요' });
}
