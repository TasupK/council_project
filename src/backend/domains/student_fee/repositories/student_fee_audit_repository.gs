// Student Fee 업무감사로그 compatibility wrapper
function writeStudentFeeAudit_(actorEmail, actionType, targetType, targetId, beforeValue, afterValue, reason) {
  return writeBusinessAudit_({
    actorEmail: actorEmail,
    actionType: actionType,
    targetType: targetType,
    targetId: targetId,
    beforeValue: beforeValue,
    afterValue: afterValue,
    reason: reason
  });
}
