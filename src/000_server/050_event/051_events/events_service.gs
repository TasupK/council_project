// 행사 생성, 수정, 상태 변경
function createEventData_(request, context) {
  var source = request.payload && typeof request.payload === 'object' ? request.payload : {};
  var payload = buildEventPayload_(source, true);
  payload.managerEmail = String(context && context.email || readActiveUserEmailFromSession_() || '').trim();
  if (!payload.managerEmail) throwEventError_('UNAUTHORIZED', '담당자 이메일을 확인할 수 없습니다.');
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
