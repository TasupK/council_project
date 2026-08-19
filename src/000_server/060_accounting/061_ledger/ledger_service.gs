/** 수입지출원장 mutation/business service */

function normalizeLedgerTransactionType_(value) {
  var type = String(value == null ? '' : value).trim();
  if (type !== '수입' && type !== '지출') {
    throw new Error('거래유형(transaction_type)은 수입 또는 지출이어야 합니다.');
  }
  return type;
}

function parseLedgerPositiveAmount_(value) {
  var amount = Number(value);
  if (!isFinite(amount) || amount <= 0) {
    throw new Error('거래금액(amount)은 0보다 큰 유한한 숫자여야 합니다.');
  }
  return amount;
}

function parseLedgerInformationalBalance_(value, fallback) {
  if (value == null || value === '') return Number(fallback || 0);
  var balance = Number(value);
  if (!isFinite(balance)) throw new Error('잔액(balance_after)은 유한한 숫자여야 합니다.');
  return balance;
}

function createLedgerEntryData_(request, context, recordStatus) {
  request = request || {};
  var now = getCurrentIsoDateTime_();
  var actor = resolveAccountingActorEmail_(context);
  var transactionType = normalizeLedgerTransactionType_(request.transaction_type);
  var item = {
    id: request.transaction_id || generateAccountingId_('TRX'),
    transactionAt: request.transaction_date || now,
    description: request.description || '',
    expense: transactionType === '지출',
    amount: parseLedgerPositiveAmount_(request.amount),
    // 화면 호환용 정보값일 뿐, 집계/결산은 amount와 transaction type으로 계산한다.
    balanceAfter: parseLedgerInformationalBalance_(request.balance_after, 0),
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
  var evidence = createEvidenceFilesData_(item.id, request.evidence_files || request.evidence || [], now);
  writeAccountingAudit_(actor, 'CREATE', 'LEDGER', item.id, '', JSON.stringify(item), item.recordStatus === 'DRAFT' ? '임시저장' : '원장 등록');
  return { ok: true, evidence: evidence, item: mapLedgerEntryDto_(item) };
}

function createLedgerDraftData_(request, context) {
  return createLedgerEntryData_(request || {}, context, 'DRAFT');
}

function updateLedgerEntryData_(input, context) {
  input = input || {};
  if (!input.transaction_id) throw new Error('transaction_id is required.');
  var before = findLedgerRowById_(input.transaction_id);
  if (!before || String(before.recordStatus || 'ACTIVE') === 'DELETED') throw new Error('원장 거래를 찾을 수 없습니다.');
  var now = getCurrentIsoDateTime_();
  var transactionType = input.transaction_type == null || input.transaction_type === ''
    ? (isTruthyValue_(before.expense) ? '지출' : '수입')
    : normalizeLedgerTransactionType_(input.transaction_type);
  var changes = {
    transactionAt: input.transaction_date || before.transactionAt,
    description: input.description == null ? before.description : input.description,
    expense: transactionType === '지출',
    amount: input.amount == null || input.amount === '' ? parseLedgerPositiveAmount_(before.amount) : parseLedgerPositiveAmount_(input.amount),
    balanceAfter: input.balance_after == null ? Number(before.balanceAfter || 0) : parseLedgerInformationalBalance_(input.balance_after, before.balanceAfter),
    counterparty: input.counterparty == null ? before.counterparty : input.counterparty,
    eventId: input.event_id == null ? before.eventId : input.event_id,
    businessType: input.business_type == null ? before.businessType : input.business_type,
    businessId: input.business_id == null ? before.businessId : input.business_id,
    matchStatus: input.match_status == null ? before.matchStatus : input.match_status,
    recordStatus: input.record_status || before.recordStatus || 'ACTIVE',
    updatedAt: now
  };
  updateLedgerRowById_(input.transaction_id, changes);
  var actor = resolveAccountingActorEmail_(context);
  writeAccountingAudit_(actor, 'UPDATE', 'LEDGER', input.transaction_id, JSON.stringify(before), JSON.stringify(changes), input.reason || '원장 수정');
  return { ok: true, item: getLedgerDetailData_(input.transaction_id) || mapLedgerEntryDto_(Object.assign({}, before, changes)) };
}

function deleteLedgerEntryData_(input, context) {
  input = input || {};
  if (!input.transaction_id) throw new Error('transaction_id is required.');
  var before = findLedgerRowById_(input.transaction_id);
  if (!before) throw new Error('원장 거래를 찾을 수 없습니다.');
  var changes = { recordStatus: 'DELETED', updatedAt: getCurrentIsoDateTime_() };
  updateLedgerRowById_(input.transaction_id, changes);
  var actor = resolveAccountingActorEmail_(context);
  writeAccountingAudit_(actor, 'DELETE', 'LEDGER', input.transaction_id, JSON.stringify(before), JSON.stringify(changes), input.reason || '원장 soft delete');
  return { ok: true, transaction_id: input.transaction_id };
}

function processLedgerEntryData_(input, context) {
  input = input || {};
  if (!input.transaction_id) throw new Error('transaction_id is required.');
  var before = findLedgerRowById_(input.transaction_id);
  if (!before || String(before.recordStatus || 'ACTIVE') === 'DELETED') throw new Error('원장 거래를 찾을 수 없습니다.');
  var status = input.action === 'approve' ? '정상' : '확인필요';
  var changes = { matchStatus: status, recordStatus: before.recordStatus || 'ACTIVE', updatedAt: getCurrentIsoDateTime_() };
  updateLedgerRowById_(input.transaction_id, changes);
  writeAccountingAudit_(resolveAccountingActorEmail_(context), 'PROCESS', 'LEDGER', input.transaction_id, JSON.stringify(before), JSON.stringify(changes), input.reason || status);
  return { ok: true, transaction_id: input.transaction_id, status: status, item: getLedgerDetailData_(input.transaction_id) };
}
