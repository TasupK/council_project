// 행사 생성, 수정, 상태 변경
function createEventData_(request, context) {
  var source = request.payload && typeof request.payload === 'object' ? request.payload : {};
  var payload = buildEventPayload_(source, true);
  payload.managerEmail = String(context && context.email || readActiveUserEmailFromSession_() || '').trim();
  if (!payload.managerEmail) throwEventError_('UNAUTHORIZED', '담당자 이메일을 확인할 수 없습니다.');
  return withOperationWriteLock_(function () {
    payload.id = buildNextEventId_(payload.category, payload.eventStartAt);
    if (findEventRowById_(payload.id)) {
      throwEventError_('CONFLICT', '이미 존재하는 행사ID입니다: ' + payload.id);
    }
    payload.refundEnabled = false;
    payload.fullRefundPolicy = '없음';
    payload.createdAt = getCurrentIsoDateTime_();
    payload.updatedAt = payload.createdAt;
    payload.evidenceFolderId = resolveEventMaterialFolder_().getId();
    if (source.relatedMaterialFile) {
      uploadEventRelatedMaterial_(source.relatedMaterialFile, payload.id);
    }
    insertEventRow_(payload);
    var after = withoutInternalRowNumber_(payload);
    writeBusinessAudit_({
      actorEmail: payload.managerEmail,
      actionType: 'CREATE',
      targetType: 'events',
      targetId: payload.id,
      beforeValue: null,
      afterValue: after,
      reason: '행사 생성'
    });
    return after;
  });
}

// 행사 시작연도와 유형별 마지막 순번을 기준으로 신규 행사ID를 발급한다.
function buildNextEventId_(category, eventStartAt) {
  var categoryCode = EVENT_CATEGORY_CODES[category];
  var eventYear = String(eventStartAt || '').slice(0, 4);
  var prefix;
  var highestSequence = 0;

  if (!categoryCode || !/^\d{4}$/.test(eventYear)) {
    throwEventError_('VALIDATION_FAILED', '행사ID를 생성할 유형과 시작일이 올바르지 않습니다.');
  }

  prefix = 'EVT-' + eventYear + '-' + categoryCode + '-';
  listEventRows_().forEach(function (row) {
    var id = String(row.id || '').trim();
    var match = id.match(new RegExp('^' + prefix + '(\\d{3})$'));
    var sequence;
    if (!match) return;
    sequence = Number(match[1]);
    if (sequence > highestSequence) highestSequence = sequence;
  });

  if (highestSequence >= 999) {
    throwEventError_('CONFLICT', eventYear + '년 ' + category + ' 행사ID 순번을 더 이상 발급할 수 없습니다.');
  }
  return prefix + formatEventSequence_(highestSequence + 1);
}

function formatEventSequence_(sequence) {
  var text = String(sequence);
  while (text.length < 3) text = '0' + text;
  return text;
}

function updateEventData_(request, context) {
  var id = requireEventRequestId_(request);
  var source = request.payload && typeof request.payload === 'object' ? request.payload : {};
  var patch = buildEventPayload_(source, false);
  patch.managerEmail = String(context && context.email || readActiveUserEmailFromSession_() || '').trim();
  if (!patch.managerEmail) throwEventError_('UNAUTHORIZED', '담당자 이메일을 확인할 수 없습니다.');
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
    var before = withoutInternalRowNumber_(findEventRowById_(id));
    updateEventRowById_(id, patch);
    var after = withoutInternalRowNumber_(findEventRowById_(id));
    writeBusinessAudit_({
      actorEmail: patch.managerEmail,
      actionType: 'UPDATE',
      targetType: 'events',
      targetId: id,
      beforeValue: before,
      afterValue: after,
      reason: '행사 수정'
    });
    return after;
  });
}

function updateEventStatusData_(request) {
  var id = requireEventRequestId_(request);
  var payload = request.payload && typeof request.payload === 'object' ? request.payload : request;
  var status = requireEventText_(payload.status, 'status');
  validateEventChoice_(status, EVENT_STATUSES, 'status');
  var actorEmail = String(readActiveUserEmailFromSession_() || '').trim();
  if (!actorEmail) throwEventError_('UNAUTHORIZED', '처리자 이메일을 확인할 수 없습니다.');
  return withOperationWriteLock_(function () {
    var beforeRow = findEventRowById_(id);
    if (!beforeRow) throwEventError_('NOT_FOUND', '행사를 찾을 수 없습니다.');
    var before = withoutInternalRowNumber_(beforeRow);
    updateEventRowById_(id, { status: status });
    var after = withoutInternalRowNumber_(findEventRowById_(id));
    writeBusinessAudit_({
      actorEmail: actorEmail,
      actionType: 'UPDATE',
      targetType: 'events',
      targetId: id,
      beforeValue: before,
      afterValue: after,
      reason: '행사 진행상태 변경'
    });
    return after;
  });
}

function updateEventClosureData_(request) {
  var id = requireEventRequestId_(request);
  var actorEmail = String(readActiveUserEmailFromSession_() || '').trim();
  if (!actorEmail) throwEventError_('UNAUTHORIZED', '처리자 이메일을 확인할 수 없습니다.');
  return withOperationWriteLock_(function () {
    var beforeRow = findEventRowById_(id);
    if (!beforeRow) throwEventError_('NOT_FOUND', '행사를 찾을 수 없습니다.');
    var before = withoutInternalRowNumber_(beforeRow);
    updateEventRowById_(id, { status: '종료' });
    var after = withoutInternalRowNumber_(findEventRowById_(id));
    writeBusinessAudit_({
      actorEmail: actorEmail,
      actionType: 'UPDATE',
      targetType: 'events',
      targetId: id,
      beforeValue: before,
      afterValue: after,
      reason: '행사 종료'
    });
    return after;
  });
}
