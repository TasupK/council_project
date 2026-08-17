// 1. 납부 처리용 Auth email 검증
function requireFeePaymentActorEmail_(context) {
  var email = String(context && context.email || '').trim();
  if (!email) throw new Error('actorEmail 값이 필요합니다.');
  return email;
}

function requireFeePaymentId_(request) {
  var id = String(request && (request.paymentId || request.id) || '').trim();
  if (!id) throw new Error('paymentId 값이 필요합니다.');
  return id;
}

// 2. 납부신청 승인/반려 처리
function processFeeApplicationsData_(request, context) {
  var source = request && typeof request === 'object' ? request : {};
  var ids = source.ids && source.ids.length ? source.ids : [];
  var action = String(source.action || '').trim().toUpperCase();
  var actorEmail = requireFeePaymentActorEmail_(context);
  if (!ids.length) throw new Error('처리할 납부신청 ID가 필요합니다.');
  if (action !== 'APPROVE' && action !== 'REJECT') throw new Error('알 수 없는 납부신청 처리 action입니다: ' + action);

  return ids.map(function (rawId) {
    var applicationId = String(rawId || '').trim();
    if (!applicationId) throw new Error('납부신청 ID가 비어 있습니다.');
    var before = findFeeApplicationRowById_(applicationId);
    if (!before) throw new Error('납부신청을 찾을 수 없습니다: ' + applicationId);
    if (String(before.status || '') !== '접수') {
      throw new Error('이미 처리된 납부신청입니다: ' + applicationId + ' (' + before.status + ')');
    }

    var existingPayment = findFeePaymentRowByApplicationId_(applicationId);
    if (existingPayment) throw new Error('이미 생성된 납부내역이 있습니다: ' + applicationId);

    var rate = null;
    if (action === 'APPROVE') rate = resolveStudentFeeRate_(before.paymentDate);

    var newStatus = action === 'APPROVE' ? '승인' : '반려';
    var applicationChanges = {
      status: newStatus,
      managerId: actorEmail,
      processedAt: getCurrentIsoDateTime_()
    };
    updateFeeApplicationRowById_(applicationId, applicationChanges);

    var afterApplication = {};
    Object.keys(before).forEach(function (key) { afterApplication[key] = before[key]; });
    Object.keys(applicationChanges).forEach(function (key) { afterApplication[key] = applicationChanges[key]; });
    delete afterApplication._rowNumber;

    writeStudentFeeAudit_(
      actorEmail,
      action === 'APPROVE' ? '승인' : '반려',
      'feeApplications',
      applicationId,
      String(before.status || ''),
      newStatus,
      source.reason || ''
    );

    var payment = null;
    if (action === 'APPROVE') {
      payment = {
        id: Utilities.getUuid(),
        applicationId: applicationId,
        amount: Number(rate.amountPerSemester),
        paymentDate: before.paymentDate,
        depositorName: '',
        moneyStatus: '대기',
        managerId: actorEmail,
        confirmedAt: ''
      };
      insertFeePaymentRow_(payment);
      writeStudentFeeAudit_(actorEmail, '생성', 'feePayments', payment.id, '', JSON.stringify(payment), '납부신청 승인에 따른 자동 생성');
    }

    return { id: applicationId, success: true, application: afterApplication, payment: payment };
  });
}

// 3. 납부 입금 확인 처리
function confirmFeePaymentData_(request, context) {
  var paymentId = requireFeePaymentId_(request);
  var actorEmail = requireFeePaymentActorEmail_(context);
  var result = String(request && request.result || '').trim().toUpperCase();
  if (result !== 'DONE' && result !== 'MISMATCH') throw new Error('알 수 없는 납부 확인 result입니다: ' + result);

  var before = findFeePaymentRowById_(paymentId);
  if (!before) throw new Error('납부내역을 찾을 수 없습니다: ' + paymentId);
  if (String(before.moneyStatus || '') !== '대기') throw new Error('대기 상태의 납부내역만 확인할 수 있습니다.');

  var changes = {
    moneyStatus: result === 'DONE' ? '완료' : '불일치',
    managerId: actorEmail,
    confirmedAt: getCurrentIsoDateTime_()
  };
  if (request && Object.prototype.hasOwnProperty.call(request, 'depositorName')) {
    changes.depositorName = String(request.depositorName || '').trim();
  }
  updateFeePaymentRowById_(paymentId, changes);

  var after = {};
  Object.keys(before).forEach(function (key) { after[key] = before[key]; });
  Object.keys(changes).forEach(function (key) { after[key] = changes[key]; });
  delete after._rowNumber;

  writeStudentFeeAudit_(actorEmail, '입금확인', 'feePayments', paymentId, String(before.moneyStatus || ''), changes.moneyStatus, request && request.reason || '');
  return after;
}
