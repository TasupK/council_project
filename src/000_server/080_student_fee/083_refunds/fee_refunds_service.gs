// 1. 환불신청 승인/반려 처리
function processFeeRefundRequestsData_(request, context) {
  var source = request && typeof request === 'object' ? request : {};
  var ids = source.ids && source.ids.length ? source.ids : [];
  var action = String(source.action || '').trim().toUpperCase();
  var actorEmail = requireStudentFeeText_(context && context.email, 'actorEmail');
  var hasApprovedAmount = Object.prototype.hasOwnProperty.call(source, 'approvedAmount') && source.approvedAmount !== '' && source.approvedAmount != null;

  if (!ids.length) throw new Error('처리할 환불신청 ID가 필요합니다.');
  if (action !== 'APPROVE' && action !== 'REJECT') throw new Error('알 수 없는 환불신청 처리 action입니다: ' + action);
  if (action === 'APPROVE' && hasApprovedAmount && ids.length > 1) {
    throw new Error('여러 환불신청을 승인할 때 단일 approvedAmount를 공통 적용할 수 없습니다.');
  }

  return ids.map(function (rawId) {
    var requestId = String(rawId || '').trim();
    if (!requestId) throw new Error('환불신청 ID가 비어 있습니다.');
    var before = findFeeRefundRequestRowById_(requestId);
    if (!before) throw new Error('환불신청을 찾을 수 없습니다: ' + requestId);
    if (String(before.status || '') !== '접수') {
      throw new Error('이미 처리된 환불신청입니다: ' + requestId + ' (' + before.status + ')');
    }
    if (findFeeRefundRowByRequestId_(requestId)) {
      throw new Error('이미 생성된 환불내역이 있습니다: ' + requestId);
    }

    var approvedAmount = null;
    if (action === 'APPROVE') {
      var maximum = calculateRefundableAmount_(before.paymentId);
      if (!(maximum > 0)) throw new Error('환불 가능한 금액이 없습니다: ' + requestId);
      approvedAmount = hasApprovedAmount
        ? parseStudentFeeAmount_(source.approvedAmount, 'approvedAmount', 1)
        : maximum;
      if (approvedAmount > maximum) {
        throw new Error('승인금액이 최대 환불 가능액을 초과합니다: ' + maximum);
      }
    }

    var newStatus = action === 'APPROVE' ? '승인' : '반려';
    var requestChanges = {
      status: newStatus,
      managerId: actorEmail,
      processedAt: getCurrentIsoDateTime_()
    };
    updateFeeRefundRequestRowById_(requestId, requestChanges);

    var afterRequest = {};
    Object.keys(before).forEach(function (key) { afterRequest[key] = before[key]; });
    Object.keys(requestChanges).forEach(function (key) { afterRequest[key] = requestChanges[key]; });
    delete afterRequest._rowNumber;

    writeStudentFeeAudit_(
      actorEmail,
      action === 'APPROVE' ? '승인' : '반려',
      'feeRefundRequests',
      requestId,
      String(before.status || ''),
      newStatus,
      source.reason || ''
    );

    var refund = null;
    if (action === 'APPROVE') {
      refund = {
        id: Utilities.getUuid(),
        requestId: requestId,
        approvedAmount: approvedAmount,
        transferDate: '',
        moneyStatus: '대기',
        managerId: actorEmail,
        transferEvidenceId: '',
        createdAt: getCurrentIsoDateTime_()
      };
      insertFeeRefundRow_(refund);
      writeStudentFeeAudit_(actorEmail, '생성', 'feeRefunds', refund.id, '', JSON.stringify(refund), '환불신청 승인에 따른 자동 생성');
    }

    return { id: requestId, success: true, request: afterRequest, refund: refund };
  });
}

// 2. 환불 송금 확인 처리
function confirmFeeRefundData_(request, context) {
  var refundId = requireStudentFeeId_(request, ['refundId', 'id']);
  var actorEmail = requireStudentFeeText_(context && context.email, 'actorEmail');
  var result = String(request && request.result || '').trim().toUpperCase();
  if (result !== 'DONE' && result !== 'FAILED') throw new Error('알 수 없는 환불 확인 result입니다: ' + result);

  var before = findFeeRefundRowById_(refundId);
  if (!before) throw new Error('환불내역을 찾을 수 없습니다: ' + refundId);
  if (String(before.moneyStatus || '') !== '대기') throw new Error('대기 상태의 환불내역만 확인할 수 있습니다.');

  var transferDate = String(request && request.transferDate || '').trim().slice(0, 10);
  if (!transferDate) transferDate = String(getCurrentIsoDateTime_()).slice(0, 10);
  var changes = {
    transferDate: transferDate,
    moneyStatus: result === 'DONE' ? '완료' : '실패',
    managerId: actorEmail
  };
  if (request && Object.prototype.hasOwnProperty.call(request, 'transferEvidenceId')) {
    changes.transferEvidenceId = String(request.transferEvidenceId || '').trim();
  }
  updateFeeRefundRowById_(refundId, changes);

  var after = {};
  Object.keys(before).forEach(function (key) { after[key] = before[key]; });
  Object.keys(changes).forEach(function (key) { after[key] = changes[key]; });
  delete after._rowNumber;

  writeStudentFeeAudit_(actorEmail, '송금확인', 'feeRefunds', refundId, String(before.moneyStatus || ''), changes.moneyStatus, request && request.reason || '');
  return after;
}
