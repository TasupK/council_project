// 행사 입금 mutation 업무 규칙.

function resolveEventPaymentActorEmail_(context) {
  return String(
    context && (context.email || (context.user && context.user.email)) ||
    readActiveUserEmailFromSession_() ||
    ''
  ).trim();
}

function parseEventPaymentPositiveAmount_(value) {
  var amount = Number(value);
  if (!isFinite(amount) || amount <= 0) {
    throwEventError_('VALIDATION_FAILED', '실제입금액은 0보다 큰 숫자여야 합니다.');
  }
  return amount;
}

function normalizeEventPaymentStatus_(value) {
  var status = String(value || '확인').trim();
  if (!status) status = '확인';
  return status;
}

function createEventPaymentData_(request, context) {
  request = request || {};
  var applicationId = String(request.applicationId || request.application_id || '').trim();
  if (!applicationId) throwEventError_('VALIDATION_FAILED', '신청ID가 필요합니다.');
  var application = findEventApplicationRowById_(applicationId);
  if (!application) throwEventError_('NOT_FOUND', '행사 신청을 찾을 수 없습니다.');
  var paymentDate = String(request.paymentDate || request.payment_date || '').trim();
  if (!paymentDate) throwEventError_('VALIDATION_FAILED', '입금일이 필요합니다.');
  var actorEmail = resolveEventPaymentActorEmail_(context);
  if (!actorEmail) throwEventError_('UNAUTHORIZED', '담당자 이메일을 확인할 수 없습니다.');
  var now = getCurrentIsoDateTime_();
  var item = {
    id: Utilities.getUuid(),
    applicationId: applicationId,
    paidAmount: parseEventPaymentPositiveAmount_(request.paidAmount == null ? request.paid_amount : request.paidAmount),
    paymentDate: paymentDate,
    depositorName: String(request.depositorName || request.depositor_name || '').trim(),
    moneyStatus: normalizeEventPaymentStatus_(request.moneyStatus || request.money_status),
    managerEmail: actorEmail,
    confirmedAt: now
  };

  return withOperationWriteLock_(function () {
    insertEventPaymentRow_(item);
    var after = withoutInternalRowNumber_(item);
    writeBusinessAudit_({
      actorEmail: actorEmail,
      actionType: 'CREATE',
      targetType: 'eventPayments',
      targetId: item.id,
      beforeValue: null,
      afterValue: after,
      reason: '행사 입금 확인'
    });
    return after;
  });
}

function updateEventPaymentData_(request, context) {
  request = request || {};
  var id = String(request.id || request.paymentId || request.payment_id || '').trim();
  if (!id) throwEventError_('VALIDATION_FAILED', '행사입금ID가 필요합니다.');
  var actorEmail = resolveEventPaymentActorEmail_(context);
  if (!actorEmail) throwEventError_('UNAUTHORIZED', '담당자 이메일을 확인할 수 없습니다.');

  return withOperationWriteLock_(function () {
    var beforeRow = findEventPaymentRowById_(id);
    if (!beforeRow) throwEventError_('NOT_FOUND', '행사 입금 내역을 찾을 수 없습니다.');
    var before = withoutInternalRowNumber_(beforeRow);
    var patch = { managerEmail: actorEmail };
    if (request.paidAmount != null || request.paid_amount != null) {
      patch.paidAmount = parseEventPaymentPositiveAmount_(request.paidAmount == null ? request.paid_amount : request.paidAmount);
    }
    if (request.paymentDate != null || request.payment_date != null) {
      var paymentDate = String(request.paymentDate == null ? request.payment_date : request.paymentDate).trim();
      if (!paymentDate) throwEventError_('VALIDATION_FAILED', '입금일은 비울 수 없습니다.');
      patch.paymentDate = paymentDate;
    }
    if (request.depositorName != null || request.depositor_name != null) {
      patch.depositorName = String(request.depositorName == null ? request.depositor_name : request.depositorName).trim();
    }
    if (request.moneyStatus != null || request.money_status != null) {
      patch.moneyStatus = normalizeEventPaymentStatus_(request.moneyStatus == null ? request.money_status : request.moneyStatus);
    }
    updateEventPaymentRowById_(id, patch);
    var after = withoutInternalRowNumber_(findEventPaymentRowById_(id));
    writeBusinessAudit_({
      actorEmail: actorEmail,
      actionType: 'UPDATE',
      targetType: 'eventPayments',
      targetId: id,
      beforeValue: before,
      afterValue: after,
      reason: '행사 입금 정보 수정'
    });
    return after;
  });
}
