/**
 * 행사복지관리 서비스 계층.
 * 새 행사복지 DB의 한글 물리 필드에 매핑되는 값만 저장한다.
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

function ewOptionalNumber_(value, fieldName, minimum, defaultValue) {
  var text = String(value === null || typeof value === 'undefined' ? '' : value).trim();
  if (!text) return defaultValue;
  return ewNumber_(text, fieldName, minimum);
}

function ewDateText_(value, fieldName) {
  var text = ewRequiredText_(value, fieldName);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    ewThrow_('VALIDATION_FAILED', fieldName + '은 yyyy-MM-dd 형식이어야 합니다.');
  }
  return text;
}

function ewBoolean_(value) {
  var text = String(value === null || typeof value === 'undefined' ? '' : value)
    .trim()
    .toLowerCase();
  return value === true || value === 1 || text === '1' || text === 'true' ||
    text === 'y' || text === 'yes' || text === 'o';
}

function ewEventFeeEnabled_(event) {
  var configured = event && event.participation_fee_enabled;
  if (configured !== null && typeof configured !== 'undefined' && String(configured).trim() !== '') {
    return ewBoolean_(configured);
  }
  return Number(event && event.fee_amount || 0) > 0 ||
    Number(event && event.non_member_fee_amount || 0) > 0;
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
    'event_name', 'event_type', 'event_status', 'manager',
    'recruit_start_date', 'recruit_end_date', 'event_date', 'event_end_date',
    'capacity', 'fee_amount', 'non_member_fee_amount', 'event_purpose',
    'application_management_enabled', 'participation_fee_enabled',
    'attendance_management_enabled',
    'settlement_balance_distribution_enabled'
  ];
  var optionalNumberFields = ['fee_amount', 'non_member_fee_amount'];
  var booleanFields = [
    'application_management_enabled',
    'participation_fee_enabled',
    'attendance_management_enabled',
    'settlement_balance_distribution_enabled'
  ];
  var result = {};

  fields.forEach(function (field) {
    if (!requireAll && !Object.prototype.hasOwnProperty.call(source, field)) return;
    var value = source[field];
    if (optionalNumberFields.indexOf(field) >= 0) {
      result[field] = ewOptionalNumber_(value, field, 0, 0);
    } else if (booleanFields.indexOf(field) >= 0) {
      result[field] = ewBoolean_(value) ? 1 : 0;
    } else if (field === 'capacity') {
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
  if (Object.prototype.hasOwnProperty.call(result, 'participation_fee_enabled') &&
      !ewBoolean_(result.participation_fee_enabled)) {
    result.fee_amount = 0;
    result.non_member_fee_amount = 0;
  }
  var start = result.recruit_start_date || source.recruit_start_date;
  var end = result.recruit_end_date || source.recruit_end_date;
  if (start && end && String(start) > String(end)) {
    ewThrow_('VALIDATION_FAILED', '모집 종료일은 모집 시작일보다 빠를 수 없습니다.');
  }
  var eventStart = result.event_date || source.event_date;
  var eventEnd = result.event_end_date || source.event_end_date;
  if (eventStart && eventEnd && String(eventStart) > String(eventEnd)) {
    ewThrow_('VALIDATION_FAILED', '행사 종료일은 행사 시작일보다 빠를 수 없습니다.');
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
      var haystack = [item.event_name, item.event_id, item.manager]
        .join(' ').toLowerCase();
      if (haystack.indexOf(keyword) < 0) return false;
    }
    if (filter.manager && String(item.manager) !== String(filter.manager)) return false;
    if (filter.event_type && String(item.event_type) !== String(filter.event_type)) return false;
    if (filter.event_status && String(item.event_status) !== String(filter.event_status)) return false;
    if (filter.start_date && String(item.event_date) < String(filter.start_date)) return false;
    if (filter.end_date && String(item.event_date) > String(filter.end_date)) return false;
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
    payload.refund_management_enabled = 0;
    payload.full_refund_policy = '';
    payload.created_at = ewNow_();
    payload.updated_at = payload.created_at;
    payload.evidence_folder_id = '';
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
  if (!Object.keys(patch).length) {
    ewThrow_('VALIDATION_FAILED', '수정할 행사 정보가 없습니다.');
  }
  patch.updated_at = ewNow_();
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
    return ewWithoutRowNumber_(ewUpdateItem_('event', id, {
      event_status: status,
      updated_at: ewNow_()
    }));
  });
}

function ewCloseEventData_(request) {
  var id = ewRequireId_(request);
  return ewWithWriteLock_(function () {
    return ewWithoutRowNumber_(ewUpdateItem_('event', id, {
      event_status: '종료',
      updated_at: ewNow_()
    }));
  });
}

function ewGetEventData_(request) {
  var event = ewFindById_('event', ewRequireId_(request));
  if (!event) ewThrow_('NOT_FOUND', '행사를 찾을 수 없습니다.');
  return ewWithoutRowNumber_(event);
}

function ewGetEventDetailData_(request) {
  var eventId = ewRequireId_(request);
  var event = ewReadTable_('event').find(function (row) {
    return String(row.event_id) === String(eventId);
  });
  if (!event) ewThrow_('NOT_FOUND', '행사를 찾을 수 없습니다.');

  var applicants = ewReadTable_('applicant').filter(function (row) {
    return String(row.event_id) === String(event.event_id);
  });
  var depositsByApplication = {};
  ewReadTable_('deposit').forEach(function (row) {
    var applicationId = String(row.application_id || '');
    if (!applicationId) return;
    if (!depositsByApplication[applicationId]) {
      depositsByApplication[applicationId] = {
        amount_paid: 0,
        amount_due: 0,
        payment_status: '',
        payment_date: '',
        depositor_name: ''
      };
    }
    var deposit = depositsByApplication[applicationId];
    deposit.amount_paid += ewCellNumber_(row.amount_paid);
    deposit.amount_due = Math.max(deposit.amount_due, ewCellNumber_(row.amount_due));
    deposit.payment_status = row.payment_status || deposit.payment_status;
    deposit.payment_date = row.payment_date || deposit.payment_date;
    deposit.depositor_name = row.depositor_name || deposit.depositor_name;
  });
  var enrichedApplicants = applicants.map(function (row) {
    var applicant = ewWithoutRowNumber_(row);
    var deposit = depositsByApplication[String(row.application_id)] || {};
    applicant.amount_paid = ewCellNumber_(deposit.amount_paid);
    applicant.payment_status = deposit.payment_status || '';
    applicant.payment_date = deposit.payment_date || '';
    applicant.depositor_name = deposit.depositor_name || '';
    if (!ewCellNumber_(applicant.amount_due) && ewCellNumber_(deposit.amount_due)) {
      applicant.amount_due = ewCellNumber_(deposit.amount_due);
    }
    return applicant;
  });
  var attendanceById = {};
  ewReadTable_('attendance').forEach(function (row) {
    attendanceById[String(row.application_id)] = ewWithoutRowNumber_(row);
  });
  var attendanceRows = enrichedApplicants.map(function (applicant) {
    var attendance = attendanceById[String(applicant.application_id)] || {};
    var row = {};
    Object.keys(applicant).forEach(function (key) { row[key] = applicant[key]; });
    row.confirmed_at = attendance.confirmed_at || '';
    row.attendance_status = attendance.attendance_status || '';
    row.attendance_checker = attendance.attendance_checker || '';
    return row;
  });
  var applicantById = {};
  enrichedApplicants.forEach(function (row) {
    applicantById[String(row.application_id)] = row;
  });
  var refunds = ewReadTable_('refund').filter(function (row) {
    return Boolean(applicantById[String(row.application_id)]);
  }).map(function (row) {
    var refund = ewWithoutRowNumber_(row);
    var applicant = applicantById[String(row.application_id)] || {};
    refund.name = applicant.name || '';
    refund.student_id = applicant.student_id || '';
    return refund;
  });
  var eventForm = ewReadTable_('eventForm').find(function (row) {
    return String(row.event_id) === String(event.event_id);
  });
  var approved = enrichedApplicants.filter(function (row) { return row.approval_status === '승인'; });
  var paid = ewEventFeeEnabled_(event)
    ? enrichedApplicants.filter(function (row) {
      var amountDue = ewCellNumber_(row.amount_due);
      return amountDue > 0 && ewCellNumber_(row.amount_paid) >= amountDue;
    })
    : [];
  var attended = enrichedApplicants.filter(function (row) {
    var attendance = attendanceById[String(row.application_id)];
    return attendance && attendance.attendance_status === '출석';
  });
  return {
    event: ewWithoutRowNumber_(event),
    summary: {
      totalApplicants: enrichedApplicants.length,
      approvedApplicants: approved.length,
      paidApplicants: paid.length,
      actualAttendees: attended.length
    },
    applicants: enrichedApplicants,
    attendanceRows: attendanceRows,
    refunds: refunds,
    formSync: ewFormSyncView_(eventForm)
  };
}

function ewCellNumber_(value) {
  var number = Number(String(value === null || typeof value === 'undefined' ? '' : value)
    .replace(/[^0-9.-]/g, ''));
  return isFinite(number) ? number : 0;
}

function ewFormSyncView_(eventForm) {
  var row = eventForm || {};
  return {
    configured: Boolean(row.google_form_id || row.response_spreadsheet_id),
    googleFormId: row.google_form_id || '',
    responseSpreadsheetId: row.response_spreadsheet_id || '',
    connectionStatus: row.connection_status || '미연동',
    lastSyncedAt: row.last_synced_at || ''
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
    if (filter.applicant_type && row.applicant_type !== filter.applicant_type) return false;
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

/** Google Form 응답 시트를 명시적으로 한 번 읽고 신규 응답만 행사신청 DB에 적재한다. */
function ewSyncApplicantsFromFormsData_(request) {
  var eventId = ewRequireId_(request);
  var event = ewFindById_('event', eventId);
  if (!event) ewThrow_('NOT_FOUND', '행사를 찾을 수 없습니다.');

  var payload = request.payload && typeof request.payload === 'object' ? request.payload : {};
  var eventForm = ewReadTable_('eventForm').find(function (row) {
    return String(row.event_id) === String(eventId);
  }) || null;
  var googleFormId = Object.prototype.hasOwnProperty.call(payload, 'google_form_id')
    ? ewExtractGoogleResourceId_(payload.google_form_id)
    : ewExtractGoogleResourceId_(eventForm && eventForm.google_form_id);
  var responseSpreadsheetId = Object.prototype.hasOwnProperty.call(payload, 'response_spreadsheet_id')
    ? ewExtractGoogleResourceId_(payload.response_spreadsheet_id)
    : ewExtractGoogleResourceId_(eventForm && eventForm.response_spreadsheet_id);

  var source = ewResolveFormResponseSource_(googleFormId, responseSpreadsheetId);
  var candidates = ewBuildFormResponseCandidates_(source, event);

  return ewWithWriteLock_(function () {
    var existingApplicants = ewReadTable_('applicant');
    var importedResponseIds = {};
    existingApplicants.forEach(function (row) {
      var responseId = String(row.source_response_id || '').trim();
      if (responseId) importedResponseIds[responseId] = true;
    });

    var newApplicants = [];
    var newAdditionalAnswers = [];
    var duplicateCount = 0;
    candidates.items.forEach(function (candidate) {
      var responseId = String(candidate.applicant.source_response_id || '');
      if (importedResponseIds[responseId]) {
        duplicateCount += 1;
        return;
      }
      importedResponseIds[responseId] = true;
      newApplicants.push(candidate.applicant);
      candidate.additionalAnswers.forEach(function (answer) {
        newAdditionalAnswers.push(answer);
      });
    });

    ewAppendItems_('applicant', newApplicants);
    ewAppendItems_('additionalAnswer', newAdditionalAnswers);

    var syncedAt = ewNow_();
    var currentForm = ewReadTable_('eventForm').find(function (row) {
      return String(row.event_id) === String(eventId);
    }) || null;
    var formValues = {
      event_id: eventId,
      google_form_id: source.googleFormId,
      response_spreadsheet_id: source.responseSpreadsheetId,
      connection_status: '연동',
      last_synced_at: syncedAt
    };
    if (currentForm) {
      ewUpdateItem_('eventForm', currentForm.event_form_id, formValues);
    } else {
      formValues.event_form_id = Utilities.getUuid();
      formValues.created_at = syncedAt;
      ewAppendItems_('eventForm', [formValues]);
    }

    return {
      importedCount: newApplicants.length,
      duplicateCount: duplicateCount,
      invalidCount: candidates.invalidRows.length,
      invalidRows: candidates.invalidRows,
      sourceSheetName: source.sheet.getName(),
      importedItems: newApplicants.map(function (row) {
        var item = ewWithoutRowNumber_(row);
        item.amount_paid = 0;
        item.payment_status = '';
        item.payment_date = '';
        item.depositor_name = '';
        return item;
      }),
      formSync: {
        configured: true,
        googleFormId: source.googleFormId,
        responseSpreadsheetId: source.responseSpreadsheetId,
        connectionStatus: '연동',
        lastSyncedAt: syncedAt
      }
    };
  });
}

