/** 감사대사 mutation/business service */

function resolveReconciliationBankBalances_(banks) {
  var sorted = (banks || []).slice().sort(function (a, b) {
    return String(a.transactionAt || '').localeCompare(String(b.transactionAt || ''));
  });
  if (!sorted.length) return { opening: '', closing: '' };
  var first = sorted[0];
  var opening = first.balanceAfter === '' || first.balanceAfter == null
    ? ''
    : Number(first.balanceAfter) - Number(first.amount || 0);
  var closing = '';
  for (var i = sorted.length - 1; i >= 0; i -= 1) {
    if (sorted[i].balanceAfter !== '' && sorted[i].balanceAfter != null) {
      closing = Number(sorted[i].balanceAfter);
      break;
    }
  }
  return { opening: opening, closing: closing };
}

function processReconciliationData_(request, context) {
  request = request || {};
  if (!request.startDate || !request.endDate) throw new Error('startDate와 endDate가 필요합니다.');
  if (request.startDate > request.endDate) throw new Error('감사 시작일이 종료일보다 늦을 수 없습니다.');
  var requestedBankIds = (request.bankTransactionIds || []).map(function (id) {
    return String(id || '').trim();
  }).filter(Boolean);
  if (!requestedBankIds.length) throw new Error('현재 업로드한 파일의 계좌 거래가 없습니다.');
  var requestedBankIdSet = requestedBankIds.reduce(function (index, id) {
    index[id] = true;
    return index;
  }, {});

  var banks = listBankTransactionRows_().filter(function (row) {
    return String(row.recordStatus || '정상') !== '무효' &&
      requestedBankIdSet[String(row.id || '')] &&
      isAccountingDateInRange_(row.transactionAt, request.startDate, request.endDate);
  });
  if (!banks.length) throw new Error('현재 업로드한 파일에서 비교할 계좌 거래를 찾지 못했습니다.');
  var ledgers = buildReconciliationLedgerCandidates_({ startDate: request.startDate, endDate: request.endDate });
  var linkedCount = linkUnclaimedApprovedIncomeLedgersForReconciliation_(banks, ledgers, context);
  if (linkedCount) {
    ledgers = buildReconciliationLedgerCandidates_({ startDate: request.startDate, endDate: request.endDate });
  }
  var relinkedCount = relinkApprovedIncomeLedgersForReconciliation_(banks, ledgers, context);
  if (relinkedCount) {
    ledgers = buildReconciliationLedgerCandidates_({ startDate: request.startDate, endDate: request.endDate });
  }
  var results = buildReconciliationSnapshotItems_(banks, ledgers);
  var balances = resolveReconciliationBankBalances_(banks);
  var now = getCurrentIsoDateTime_();
  var id = generateAccountingId_('REC');
  var actor = resolveAccountingActorEmail_(context);
  var header = {
    id: id,
    auditStartDate: request.startDate,
    auditEndDate: request.endDate,
    accountOpeningBalance: balances.opening,
    accountClosingBalance: balances.closing,
    accountTransactionCount: banks.length,
    ledgerTransactionCount: ledgers.length,
    normalCount: results.filter(function (item) { return item.result === '정상'; }).length,
    missingLedgerCount: results.filter(function (item) { return item.result === '원장누락'; }).length,
    unverifiedBankCount: 0,
    reviewRequiredCount: 0,
    status: results.some(function (item) { return item.result === '원장누락'; }) ? '원장누락' : '정상',
    managerEmail: actor,
    executedAt: now,
    confirmedAt: '',
    confirmation: ''
  };

  insertReconciliationRow_(header);
  results.forEach(function (result) {
    insertReconciliationItemRow_({
      id: generateAccountingId_('RCI'),
      reconciliationId: id,
      bankTransactionId: result.bankTransactionId || '',
      ledgerId: result.ledgerId || '',
      result: result.result,
      differenceAmount: Number(result.differenceAmount || 0),
      validationNote: result.validationNote || '',
      createdAt: now
    });
  });
  writeAccountingAudit_(actor, 'RECONCILE', 'reconciliation', id, null, header, '감사대사 snapshot 생성');
  return getReconciliationDetailData_(id);
}

