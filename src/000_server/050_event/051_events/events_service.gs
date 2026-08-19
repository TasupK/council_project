// 행사 생성, 수정, 상태 변경
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
    payload.evidenceFolderId = resolveEventMaterialFolder_().getId();
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

function updateEventClosureData_(request) {
  var id = requireEventRequestId_(request);
  return withOperationWriteLock_(function () {
    updateEventRowById_(id, { status: '종료' });
    return withoutInternalRowNumber_(findEventRowById_(id));
  });
}
