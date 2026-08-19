function applyAttendanceChangesData_(request) {
  var eventId = requireEventRequestId_(request);
  var items = request.payload && Array.isArray(request.payload.items)
    ? request.payload.items
    : (Array.isArray(request.items) ? request.items : []);
  if (!items.length) throwEventError_('VALIDATION_FAILED', '적용할 출석 변경사항이 없습니다.');
  var allowed = EVENT_ATTENDANCE_STATUSES;
  var actorEmail = String(readActiveUserEmailFromSession_() || '').trim();
  if (!actorEmail) throwEventError_('UNAUTHORIZED', '처리자 이메일을 확인할 수 없습니다.');
  return withOperationWriteLock_(function () {
    return items.map(function (item) {
      var applicationId = requireEventText_(item.applicationId, 'applicationId');
      var applicant = findEventApplicationRowById_(applicationId);
      if (!applicant) throwEventError_('NOT_FOUND', '신청자를 찾을 수 없습니다: ' + applicationId);
      if (String(applicant.eventId) !== String(eventId)) {
        throwEventError_('VALIDATION_FAILED', '다른 행사의 출석 정보는 변경할 수 없습니다: ' + applicationId);
      }
      var status = requireEventText_(item.status, 'status');
      validateEventChoice_(status, allowed, 'status');
      var patch = {
        applicationId: applicationId,
        confirmedAt: item.confirmedAt || getCurrentIsoDateTime_(),
        status: status,
        managerEmail: actorEmail,
        method: 'manual'
      };
      var current = findEventAttendanceRowByApplicationId_(applicationId);
      var before = current ? withoutInternalRowNumber_(current) : null;
      var after;
      if (current) {
        updateEventAttendanceRowById_(current.id, patch);
        after = withoutInternalRowNumber_(findEventAttendanceRowById_(current.id));
      } else {
        patch.id = Utilities.getUuid();
        insertEventAttendanceRow_(patch);
        after = withoutInternalRowNumber_(patch);
      }
      writeBusinessAudit_({
        actorEmail: actorEmail,
        actionType: 'CONFIRM',
        targetType: 'eventAttendance',
        targetId: after.id,
        beforeValue: before,
        afterValue: after,
        reason: '행사 출석 확인'
      });
      return after;
    });
  });
}