function ewResolveFormResponseSource_(googleFormId, responseSpreadsheetId) {
  var formId = ewOptionalText_(googleFormId);
  var spreadsheetId = ewOptionalText_(responseSpreadsheetId);
  if (!spreadsheetId && formId) {
    try {
      spreadsheetId = ewExtractGoogleResourceId_(FormApp.openById(formId).getDestinationId());
    } catch (error) {
      ewThrow_(
        'PROCESS_FAILED',
        'Google Form의 응답 Spreadsheet를 확인할 수 없습니다. 폼 응답 저장 위치 또는 접근 권한을 확인해주세요.'
      );
    }
  }
  if (!spreadsheetId) {
    ewThrow_(
      'VALIDATION_FAILED',
      'Google Form ID 또는 응답 Spreadsheet ID를 먼저 연동해주세요.'
    );
  }

  var spreadsheet;
  try {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } catch (error) {
    ewThrow_(
      'PROCESS_FAILED',
      'Google Form 응답 Spreadsheet를 열 수 없습니다. ID와 Apps Script 실행 계정의 접근 권한을 확인해주세요.'
    );
  }
  return {
    googleFormId: formId,
    responseSpreadsheetId: spreadsheetId,
    sheet: ewSelectFormResponseSheet_(spreadsheet)
  };
}