function linkUnclaimedApprovedIncomeLedgersForReconciliation_(banks, ledgers, context) {
  var claimedBankIds = buildClaimedBankTransactionLedgerMap_();
  var linkedLedgerIds = {};
  var changedCount = 0;

  (banks || []).forEach(function (bank) {
    if (!bank || Number(bank.amount || 0) <= 0) return;
    if (claimedBankIds[String(bank.id || '')]) return;
    var candidate = findUnclaimedApprovedIncomeLedgerLinkCandidate_(bank, banks, ledgers, claimedBankIds, linkedLedgerIds);
    if (!candidate) return;
    try {
      updateLedgerEntryData_({
        transaction_id: candidate.id,
        bank_transaction_id: bank.id,
        reason: '감사대사 자동 연결: 승인 수입 원장 계좌거래 연결'
      }, context);
      linkedLedgerIds[String(candidate.id || '')] = true;
      claimedBankIds[String(bank.id || '')] = String(candidate.id || '');
      changedCount += 1;
    } catch (error) {
      console.warn('미연결 승인 수입 원장 계좌거래 자동 연결 실패', {
        bankTransactionId: bank.id,
        ledgerId: candidate.id,
        message: error && error.message ? error.message : String(error)
      });
    }
  });
  return changedCount;
}

