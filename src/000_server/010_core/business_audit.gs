var BUSINESS_AUDIT_ACTIONS_ = [
  'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'CONFIRM',
  'IMPORT', 'EXPORT', 'SYNC', 'VALIDATE', 'RECONCILE', 'SETTLE'
];

function serializeBusinessAuditValue_(value) {
  return JSON.stringify(value === undefined ? null : value);
}

function assertBusinessAuditAction_(actionType) {
  var action = String(actionType == null ? '' : actionType).trim();
  if (BUSINESS_AUDIT_ACTIONS_.indexOf(action) < 0) {
    throw new Error('지원하지 않는 감사 행위입니다: ' + action);
  }
  return action;
}

function assertBusinessAuditTarget_(targetType) {
  var target = String(targetType == null ? '' : targetType).trim();
  var schema = getOperationDbSchema_();
  if (!target || target === 'businessAuditLogs' || !Object.prototype.hasOwnProperty.call(schema, target)) {
    throw new Error('지원하지 않는 감사 대상입니다: ' + target);
  }
  return target;
}

function writeBusinessAudit_(event) {
  event = event || {};
  var actorEmail = String(event.actorEmail || '').trim();
  if (!actorEmail) throw new Error('감사로그 처리자 이메일이 필요합니다.');

  var actionType = assertBusinessAuditAction_(event.actionType);
  var targetType = assertBusinessAuditTarget_(event.targetType);
  var targetId = String(event.targetId == null ? '' : event.targetId).trim();

  return appendOperationTableRow_('businessAuditLogs', {
    id: Utilities.getUuid(),
    occurredAt: getCurrentIsoDateTime_(),
    actorEmail: actorEmail,
    actionType: actionType,
    targetType: targetType,
    targetId: targetId,
    beforeValue: serializeBusinessAuditValue_(event.beforeValue),
    afterValue: serializeBusinessAuditValue_(event.afterValue),
    reason: String(event.reason == null ? '' : event.reason)
  });
}
