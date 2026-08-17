/** 수입지출원장 mutation/business service */

function saveLedgerEntry_(request, context, recordStatus) {
  request = request || {};
  var now = getCurrentIsoDateTime_();
  var actor = getAccountingActorEmail_(context);
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
    recordStatus: recordStatus || 'ACTIVE',
    managerId: actor,
    createdAt: now,
    updatedAt: now
  };
  insertLedgerRow_(item);
  var evidence = saveEvidenceFiles_(item.id, request.evidence_files || request.evidence || [], now);
  writeAccountingAudit_(actor, 'CREATE', 'LEDGER', item.id, '', JSON.stringify(item), item.recordStatus === 'DRAFT' ? '임시저장' : '원장 등록');
  return { ok: true, evidence: evidence, item: getLedgerEntryDto_(item) };
}

function saveLedgerDraft_(request, context) {
  return saveLedgerEntry_(request || {}, context, 'DRAFT');
}

function updateLedgerEntry_(input, context) {
  input = input || {};
  if (!input.transaction_id) throw new Error('transaction_id is required.');
  var before = findLedgerRowById_(input.transaction_id);
  if (!before || String(before.recordStatus || 'ACTIVE') === 'DELETED') throw new Error('원장 거래를 찾을 수 없습니다.');
  var now = getCurrentIsoDateTime_();
  var changes = {
    transactionAt: input.transaction_date || before.transactionAt,
    description: input.description == null ? before.description : input.description,
    expense: input.transaction_type ? input.transaction_type === '지출' : isTruthyValue_(before.expense),
    amount: input.amount == null ? Number(before.amount || 0) : Number(input.amount || 0),
    balanceAfter: input.balance_after == null ? Number(before.balanceAfter || 0) : Number(input.balance_after || 0),
    counterparty: input.counterparty == null ? before.counterparty : input.counterparty,
    eventId: input.event_id == null ? before.eventId : input.event_id,
    businessType: input.business_type == null ? before.businessType : input.business_type,
    businessId: input.business_id == null ? before.businessId : input.business_id,
    matchStatus: input.match_status == null ? before.matchStatus : input.match_status,
    recordStatus: input.record_status || before.recordStatus || 'ACTIVE',
    updatedAt: now
  };
  updateLedgerRowById_(input.transaction_id, changes);
  var actor = getAccountingActorEmail_(context);
  writeAccountingAudit_(actor, 'UPDATE', 'LEDGER', input.transaction_id, JSON.stringify(before), JSON.stringify(changes), input.reason || '원장 수정');
  return { ok: true, item: findLedgerEntryDtoById_(input.transaction_id) || getLedgerEntryDto_(Object.assign({}, before, changes)) };
}

function softDeleteLedgerEntry_(input, context) {
  input = input || {};
  if (!input.transaction_id) throw new Error('transaction_id is required.');
  var before = findLedgerRowById_(input.transaction_id);
  if (!before) throw new Error('원장 거래를 찾을 수 없습니다.');
  var changes = { recordStatus: 'DELETED', updatedAt: getCurrentIsoDateTime_() };
  updateLedgerRowById_(input.transaction_id, changes);
  var actor = getAccountingActorEmail_(context);
  writeAccountingAudit_(actor, 'DELETE', 'LEDGER', input.transaction_id, JSON.stringify(before), JSON.stringify(changes), input.reason || '원장 soft delete');
  return { ok: true, transaction_id: input.transaction_id };
}

function processLedgerEntry_(input, context) {
  input = input || {};
  if (!input.transaction_id) throw new Error('transaction_id is required.');
  var before = findLedgerRowById_(input.transaction_id);
  if (!before || String(before.recordStatus || 'ACTIVE') === 'DELETED') throw new Error('원장 거래를 찾을 수 없습니다.');
  var status = input.action === 'approve' ? '정상' : '확인필요';
  var changes = { matchStatus: status, recordStatus: before.recordStatus || 'ACTIVE', updatedAt: getCurrentIsoDateTime_() };
  updateLedgerRowById_(input.transaction_id, changes);
  writeAccountingAudit_(getAccountingActorEmail_(context), 'PROCESS', 'LEDGER', input.transaction_id, JSON.stringify(before), JSON.stringify(changes), input.reason || status);
  return { ok: true, transaction_id: input.transaction_id, status: status, item: findLedgerEntryDtoById_(input.transaction_id) };
}
