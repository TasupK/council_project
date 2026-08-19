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

function normalizeLedgerRecordStatus_(value) {
  return String(value || '활성') === '무효' ? '무효' : '활성';
}

function resolveLedgerBankMatchStatus_(bankTransactionId, transactionType, amount, currentLedgerId) {
  if (!bankTransactionId) return '미확인';
  var bank = findBankTransactionRowById_(bankTransactionId);
  if (!bank) throw new Error('연결할 계좌거래를 찾을 수 없습니다.');
  if (String(bank.recordStatus || '정상') === '무효') throw new Error('무효 처리된 계좌거래는 원장에 연결할 수 없습니다.');

  var claimed = listLedgerRows_().some(function (row) {
    if (currentLedgerId && String(row.id) === String(currentLedgerId)) return false;
    return String(row.recordStatus || '활성') !== '무효' &&
      String(row.bankTransactionId || '') === String(bankTransactionId);
  });
  if (claimed) throw new Error('해당 계좌거래는 이미 다른 원장에 연결되어 있습니다.');

  var expectedType = Number(bank.amount) < 0 ? '지출' : '수입';
  var amountMatches = Math.abs(Number(bank.amount || 0)) === Number(amount || 0);
  return expectedType === transactionType && amountMatches ? '정상' : '확인필요';
}

function createLedgerEntryData_(request, context, recordStatus) {
  request = request || {};
  var now = getCurrentIsoDateTime_();
  var actor = resolveAccountingActorEmail_(context);
  var transactionType = normalizeLedgerTransactionType_(request.transaction_type);
  var amount = parseLedgerPositiveAmount_(request.amount);
  var bankTransactionId = request.bank_transaction_id || request.bankTransactionId || '';
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var item;
  try {
    var matchStatus = resolveLedgerBankMatchStatus_(bankTransactionId, transactionType, amount, '');
    item = {
      id: request.transaction_id || generateAccountingId_('TRX'),
      bankTransactionId: bankTransactionId,
      transactionAt: request.transaction_date || now,
      description: request.description || '',
      transactionType: transactionType,
      amount: amount,
      counterparty: request.counterparty || '',
      source: request.source || (bankTransactionId ? 'BANK' : 'MANUAL'),
      eventId: request.event_id || '',
      businessType: request.business_type || '일반',
      businessId: request.business_id || '',
      matchStatus: bankTransactionId ? matchStatus : '미확인',
      recordStatus: normalizeLedgerRecordStatus_(recordStatus),
      managerEmail: actor,
      createdAt: now,
      updatedAt: now
    };
    insertLedgerRow_(item);
  } finally {
    lock.releaseLock();
  }

  var evidence = createEvidenceFilesData_(item.id, request.evidence_files || request.evidence || [], now);
  writeAccountingAudit_(actor, 'CREATE', 'ledger', item.id, null, item, '원장 등록');
  return { ok: true, evidence: evidence, item: mapLedgerEntryDto_(item) };
}

function createLedgerDraftData_(request, context) {
  request = Object.assign({}, request || {}, { match_status: '미확인' });
  return createLedgerEntryData_(request, context, '활성');
}

