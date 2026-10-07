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

function assertLedgerBusinessSourceAvailable_(businessType, businessId, currentLedgerId) {
  var sourceType = String(businessType || '');
  if ([
    'EVENT_PAYMENT',
    'EVENT_APPLICATION',
    'STUDENT_FEE_PAYMENT',
    'STUDENT_FEE_APPLICATION'
  ].indexOf(sourceType) < 0) return;
  var sourceId = String(businessId || '').trim();
  if (!sourceId) return;
  var claimed = listLedgerRows_().some(function (row) {
    if (currentLedgerId && String(row.id) === String(currentLedgerId)) return false;
    return String(row.recordStatus || '활성') !== '무효' &&
      String(row.businessType || '') === sourceType &&
      String(row.businessId || '') === sourceId;
  });
  if (claimed) throw new Error('해당 승인 입금은 이미 다른 원장에 연결되어 있습니다.');
}

function createLedgerEntryData_(request, context, recordStatus) {
  request = request || {};
  var now = getCurrentIsoDateTime_();
  var actor = resolveAccountingActorEmail_(context);
  var transactionType = normalizeLedgerTransactionType_(request.transaction_type);
  var amount = parseLedgerPositiveAmount_(request.amount);
  var bankTransactionId = request.bank_transaction_id || request.bankTransactionId || '';
  var businessType = request.business_type || '일반';
  var businessId = request.business_id || '';
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var item;
  try {
    assertLedgerBusinessSourceAvailable_(businessType, businessId, '');
    var matchStatus = resolveReconciliationLedgerBankMatchStatus_(bankTransactionId, transactionType, amount, '');
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
      businessType: businessType,
      businessId: businessId,
      matchStatus: bankTransactionId ? matchStatus : '미확인',
      recordStatus: normalizeLedgerRecordStatus_(recordStatus),
      managerEmail: actor,
      createdAt: now,
      updatedAt: now,
      approvalStatus: '승인대기',
      approvedByEmail: '',
      approvedAt: '',
      rejectionReason: ''
    };
    insertLedgerRow_(item);
  } finally {
    lock.releaseLock();
  }

  try {
    writeAccountingAudit_(actor, 'CREATE', 'ledger', item.id, null, item, '원장 등록');
  } catch (error) {
    try {
      deleteLedgerRowById_(item.id);
    } catch (rollbackError) {
      console.error('[createLedgerEntry] 원장 롤백 실패: ' + (rollbackError.message || String(rollbackError)));
    }
    throw error;
  }
  return { ok: true, item: mapLedgerEntryDto_(item) };
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
    if (normalizeLedgerApprovalStatus_(before.approvalStatus) === '승인') throw new Error('승인된 거래는 승인 취소 후 수정할 수 있습니다.');

    var resubmitting = input.resubmit === true;
    if (resubmitting && normalizeLedgerApprovalStatus_(before.approvalStatus) !== '반려') throw new Error('반려된 거래만 재제출할 수 있습니다.');
    var transactionType = input.transaction_type == null || input.transaction_type === ''
      ? normalizeLedgerTransactionType_(before.transactionType)
      : normalizeLedgerTransactionType_(input.transaction_type);
    var amount = input.amount == null || input.amount === ''
      ? parseLedgerPositiveAmount_(before.amount)
      : parseLedgerPositiveAmount_(input.amount);
    var bankTransactionId = input.bank_transaction_id == null
      ? (before.bankTransactionId || '')
      : String(input.bank_transaction_id || '');
    var businessType = input.business_type == null ? before.businessType : input.business_type;
    var businessId = input.business_id == null ? before.businessId : input.business_id;
    assertLedgerBusinessSourceAvailable_(businessType, businessId, input.transaction_id);
    var matchStatus = resolveReconciliationLedgerBankMatchStatus_(bankTransactionId, transactionType, amount, input.transaction_id);
    var transactionAt = input.transaction_date || before.transactionAt;
    var description = input.description == null ? before.description : input.description;
    var counterparty = input.counterparty == null ? before.counterparty : input.counterparty;
    var eventId = input.event_id == null ? before.eventId : input.event_id;
    var approvalSensitiveChanged =
      String(transactionAt || '') !== String(before.transactionAt || '') ||
      String(description || '') !== String(before.description || '') ||
      String(transactionType || '') !== String(before.transactionType || '') ||
      Number(amount || 0) !== Number(before.amount || 0) ||
      String(counterparty || '') !== String(before.counterparty || '') ||
      String(eventId || '') !== String(before.eventId || '') ||
      String(businessType || '') !== String(before.businessType || '') ||
      String(businessId || '') !== String(before.businessId || '');

    var resetApproval = approvalSensitiveChanged || resubmitting;
    changes = {
      bankTransactionId: bankTransactionId,
      transactionAt: transactionAt,
      description: description,
      transactionType: transactionType,
      amount: amount,
      counterparty: counterparty,
      eventId: eventId,
      businessType: businessType,
      businessId: businessId,
      matchStatus: bankTransactionId ? matchStatus : '미확인',
      recordStatus: normalizeLedgerRecordStatus_(before.recordStatus),
      managerEmail: resolveAccountingActorEmail_(context),
      updatedAt: getCurrentIsoDateTime_(),
      approvalStatus: resetApproval ? '승인대기' : normalizeLedgerApprovalStatus_(before.approvalStatus),
      approvedByEmail: resetApproval ? '' : (before.approvedByEmail || ''),
      approvedAt: resetApproval ? '' : (before.approvedAt || ''),
      rejectionReason: resetApproval ? '' : (before.rejectionReason || '')
    };
    updateLedgerRowById_(input.transaction_id, changes);
  } finally {
    lock.releaseLock();
  }

  var actor = resolveAccountingActorEmail_(context);
  var after = Object.assign({}, before, changes);
  delete before._rowNumber;
  delete after._rowNumber;
  writeAccountingAudit_(actor, 'UPDATE', 'ledger', input.transaction_id, before, after, input.reason || (input.resubmit === true ? '반려 거래 수정 및 재제출' : '원장 수정'));
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
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var before; var after;
  var actor = resolveAccountingActorEmail_(context);
  try {
    before = findLedgerRowById_(input.transaction_id);
    if (!before || String(before.recordStatus || '활성') === '무효') throw new Error('원장 거래를 찾을 수 없습니다.');
    if (normalizeLedgerApprovalStatus_(before.approvalStatus) !== '반려') throw new Error('반려된 거래만 삭제할 수 있습니다.');
    var changes = { recordStatus: '무효', managerEmail: actor, updatedAt: getCurrentIsoDateTime_() };
    updateLedgerRowById_(input.transaction_id, changes);
    after = Object.assign({}, before, changes);
  } finally { lock.releaseLock(); }
  delete before._rowNumber;
  delete after._rowNumber;
  writeAccountingAudit_(actor, 'DELETE', 'ledger', input.transaction_id, before, after, input.reason || '반려 거래 무효 처리');
  return { ok: true, transaction_id: input.transaction_id };
}

