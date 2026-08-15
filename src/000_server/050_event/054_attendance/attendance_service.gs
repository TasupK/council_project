function applyAttendanceChangesData_(request) {
  var eventId = requireEventRequestId_(request);
  var items = request.payload && Array.isArray(request.payload.items)
    ? request.payload.items
    : (Array.isArray(request.items) ? request.items : []);
  if (!items.length) throwEventError_('VALIDATION_FAILED', '적용할 출석 변경사항이 없습니다.');
  var allowed = EVENT_ATTENDANCE_STATUSES;
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
        managerId: getActiveUserEmailFromSession_(),
        method: 'manual'
      };
      var current = findEventAttendanceByApplicationId_(applicationId);
      if (current) {
        updateEventAttendanceRowById_(current.id, patch);
        return withoutInternalRowNumber_(findEventAttendanceRowById_(current.id));
      }
      patch.id = Utilities.getUuid();
      insertEventAttendanceRow_(patch);
      return withoutInternalRowNumber_(patch);
    });
  });
}

function findEventAttendanceByApplicationId_(applicationId) {
  return findAllEventAttendanceClientRows_().filter(function (item) {
    return String(item.applicationId) === String(applicationId);
  })[0] || null;
}
