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

function requireFeeApplicationSemesterCount_(application) {
  var count = Number(application && application.semesterCount);
  if (!isFinite(count) || Math.floor(count) !== count || count < 1 || count > 8) {
    throw new Error('적용학기수는 1~8 범위의 정수여야 합니다.');
  }
  return count;
}

// 2. 납부신청 승인/반려 처리
function processFeeApplicationsData_(request, context) {
  var source = request && typeof request === 'object' ? request : {};
  var ids = source.ids && source.ids.length ? source.ids : [];
  var action = String(source.action || '').trim().toUpperCase();
  var actorEmail = requireFeePaymentActorEmail_(context);
  if (!ids.length) throw new Error('처리할 납부신청 ID가 필요합니다.');
  if (action !== 'APPROVE' && action !== 'REJECT') throw new Error('알 수 없는 납부신청 처리 action입니다: ' + action);

  return withOperationWriteLock_(function () {
    var plans = ids.map(function (rawId) {
      var applicationId = String(rawId || '').trim();
      if (!applicationId) throw new Error('납부신청 ID가 비어 있습니다.');
      var before = findFeeApplicationRowById_(applicationId);
      if (!before) throw new Error('납부신청을 찾을 수 없습니다: ' + applicationId);
      if (String(before.status || '') !== '접수') {
        throw new Error('이미 처리된 납부신청입니다: ' + applicationId + ' (' + before.status + ')');
      }
      var existingPayment = findFeePaymentRowByApplicationId_(applicationId);
      if (existingPayment) throw new Error('이미 생성된 납부내역이 있습니다: ' + applicationId);
      return {
        applicationId: applicationId,
        before: before,
        semesterCount: action === 'APPROVE' ? requireFeeApplicationSemesterCount_(before) : null,
        rate: action === 'APPROVE' ? resolveStudentFeeRate_(before.paymentDate) : null
      };
    });

    var processedAt = getCurrentIsoDateTime_();
    return plans.map(function (plan) {
      var newStatus = action === 'APPROVE' ? '승인' : '반려';
      var applicationChanges = {
        status: newStatus,
        managerEmail: actorEmail,
        processedAt: processedAt
      };
      updateFeeApplicationRowById_(plan.applicationId, applicationChanges);

      var afterApplication = {};
      Object.keys(plan.before).forEach(function (key) { afterApplication[key] = plan.before[key]; });
      Object.keys(applicationChanges).forEach(function (key) { afterApplication[key] = applicationChanges[key]; });
      delete afterApplication._rowNumber;

      writeStudentFeeAudit_(
        actorEmail,
        action,
        'feeApplications',
        plan.applicationId,
        { status: String(plan.before.status || '') },
        { status: newStatus },
        source.reason || ''
      );

      var payment = null;
      if (action === 'APPROVE') {
        payment = {
          id: Utilities.getUuid(),
          applicationId: plan.applicationId,
          amount: Number(plan.rate.amountPerSemester) * plan.semesterCount,
          paymentDate: plan.before.paymentDate,
          depositorName: '',
          moneyStatus: '대기',
          managerEmail: actorEmail,
          confirmedAt: ''
        };
        insertFeePaymentRow_(payment);
        writeStudentFeeAudit_(actorEmail, 'CREATE', 'feePayments', payment.id, null, payment, '납부신청 승인에 따른 자동 생성');
      }

      return { id: plan.applicationId, success: true, application: afterApplication, payment: payment };
    });
  });
}

// 3. 납부 입금 확인 처리
function confirmFeePaymentData_(request, context) {
  var paymentId = requireFeePaymentId_(request);
  var actorEmail = requireFeePaymentActorEmail_(context);
  var result = String(request && request.result || '').trim().toUpperCase();
  if (result !== 'DONE' && result !== 'MISMATCH') throw new Error('알 수 없는 납부 확인 result입니다: ' + result);

  return withOperationWriteLock_(function () {
    var before = findFeePaymentRowById_(paymentId);
    if (!before) throw new Error('납부내역을 찾을 수 없습니다: ' + paymentId);
    if (String(before.moneyStatus || '') !== '대기') throw new Error('대기 상태의 납부내역만 확인할 수 있습니다.');

    var changes = {
      moneyStatus: result === 'DONE' ? '완료' : '불일치',
      managerEmail: actorEmail,
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

    writeStudentFeeAudit_(actorEmail, 'CONFIRM', 'feePayments', paymentId, { moneyStatus: String(before.moneyStatus || '') }, { moneyStatus: changes.moneyStatus }, request && request.reason || '');
    return after;
  });
}