function ewSelectFormResponseSheet_(spreadsheet) {
  var aliases = ewFormHeaderAliases_();
  var best = null;
  spreadsheet.getSheets().forEach(function (sheet) {
    var lastColumn = sheet.getLastColumn();
    if (!lastColumn) return;
    var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
    var score = 0;
    ['applied_at', 'student_id', 'name', 'phone', 'applicant_type'].forEach(function (field) {
      if (ewFindFormHeaderIndex_(headers, aliases[field]) >= 0) score += 1;
    });
    if (!best || score > best.score) best = { sheet: sheet, headers: headers, score: score };
  });
  if (!best ||
      ewFindFormHeaderIndex_(best.headers, aliases.student_id) < 0 ||
      ewFindFormHeaderIndex_(best.headers, aliases.name) < 0) {
    ewThrow_(
      'VALIDATION_FAILED',
      '응답 시트에서 필수 문항인 학번과 성명(또는 이름) 열을 찾을 수 없습니다.'
    );
  }
  return best.sheet;
}

function ewBuildFormResponseCandidates_(source, event) {
  var sheet = source.sheet;
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (!lastRow || !lastColumn) return { items: [], invalidRows: [] };
  var values = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  var headers = values[0].map(function (header) { return String(header || '').trim(); });
  var aliases = ewFormHeaderAliases_();
  var indexes = {};
  Object.keys(aliases).forEach(function (field) {
    indexes[field] = ewFindFormHeaderIndex_(headers, aliases[field]);
  });
  if (indexes.student_id < 0 || indexes.name < 0) {
    ewThrow_('VALIDATION_FAILED', '응답 시트에 학번과 성명(또는 이름) 열이 필요합니다.');
  }

  var recognizedIndexes = {};
  Object.keys(indexes).forEach(function (field) {
    if (indexes[field] >= 0) recognizedIndexes[indexes[field]] = true;
  });
  var result = [];
  var invalidRows = [];
  values.slice(1).forEach(function (row, index) {
    var responseRow = index + 2;
    if (!row.some(function (value) { return String(value || '').trim() !== ''; })) return;
    var studentId = ewFormResponseValue_(row, indexes.student_id);
    var name = ewFormResponseValue_(row, indexes.name);
    if (!studentId || !name) {
      invalidRows.push({ row: responseRow, reason: '학번 또는 성명 누락' });
      return;
    }
    var appliedAt = ewFormResponseValue_(row, indexes.applied_at) || ewNow_();
    var applicantType = ewNormalizeApplicantType_(
      ewFormResponseValue_(row, indexes.applicant_type)
    );
    var explicitResponseId = ewFormResponseValue_(row, indexes.source_response_id);
    var sourceResponseId = explicitResponseId || ewStableExternalId_([
      source.responseSpreadsheetId,
      sheet.getSheetId(),
      appliedAt,
      studentId,
      name
    ].join('|'));
    var explicitFee = ewFormResponseValue_(row, indexes.amount_due);
    var amountDue = explicitFee
      ? ewCellNumber_(explicitFee)
      : ewApplicantFee_(event, applicantType);
    var applicationId = Utilities.getUuid();
    var applicant = {
      application_id: applicationId,
      event_id: event.event_id,
      source_response_id: sourceResponseId,
      applied_at: appliedAt,
      student_id: studentId,
      name: name,
      major: ewFormResponseValue_(row, indexes.major),
      phone: ewFormResponseValue_(row, indexes.phone),
      applicant_type: applicantType,
      amount_due: amountDue,
      bank: ewFormResponseValue_(row, indexes.bank),
      account_number: ewFormResponseValue_(row, indexes.account_number),
      account_holder: ewFormResponseValue_(row, indexes.account_holder),
      approval_status: '대기',
      imported_at: ewNow_(),
      manager_id: event.manager || '',
      approved_at: '',
      student_card_file_id: ewExtractDriveFileIds_(
        ewFormResponseValue_(row, indexes.student_card_file_id)
      ),
      payment_capture_file_id: ewExtractDriveFileIds_(
        ewFormResponseValue_(row, indexes.payment_capture_file_id)
      )
    };
    var additionalAnswers = [];
    headers.forEach(function (header, columnIndex) {
      var answerValue = String(row[columnIndex] || '').trim();
      if (!header || !answerValue || recognizedIndexes[columnIndex]) return;
      additionalAnswers.push({
        additional_answer_id: Utilities.getUuid(),
        application_id: applicationId,
        question_id: ewStableExternalId_(source.googleFormId + '|' + header),
        question_title: header,
        answer_value: answerValue
      });
    });
    result.push({ applicant: applicant, additionalAnswers: additionalAnswers });
  });
  return { items: result, invalidRows: invalidRows };
}