function processLedgerEntryData_(input, context) {
  input = input || {};
  if (!input.transaction_id) throw new Error('transaction_id is required.');
  var actor = resolveAccountingActorEmail_(context);
  var now = getCurrentIsoDateTime_();
  var reason = String(input.reason || '').trim();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  var before; var changes; var auditAction;
  try {
    before = findLedgerRowById_(input.transaction_id);
    if (!before || String(before.recordStatus || '활성') === '무효') throw new Error('원장 거래를 찾을 수 없습니다.');
    var status = normalizeLedgerApprovalStatus_(before.approvalStatus);
    if (input.action === 'cancel_approval') {
      if (status !== '승인') throw new Error('승인된 거래만 승인 취소할 수 있습니다.');
      if (!reason) throw new Error('승인 취소 사유를 입력해 주세요.');
      changes = { approvalStatus: '승인대기', approvedByEmail: '', approvedAt: '', rejectionReason: '' };
      auditAction = 'UPDATE';
      reason = '승인 취소: ' + reason;
    } else if (input.action === 'approve' || input.action === 'reject') {
      if (status !== '승인대기') throw new Error('승인대기 거래만 승인 또는 반려할 수 있습니다.');
      if (input.action === 'reject' && !reason) throw new Error('반려 사유를 입력해 주세요.');
      changes = {
        approvalStatus: input.action === 'approve' ? '승인' : '반려',
        approvedByEmail: actor, approvedAt: now,
        rejectionReason: input.action === 'reject' ? reason : ''
      };
      auditAction = input.action === 'approve' ? 'APPROVE' : 'REJECT';
    } else { throw new Error('지원하지 않는 승인 처리입니다.'); }
    changes.recordStatus = '활성';
    changes.managerEmail = actor;
    changes.updatedAt = now;
    updateLedgerRowById_(input.transaction_id, changes);
  } finally { lock.releaseLock(); }
  var after = Object.assign({}, before, changes);
  delete before._rowNumber;
  delete after._rowNumber;
  writeAccountingAudit_(actor, auditAction, 'ledger', input.transaction_id, before, after, reason || changes.approvalStatus);
  return {
    ok: true, transaction_id: input.transaction_id,
    approval_status: changes.approvalStatus, match_status: before.matchStatus || '미확인',
    item: getLedgerDetailData_(input.transaction_id)
  };
}