function findUnclaimedApprovedIncomeLedgerLinkCandidate_(bank, banks, ledgers, claimedBankIds, linkedLedgerIds) {
  var candidates = (ledgers || []).filter(function (ledger) {
    if (!isUnclaimedApprovedIncomeLedgerCandidate_(bank, ledger, linkedLedgerIds)) return false;
    if (countMatchingUnclaimedIncomeBanksForLedger_(ledger, banks, claimedBankIds) !== 1) return false;
    return true;
  }).sort(function (left, right) {
    var leftScore = scoreUploadedBankLedgerCandidate_(bank, left);
    var rightScore = scoreUploadedBankLedgerCandidate_(bank, right);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return String(left.id || '').localeCompare(String(right.id || ''));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function isUnclaimedApprovedIncomeLedgerCandidate_(bank, ledger, linkedLedgerIds) {
  if (!bank || !ledger) return false;
  if (String(ledger.recordStatus || '활성') === '무효') return false;
  if (String(ledger.approvalStatus || '') !== '승인') return false;
  if (String(ledger.bankTransactionId || '').trim()) return false;
  if (linkedLedgerIds && linkedLedgerIds[String(ledger.id || '')]) return false;
  if (!isUploadedBankLedgerAmountTypeMatch_(bank, ledger)) return false;
  var dateDistance = reconciliationDateDistanceDays_(bank.transactionAt, ledger.transactionAt);
  if (dateDistance > 3) return false;
  return uploadedBankLedgerTextScore_(bank, ledger) > 0 || dateDistance === 0;
}

function countMatchingUnclaimedIncomeBanksForLedger_(ledger, banks, claimedBankIds) {
  return (banks || []).filter(function (bank) {
    if (!bank || Number(bank.amount || 0) <= 0) return false;
    if (claimedBankIds && claimedBankIds[String(bank.id || '')]) return false;
    return isUnclaimedApprovedIncomeLedgerCandidate_(bank, ledger, {});
  }).length;
}

function relinkApprovedIncomeLedgersForReconciliation_(banks, ledgers, context) {
  var currentResults = buildReconciliationSnapshotItems_(banks, ledgers);
  var bankById = (banks || []).reduce(function (index, bank) {
    index[String(bank.id || '')] = bank;
    return index;
  }, {});
  var usedLedgerIds = currentResults.reduce(function (index, item) {
    if (item.result === '정상' && item.ledgerId) index[String(item.ledgerId)] = true;
    return index;
  }, {});
  var claimedBankIds = buildClaimedBankTransactionLedgerMap_();
  var relinkedLedgerIds = {};
  var changedCount = 0;

  currentResults.forEach(function (item) {
    if (item.result !== '원장누락') return;
    var bank = bankById[String(item.bankTransactionId || '')];
    if (!bank || Number(bank.amount || 0) <= 0) return;
    if (claimedBankIds[String(bank.id || '')]) return;
    var candidate = findApprovedIncomeLedgerRelinkCandidate_(bank, ledgers, usedLedgerIds, relinkedLedgerIds);
    if (!candidate) return;
    try {
      updateLedgerEntryData_({
        transaction_id: candidate.id,
        bank_transaction_id: bank.id,
        reason: '감사대사 자동 보정: 승인 수입 원장 계좌거래 연결'
      }, context);
      usedLedgerIds[String(candidate.id || '')] = true;
      relinkedLedgerIds[String(candidate.id || '')] = true;
      claimedBankIds[String(bank.id || '')] = String(candidate.id || '');
      changedCount += 1;
    } catch (error) {
      console.warn('승인 수입 원장 계좌거래 자동 보정 실패', {
        bankTransactionId: bank.id,
        ledgerId: candidate.id,
        message: error && error.message ? error.message : String(error)
      });
    }
  });
  return changedCount;
}

function buildClaimedBankTransactionLedgerMap_() {
  var claimed = {};
  buildLedgerAccountingFacts_().forEach(function (ledger) {
    if (String(ledger.recordStatus || '활성') === '무효') return;
    var bankTransactionId = String(ledger.bankTransactionId || '').trim();
    if (bankTransactionId) claimed[bankTransactionId] = String(ledger.id || '');
  });
  return claimed;
}

function findApprovedIncomeLedgerRelinkCandidate_(bank, ledgers, usedLedgerIds, relinkedLedgerIds) {
  var candidates = (ledgers || []).filter(function (ledger) {
    if (String(ledger.recordStatus || '활성') === '무효') return false;
    if (String(ledger.approvalStatus || '') !== '승인') return false;
    if (usedLedgerIds[String(ledger.id || '')] || relinkedLedgerIds[String(ledger.id || '')]) return false;
    if (!ledger.bankTransactionId || String(ledger.bankTransactionId) === String(bank.id || '')) return false;
    if (!isUploadedBankLedgerAmountTypeMatch_(bank, ledger)) return false;
    var dateDistance = reconciliationDateDistanceDays_(bank.transactionAt, ledger.transactionAt);
    if (dateDistance > 3) return false;
    return uploadedBankLedgerTextScore_(bank, ledger) > 0 || dateDistance === 0;
  }).sort(function (left, right) {
    var leftScore = scoreUploadedBankLedgerCandidate_(bank, left);
    var rightScore = scoreUploadedBankLedgerCandidate_(bank, right);
    if (leftScore !== rightScore) return rightScore - leftScore;
    return String(left.id || '').localeCompare(String(right.id || ''));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function autoCreateApprovedIncomeLedgersForReconciliation_(banks, ledgers, context) {
  var currentResults = buildReconciliationSnapshotItems_(banks, ledgers);
  var bankById = (banks || []).reduce(function (index, bank) {
    index[String(bank.id || '')] = bank;
    return index;
  }, {});
  var facts = listApprovedIncomePaymentFactsForReconciliation_();
  if (!facts.length) return 0;

  var claimedSources = buildClaimedIncomePaymentSourceMap_();
  var createdCount = 0;
  currentResults.forEach(function (item) {
    if (item.result !== '원장누락') return;
    var bank = bankById[String(item.bankTransactionId || '')];
    if (!bank || Number(bank.amount || 0) <= 0) return;
    var candidate = findAutoApprovedIncomePaymentCandidate_(bank, facts, claimedSources);
    if (!candidate) return;
    var saved = createLedgerEntryData_({
      bank_transaction_id: bank.id,
      transaction_type: '수입',
      transaction_date: bank.transactionAt,
      amount: candidate.amount,
      counterparty: candidate.depositorName || bank.counterparty || bank.description || '',
      description: candidate.description,
      event_id: candidate.eventId || '',
      source: 'BANK',
      business_type: candidate.sourceType,
      business_id: candidate.sourceId
    }, context, '활성');
    var transactionId = saved && saved.item && (saved.item.transaction_id || saved.item.id);
    if (transactionId) processLedgerEntryData_({ transaction_id: transactionId, action: 'approve' }, context);
    claimedSources[candidate.sourceType + '|' + candidate.sourceId] = true;
    createdCount += 1;
  });
  return createdCount;
}

function buildClaimedIncomePaymentSourceMap_() {
  var claimed = {};
  buildLedgerAccountingFacts_().forEach(function (ledger) {
    if (String(ledger.recordStatus || '활성') === '무효') return;
    var sourceType = String(ledger.businessType || '');
    if ([
      'EVENT_PAYMENT',
      'EVENT_APPLICATION',
      'STUDENT_FEE_PAYMENT',
      'STUDENT_FEE_APPLICATION'
    ].indexOf(sourceType) < 0) return;
    var sourceId = String(ledger.businessId || '').trim();
    if (sourceId) claimed[sourceType + '|' + sourceId] = true;
  });
  return claimed;
}

function listApprovedIncomePaymentFactsForReconciliation_() {
  var facts = [];
  var unique = {};
  var pushFact = function (fact) {
    if (!fact || !fact.sourceType || !fact.sourceId || !Number(fact.amount || 0)) return;
    var key = fact.sourceType + '|' + fact.sourceId;
    if (unique[key]) return;
    unique[key] = true;
    facts.push(fact);
  };
  if (typeof buildEventPaymentAccountingFacts_ === 'function') {
    buildEventPaymentAccountingFacts_().forEach(function (fact) {
      if (!fact.paymentId || String(fact.moneyStatus || '') === '무효') return;
      pushFact({
        sourceType: 'EVENT_PAYMENT',
        sourceId: String(fact.paymentId || '').trim(),
        amount: Number(fact.paidAmount || 0),
        paymentDate: String(fact.paymentDate || '').trim(),
        depositorName: String(fact.depositorName || '').trim(),
        eventId: String(fact.eventId || '').trim(),
        description: '행사 입금 ' + String(fact.paymentId || '').trim()
      });
    });
  }
  if (typeof buildApprovedEventApplicationAccountingFacts_ === 'function') {
    buildApprovedEventApplicationAccountingFacts_().forEach(function (fact) {
      if (!fact.applicationId) return;
      pushFact({
        sourceType: 'EVENT_APPLICATION',
        sourceId: String(fact.applicationId || '').trim(),
        amount: Number(fact.amount || 0),
        paymentDate: String(fact.paymentDate || '').trim(),
        depositorName: String(fact.depositorName || '').trim(),
        eventId: String(fact.eventId || '').trim(),
        description: '행사 신청 승인 ' + String(fact.applicationId || '').trim()
      });
    });
  }
  if (typeof buildStudentFeePaymentAccountingFacts_ === 'function') {
    buildStudentFeePaymentAccountingFacts_().forEach(function (fact) {
      if (!fact.paymentId) return;
      if (String(fact.moneyStatus || '') !== '완료' && String(fact.applicationStatus || '') !== '승인') return;
      pushFact({
        sourceType: 'STUDENT_FEE_PAYMENT',
        sourceId: String(fact.paymentId || '').trim(),
        amount: Number(fact.amount || 0),
        paymentDate: String(fact.paymentDate || '').trim(),
        depositorName: String(fact.depositorName || '').trim(),
        eventId: '',
        description: '학생회비 납부 ' + String(fact.paymentId || '').trim()
      });
    });
  }
  if (typeof buildApprovedStudentFeeApplicationAccountingFacts_ === 'function') {
    buildApprovedStudentFeeApplicationAccountingFacts_().forEach(function (fact) {
      if (!fact.applicationId) return;
      pushFact({
        sourceType: fact.paymentId ? 'STUDENT_FEE_PAYMENT' : 'STUDENT_FEE_APPLICATION',
        sourceId: String(fact.paymentId || fact.applicationId || '').trim(),
        amount: Number(fact.amount || 0),
        paymentDate: String(fact.paymentDate || '').trim(),
        depositorName: String(fact.depositorName || '').trim(),
        eventId: '',
        description: '학생회비 납부 ' + String(fact.paymentId || fact.applicationId || '').trim()
      });
    });
  }
  return facts;
}

function findAutoApprovedIncomePaymentCandidate_(bank, facts, claimedSources) {
  var bankAmount = Math.abs(Number(bank.amount || 0));
  var bankText = normalizeReconciliationMatchText_([bank.counterparty, bank.description, bank.memo].join(' '));
  if (!bankAmount) return null;
  var candidates = (facts || []).filter(function (fact) {
    if (!fact.sourceType || !fact.sourceId) return false;
    if (claimedSources[fact.sourceType + '|' + fact.sourceId]) return false;
    if (bankAmount !== Number(fact.amount || 0)) return false;
    var dateDistance = reconciliationDateDistanceDays_(bank.transactionAt, fact.paymentDate);
    if (dateDistance > 3) return false;
    var depositorText = normalizeReconciliationMatchText_(fact.depositorName || '');
    if (!depositorText) return dateDistance === 0;
    if (!bankText) return dateDistance === 0;
    return bankText.indexOf(depositorText) >= 0 || depositorText.indexOf(bankText) >= 0 || dateDistance === 0;
  }).sort(function (left, right) {
    var leftDistance = reconciliationDateDistanceDays_(bank.transactionAt, left.paymentDate);
    var rightDistance = reconciliationDateDistanceDays_(bank.transactionAt, right.paymentDate);
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return String(left.sourceType + left.sourceId).localeCompare(String(right.sourceType + right.sourceId));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function applyReconciliationLinkData_(request, context) {
  request = request || {};
  if (!request.reconciliationItemId || !request.ledgerId) throw new Error('대사상세ID와 원장ID가 필요합니다.');
  var item = findReconciliationItemRowById_(request.reconciliationItemId);
  if (!item || !item.bankTransactionId) throw new Error('연결 가능한 대사 상세를 찾을 수 없습니다.');
  linkLedgerBankTransactionData_({
    transaction_id: request.ledgerId,
    bank_transaction_id: item.bankTransactionId,
    reason: request.note || '감사대사 화면에서 계좌거래 연결'
  }, context);
  return getReconciliationDetailData_(item.reconciliationId);
}

function createLedgerFromReconciliationData_(request, context) {
  request = request || {};
  var item = findReconciliationItemRowById_(request.reconciliationItemId);
  if (!item || !item.bankTransactionId) throw new Error('대사 상세를 찾을 수 없습니다.');
  var bank = findBankTransactionRowById_(item.bankTransactionId);
  if (!bank || String(bank.recordStatus || '정상') === '무효') throw new Error('계좌 거래를 찾을 수 없습니다.');
  var saved = createLedgerEntryData_({
    bank_transaction_id: bank.id,
    transaction_type: Number(bank.amount || 0) < 0 ? '지출' : '수입',
    transaction_date: bank.transactionAt,
    amount: Math.abs(Number(bank.amount || 0)),
    counterparty: request.counterparty || bank.description || '',
    description: request.description || bank.description || '',
    event_id: request.event_id || '',
    source: 'BANK',
    business_type: request.business_type || '대사생성',
    business_id: request.business_id || item.id
  }, context, '활성');
  return { snapshot: getReconciliationDetailData_(item.reconciliationId), createdLedger: saved.item };
}

function createLedgerFromEventPaymentReconciliationData_(request, context) {
  request = request || {};
  var bankTransactionId = String(request.bankTransactionId || request.bank_transaction_id || '').trim();
  var eventPaymentId = String(request.eventPaymentId || request.event_payment_id || '').trim();
  if (!bankTransactionId || !eventPaymentId) throw new Error('bankTransactionId와 eventPaymentId가 필요합니다.');

  var bank = findBankTransactionRowById_(bankTransactionId);
  if (!bank || String(bank.recordStatus || '정상') === '무효') throw new Error('계좌 거래를 찾을 수 없습니다.');
  if (Number(bank.amount || 0) <= 0) throw new Error('행사 입금은 수입 계좌거래와만 연결할 수 있습니다.');

  var fact = buildEventPaymentAccountingFacts_().filter(function (item) {
    return String(item.paymentId || '') === eventPaymentId;
  })[0];
  if (!fact || String(fact.moneyStatus || '') === '무효') throw new Error('행사 입금 정보를 찾을 수 없습니다.');

  var bankAmount = Math.abs(Number(bank.amount || 0));
  var paidAmount = Number(fact.paidAmount || 0);
  if (bankAmount !== paidAmount) throw new Error('계좌 거래 금액과 행사 입금 금액이 일치하지 않습니다.');

  var saved = createLedgerEntryData_({
    bank_transaction_id: bank.id,
    transaction_type: '수입',
    transaction_date: bank.transactionAt,
    amount: paidAmount,
    counterparty: fact.depositorName || bank.counterparty || bank.description || '',
    description: '행사 입금 ' + fact.paymentId,
    event_id: fact.eventId || '',
    source: 'BANK',
    business_type: 'EVENT_PAYMENT',
    business_id: fact.paymentId
  }, context, '활성');

  return {
    createdLedger: saved.item,
    bankTransactionId: bank.id,
    eventPaymentId: fact.paymentId
  };
}
