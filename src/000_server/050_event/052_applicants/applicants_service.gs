function processApplicantData_(request) {
  var id = requireEventRequestId_(request);
  var action = requireEventText_(request.action, 'action');
  var allowed = ['confirmDeposit', 'approve', 'reject'];
  if (allowed.indexOf(action) < 0) {
    throwEventError_('VALIDATION_FAILED', '지원하지 않는 신청자 처리 action입니다.', { allowed: allowed });
  }
  var actorEmail = String(readActiveUserEmailFromSession_() || '').trim();
  if (!actorEmail) throwEventError_('UNAUTHORIZED', '처리자 이메일을 확인할 수 없습니다.');
  return withOperationWriteLock_(function () {
    var applicant = findEventApplicationRowById_(id);
    if (!applicant) throwEventError_('NOT_FOUND', '신청자를 찾을 수 없습니다.');
    var patch = {};
    if (action === 'confirmDeposit') {
      throwEventError_('PROCESS_FAILED', '행사 입금 대조 규칙이 확정되지 않아 입금 확인을 처리할 수 없습니다.');
    } else if (action === 'approve') {
      patch.status = '승인';
      patch.processedAt = getCurrentIsoDateTime_();
    } else {
      patch.status = '반려';
      patch.processedAt = getCurrentIsoDateTime_();
    }
    patch.managerEmail = actorEmail;
    updateEventApplicationRowById_(id, patch);
    var after = withoutInternalRowNumber_(findEventApplicationRowById_(id));
    writeBusinessAudit_({
      actorEmail: actorEmail,
      actionType: action === 'approve' ? 'APPROVE' : 'REJECT',
      targetType: 'eventApplications',
      targetId: id,
      beforeValue: { status: String(applicant.status || '') },
      afterValue: { status: String(after.status || ''), processedAt: after.processedAt || '' },
      reason: action === 'approve' ? '행사 신청 승인' : '행사 신청 반려'
    });
    return after;
  });
}