function updateLedgerEntryData_(input, context) {
  input = input || {};
  if (!input.transaction_id) throw new Error('transaction_id is required.');
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var before;
  var changes;
  try {
    before = findLedgerRowById_(input.transaction_id);
    if (!before || String(before.recordStatus || '활성') === '무효') throw new Error('원장 거래를 찾을 수 없습니다.');

    var transactionType = input.transaction_type == null || input.transaction_type === ''
      ? normalizeLedgerTransactionType_(before.transactionType)
      : normalizeLedgerTransactionType_(input.transaction_type);
    var amount = input.amount == null || input.amount === ''
      ? parseLedgerPositiveAmount_(before.amount)
      : parseLedgerPositiveAmount_(input.amount);
    var bankTransactionId = input.bank_transaction_id == null
      ? (before.bankTransactionId || '')
      : String(input.bank_transaction_id || '');
    var matchStatus = resolveLedgerBankMatchStatus_(bankTransactionId, transactionType, amount, input.transaction_id);

    changes = {
      bankTransactionId: bankTransactionId,
      transactionAt: input.transaction_date || before.transactionAt,
      description: input.description == null ? before.description : input.description,
      transactionType: transactionType,
      amount: amount,
      counterparty: input.counterparty == null ? before.counterparty : input.counterparty,
      eventId: input.event_id == null ? before.eventId : input.event_id,
      businessType: input.business_type == null ? before.businessType : input.business_type,
      businessId: input.business_id == null ? before.businessId : input.business_id,
      matchStatus: bankTransactionId ? matchStatus : '미확인',
      recordStatus: normalizeLedgerRecordStatus_(before.recordStatus),
      managerEmail: resolveAccountingActorEmail_(context),
      updatedAt: getCurrentIsoDateTime_()
    };
    updateLedgerRowById_(input.transaction_id, changes);
  } finally {
    lock.releaseLock();
  }

  var actor = resolveAccountingActorEmail_(context);
  var after = Object.assign({}, before, changes);
  delete before._rowNumber;
  delete after._rowNumber;
  writeAccountingAudit_(actor, 'UPDATE', 'ledger', input.transaction_id, before, after, input.reason || '원장 수정');
  return { ok: true, item: getLedgerDetailData_(input.transaction_id) || mapLedgerEntryDto_(after) };
}

function linkLedgerBankTransactionData_(request, context) {
  request = request || {};
  if (!request.transaction_id || !request.bank_transaction_id) {
    throw new Error('transaction_id와 bank_transaction_id가 필요합니다.');
  }
  return updateLedgerEntryData_({
    transaction_id: request.transaction_id,
    bank_transaction_id: request.bank_transaction_id,
    reason: request.reason || '계좌거래 연결'
  }, context);
}

function deleteLedgerEntryData_(input, context) {
  input = input || {};
  if (!input.transaction_id) throw new Error('transaction_id is required.');
  var before = findLedgerRowById_(input.transaction_id);
  if (!before) throw new Error('원장 거래를 찾을 수 없습니다.');
  var changes = { recordStatus: '무효', managerEmail: resolveAccountingActorEmail_(context), updatedAt: getCurrentIsoDateTime_() };
  updateLedgerRowById_(input.transaction_id, changes);
  var actor = resolveAccountingActorEmail_(context);
  var after = Object.assign({}, before, changes);
  delete before._rowNumber;
  delete after._rowNumber;
  writeAccountingAudit_(actor, 'DELETE', 'ledger', input.transaction_id, before, after, input.reason || '원장 무효 처리');
  return { ok: true, transaction_id: input.transaction_id };
}

function processLedgerEntryData_(input, context) {
  input = input || {};
  if (!input.transaction_id) throw new Error('transaction_id is required.');
  var before = findLedgerRowById_(input.transaction_id);
  if (!before || String(before.recordStatus || '활성') === '무효') throw new Error('원장 거래를 찾을 수 없습니다.');

  var status;
  if (input.action === 'approve') {
    if (!before.bankTransactionId) throw new Error('계좌거래가 연결되지 않은 원장은 정상 확정할 수 없습니다.');
    status = resolveLedgerBankMatchStatus_(before.bankTransactionId, before.transactionType, Number(before.amount), before.id);
  } else {
    status = '확인필요';
  }
  var changes = { matchStatus: status, recordStatus: '활성', managerEmail: resolveAccountingActorEmail_(context), updatedAt: getCurrentIsoDateTime_() };
  updateLedgerRowById_(input.transaction_id, changes);
  var after = Object.assign({}, before, changes);
  delete before._rowNumber;
  delete after._rowNumber;
  writeAccountingAudit_(resolveAccountingActorEmail_(context), input.action === 'approve' ? 'CONFIRM' : 'UPDATE', 'ledger', input.transaction_id, before, after, input.reason || status);
  return { ok: true, transaction_id: input.transaction_id, status: status, item: getLedgerDetailData_(input.transaction_id) };
}