function ewFormHeaderAliases_() {
  return {
    source_response_id: ['원본응답id', '응답id', 'responseid'],
    applied_at: ['타임스탬프', '응답일시', '제출일시', '신청일시', 'timestamp'],
    student_id: ['학번'],
    name: ['성명', '이름'],
    major: ['학과', '전공', '소속'],
    phone: ['연락처', '전화번호', '휴대폰번호', '휴대전화번호'],
    applicant_type: ['신청자구분', '학생회비납부여부', '회비납부여부', '납부자구분', '가입여부'],
    amount_due: ['적용참가비', '납부예정금액', '참가비'],
    bank: ['은행명', '은행'],
    account_number: ['계좌번호'],
    account_holder: ['예금주'],
    student_card_file_id: ['학생카드캡쳐', '학생카드캡처', '학생증캡쳐', '학생증캡처'],
    payment_capture_file_id: ['입금캡쳐', '입금캡처', '입금증빙', '송금증빙']
  };
}

function ewNormalizeFormHeader_(value) {
  return String(value || '').toLowerCase().replace(/[\s_\-()[\]{}.,:：?/\\]/g, '');
}

function ewFindFormHeaderIndex_(headers, aliases) {
  var normalizedHeaders = headers.map(ewNormalizeFormHeader_);
  var normalizedAliases = (aliases || []).map(ewNormalizeFormHeader_);
  var index;
  for (index = 0; index < normalizedHeaders.length; index += 1) {
    if (normalizedAliases.indexOf(normalizedHeaders[index]) >= 0) return index;
  }
  for (index = 0; index < normalizedHeaders.length; index += 1) {
    for (var aliasIndex = 0; aliasIndex < normalizedAliases.length; aliasIndex += 1) {
      if (normalizedHeaders[index].indexOf(normalizedAliases[aliasIndex]) >= 0) return index;
    }
  }
  return -1;
}

