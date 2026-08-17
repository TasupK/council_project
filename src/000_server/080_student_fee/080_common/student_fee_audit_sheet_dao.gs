// 1. Student Fee 업무감사로그 행 저장
function insertStudentFeeAuditRow_(row) {
  return appendOperationTableRow_('businessAuditLogs', row);
}

// 2. Student Fee 업무감사로그 기록
function writeStudentFeeAudit_(actorEmail, actionType, targetType, targetId, beforeValue, afterValue, reason) {
  return insertStudentFeeAuditRow_({
    id: Utilities.getUuid(),
    occurredAt: getCurrentIsoDateTime_(),
    actorEmail: String(actorEmail || ''),
    actionType: String(actionType || ''),
    targetType: String(targetType || ''),
    targetId: String(targetId || ''),
    beforeValue: beforeValue == null ? '' : String(beforeValue),
    afterValue: afterValue == null ? '' : String(afterValue),
    reason: reason == null ? '' : String(reason)
  });
}
