/** Accounting 업무감사로그 저장 */

function insertAccountingAuditRow_(row) {
  return appendOperationTableRow_('businessAuditLogs', row);
}

function writeAccountingAudit_(actorEmail, actionType, targetType, targetId, beforeValue, afterValue, reason) {
  return insertAccountingAuditRow_({
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