function ewFormResponseValue_(row, index) {
  return index >= 0 ? String(row[index] || '').trim() : '';
}

function ewExtractGoogleResourceId_(value) {
  var text = ewOptionalText_(value);
  if (!text) return '';
  var match = text.match(/[A-Za-z0-9_-]{20,}/);
  return match ? match[0] : text;
}

function ewStableExternalId_(value) {
  var digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value || ''),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

function ewExtractDriveFileIds_(value) {
  var text = ewOptionalText_(value);
  if (!text) return '';
  var matches = text.match(/[A-Za-z0-9_-]{20,}/g) || [];
  return ewUnique_(matches).join(',');
}

function ewNormalizeApplicantType_(value) {
  var text = ewOptionalText_(value);
  if (!text) return '';
  if (/(미납|비납부|미가입|비회원|아니오|아니요|no)/i.test(text)) return '비납부자';
  if (/(납부|가입|회원|예|네|yes)/i.test(text)) return '납부자';
  return text;
}

function ewApplicantFee_(event, applicantType) {
  if (!ewEventFeeEnabled_(event)) return 0;
  if (/(비납부|미납|비회원|미가입)/.test(String(applicantType || ''))) {
    return ewCellNumber_(event.non_member_fee_amount);
  }
  return ewCellNumber_(event.fee_amount);
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
    if (action === 'confirmDeposit') {
      var amountDue = ewCellNumber_(applicant.amount_due);
      if (amountDue <= 0) {
        ewThrow_('VALIDATION_FAILED', '확인할 참가비 금액이 없습니다.');
      }
      var currentDeposit = ewReadTable_('deposit').find(function (row) {
        return String(row.application_id) === String(id);
      });
      var depositValues = {
        application_id: id,
        amount_due: amountDue,
        amount_paid: amountDue,
        payment_date: ewToday_(),
        payment_status: '입금확인',
        manager_id: ewCurrentUserEmail_(),
        confirmed_at: ewNow_()
      };
      if (currentDeposit) {
        ewUpdateItem_('deposit', currentDeposit.deposit_id, depositValues);
      } else {
        depositValues.deposit_id = Utilities.getUuid();
        depositValues.depositor_name = '';
        ewAppendItems_('deposit', [depositValues]);
      }
      var paidApplicant = ewWithoutRowNumber_(applicant);
      paidApplicant.amount_paid = amountDue;
      paidApplicant.payment_status = '입금확인';
      paidApplicant.payment_date = depositValues.payment_date;
      return paidApplicant;
    }
    return ewWithoutRowNumber_(ewUpdateItem_('applicant', id, {
      approval_status: action === 'approve' ? '승인' : '반려',
      approved_at: action === 'approve' ? ewNow_() : ''
    }));
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
      applicant_type: applicant.applicant_type,
      amount_due: applicant.amount_due,
      amount_paid: applicant.amount_paid,
      confirmed_at: attendance.confirmed_at || '',
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
        attendance_status: status,
        confirmed_at: ewNow_(),
        attendance_checker: ewCurrentUserEmail_(),
        confirmation_method: '수동'
      };
      var current = ewFindById_('attendance', applicationId);
      if (!current) patch.attendance_id = Utilities.getUuid();
      return ewWithoutRowNumber_(current
        ? ewUpdateItem_('attendance', applicationId, patch)
        : ewAppendItem_('attendance', patch));
    });
  });
}

function ewGetRefundListData_(request) {
  var eventId = ewRequireId_(request);
  var applicantById = {};
  ewReadTable_('applicant').forEach(function (row) {
    if (String(row.event_id) === String(eventId)) {
      applicantById[String(row.application_id)] = row;
    }
  });
  var rows = ewReadTable_('refund').filter(function (row) {
    return Boolean(applicantById[String(row.application_id)]);
  }).map(function (row) {
    var result = ewWithoutRowNumber_(row);
    var applicant = applicantById[String(row.application_id)] || {};
    result.name = applicant.name || '';
    result.student_id = applicant.student_id || '';
    return result;
  });
  return ewPaginate_(rows, request);
}

function ewUnavailable_(message, details) {
  ewThrow_('PROCESS_FAILED', message, details || { status: '확인 필요' });
}
