/** 회계 장부 저장 서비스 */

// TODO(장부 권한): UserDB의 장부 권한 ID 확정 후 동작별 권한을 검사한다.

function saveLedgerEntry_(request, context) {
  var now = getCurrentIsoDateTime_();
  var item = {
    id: request.transaction_id || makeId_('TRX'),
    transactionAt: request.transaction_date || now,
    description: request.description || '',
    expense: request.transaction_type === '지출',
    amount: Number(request.amount || 0),
    balanceAfter: Number(request.balance_after || 0),
    counterparty: request.counterparty || '',
    source: request.source || '수기등록',
    eventId: request.event_id || '',
    businessType: request.business_type || '일반',
    businessId: request.business_id || '',
    matchStatus: request.match_status || '미확인',
    managerId: context.user && context.user.email ? context.user.email : getCurrentUserName_(),
    createdAt: now,
    updatedAt: now
  };
  insertLedgerRow_(item);
  var evidence = saveEvidenceFiles_(item.id, request.evidence_files || request.evidence || [], now);
  return { ok: true, evidence: evidence, item: getLedgerEntryDto_(item) };
}
