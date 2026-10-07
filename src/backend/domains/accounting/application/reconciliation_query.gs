/** 계좌-원장 대조 read-only query/snapshot */

function buildReconciliationSnapshotItems_(banks, ledgers) {
  return (banks || []).filter(function (bank) { return String(bank.recordStatus || '정상') !== '무효'; }).map(function (bank) {
    var linked = (ledgers || []).filter(function (ledger) { return String(ledger.recordStatus || '활성') !== '무효' && String(ledger.bankTransactionId || '') === String(bank.id); });
    var ledger = linked.length === 1 && isUploadedBankLedgerAmountTypeMatch_(bank, linked[0]) ? linked[0] : null;
    return { bankTransactionId: bank.id, ledgerId: ledger ? ledger.id : '', result: ledger ? '정상' : '원장누락', differenceAmount: ledger ? 0 : Math.abs(Number(bank.amount || 0)), validationNote: linked.length && !ledger ? '기존 연결 거래의 금액 또는 구분을 확인해 주세요.' : ledger ? '기존 원장 연결 확인' : '원장 연결 또는 생성 필요' };
  });
}

function isUploadedBankLedgerAmountTypeMatch_(bank, ledger) {
  return isUploadedBankLedgerAmountMatch_(bank, ledger) &&
    isUploadedBankLedgerDirectionMatch_(bank, ledger);
}

function isUploadedBankLedgerAmountMatch_(bank, ledger) {
  return Math.abs(Number(bank.amount || 0)) === Number(ledger.amount || 0);
}

function isUploadedBankLedgerDirectionMatch_(bank, ledger) {
  var expectedType = Number(bank.amount || 0) < 0 ? '지출' : '수입';
  return String(ledger.transactionType || '') === expectedType;
}

function uploadedBankLedgerTextScore_(bank, ledger) {
  var bankText = normalizeReconciliationMatchText_([bank.counterparty, bank.description, bank.memo].join(' '));
  var ledgerText = normalizeReconciliationMatchText_([ledger.counterparty, ledger.description].join(' '));
  if (!bankText || !ledgerText) return 0;
  if (bankText === ledgerText) return 30;
  if (bankText.indexOf(ledgerText) > -1 || ledgerText.indexOf(bankText) > -1) return 20;
  return 0;
}

function scoreUploadedBankLedgerCandidate_(bank, ledger) {
  var dateDistance = reconciliationDateDistanceDays_(bank.transactionAt, ledger.transactionAt);
  var dateScore = dateDistance === 0 ? 100 : dateDistance <= 3 ? 40 - dateDistance : -1000;
  return dateScore + uploadedBankLedgerTextScore_(bank, ledger);
}

function findUploadedBankLedgerCandidate_(bank, ledgers, usedLedgerIds) {
  return findUploadedBankLedgerCandidateByDirection_(bank, ledgers, usedLedgerIds, true);
}

function findUploadedBankLedgerCandidateByDirection_(bank, ledgers, usedLedgerIds, requireDirectionMatch) {
  var candidates = (ledgers || []).filter(function (ledger) {
    if (String(ledger.recordStatus || '활성') === '무효') return false;
    if (usedLedgerIds[String(ledger.id || '')]) return false;
    if (ledger.bankTransactionId && String(ledger.bankTransactionId) !== String(bank.id || '')) return false;
    var directionMatches = isUploadedBankLedgerDirectionMatch_(bank, ledger);
    if (requireDirectionMatch ? !directionMatches : directionMatches) return false;
    return isUploadedBankLedgerAmountMatch_(bank, ledger) &&
      reconciliationDateDistanceDays_(bank.transactionAt, ledger.transactionAt) <= 3;
  }).map(function (ledger) {
    return { ledger: ledger, score: scoreUploadedBankLedgerCandidate_(bank, ledger) };
  }).sort(function (left, right) {
    return right.score - left.score;
  });
  return candidates.length ? candidates[0].ledger : null;
}

function countExactUploadedBankLedgerCandidates_(bank, ledgers, usedLedgerIds, selectedLedgerId) {
  return (ledgers || []).filter(function (ledger) {
    if (String(ledger.id || '') === String(selectedLedgerId || '')) return true;
    if (usedLedgerIds[String(ledger.id || '')]) return false;
    if (ledger.bankTransactionId && String(ledger.bankTransactionId) !== String(bank.id || '')) return false;
    return isUploadedBankLedgerAmountTypeMatch_(bank, ledger) &&
      reconciliationDateDistanceDays_(bank.transactionAt, ledger.transactionAt) === 0;
  }).length;
}

function buildReconciliationLedgerCandidates_(filter) {
  filter = filter || {};
  return buildLedgerAccountingFacts_().filter(function (row) { return String(row.recordStatus || '활성') !== '무효' && isAccountingDateInRange_(row.transactionAt, filter.startDate, filter.endDate); });
}
function listBankReconciliationCandidates_(bank, ledgers) {
  return (ledgers || []).filter(function (ledger) {
    return String(ledger.recordStatus || '활성') !== '무효' && !ledger.bankTransactionId && isUploadedBankLedgerAmountTypeMatch_(bank, ledger) && reconciliationDateDistanceDays_(bank.transactionAt, ledger.transactionAt) <= 3;
  }).sort(function (a, b) { return scoreUploadedBankLedgerCandidate_(bank, b) - scoreUploadedBankLedgerCandidate_(bank, a); }).map(function (ledger) {
    return { ledgerId: ledger.id, transactionAt: formatDateTimeValue_(ledger.transactionAt), counterparty: ledger.counterparty || '', description: ledger.description || '', amount: Number(ledger.amount || 0), approvalStatus: ledger.approvalStatus || '승인대기' };
  });
}

function getReconciliationListData_(filter) {
  filter = filter || {};
  var items = listReconciliationRows_().filter(function (row) {
    if (filter.startDate && String(row.auditEndDate || '') < filter.startDate) return false;
    if (filter.endDate && String(row.auditStartDate || '') > filter.endDate) return false;
    return true;
  }).sort(function (a, b) { return String(b.executedAt || '').localeCompare(String(a.executedAt || '')); });
  return { items: items, totalCount: items.length };
}

function getReconciliationDetailData_(reconciliationId) {
  var header = findReconciliationRowById_(reconciliationId);
  if (!header) return null;
  var banks = listBankTransactionRows_();
  var ledgers = buildLedgerAccountingFacts_().filter(function (row) { return String(row.recordStatus || '활성') !== '무효'; });
  var bankById = banks.reduce(function (index, row) { index[row.id] = row; return index; }, {});
  var ledgerById = ledgers.reduce(function (index, row) { index[row.id] = row; return index; }, {});
  var items = listReconciliationItemRows_().filter(function (row) { return String(row.reconciliationId) === String(reconciliationId); }).map(function (row) {
    var bank = bankById[row.bankTransactionId];
    if (!bank || String(bank.recordStatus || '정상') === '무효') return null;
    var result = buildReconciliationSnapshotItems_([bank], ledgers)[0];
    var linkedLedger = ledgers.filter(function (ledger) { return String(ledger.bankTransactionId || '') === String(bank.id); })[0];
    var claimed = Boolean(linkedLedger);
    var candidates = claimed ? [] : listBankReconciliationCandidates_(bank, ledgers);
    var workflowStatus = result.ledgerId ? '연결완료' : claimed ? '확인필요' : candidates.length === 1 ? '연결후보' : candidates.length > 1 ? '확인필요' : '원장없음';
    return { id: row.id, reconciliationId: row.reconciliationId, bankTransactionId: row.bankTransactionId, ledgerId: result.ledgerId || (linkedLedger ? linkedLedger.id : ''), status: result.result, result: result.result, workflowStatus: workflowStatus, candidates: candidates, note: result.validationNote, bank: Object.assign({}, bank, { transactionAt: formatDateTimeValue_(bank.transactionAt) }), ledger: result.ledgerId ? mapLedgerEntryDto_(ledgerById[result.ledgerId]) : linkedLedger ? mapLedgerEntryDto_(linkedLedger) : null };
  }).filter(Boolean);
  return { header: header, items: items };
}

function getReconciliationCandidatesData_(request) {
  request = request || {};
  var item = request.reconciliationItemId ? findReconciliationItemRowById_(request.reconciliationItemId) : null;
  var bankId = item ? item.bankTransactionId : request.bankTransactionId;
  var bank = bankId ? findBankTransactionRowById_(bankId) : null;
  if (!bank) throw new Error('계좌 거래를 찾을 수 없습니다.');
  var expectedType = Number(bank.amount || 0) < 0 ? '지출' : '수입';
  var expectedAmount = Math.abs(Number(bank.amount || 0));
  var items = buildReconciliationLedgerCandidates_({ startDate: request.startDate, endDate: request.endDate }).filter(function (ledger) {
    return !ledger.bankTransactionId && ledger.transactionType === expectedType && Number(ledger.amount || 0) === expectedAmount;
  }).map(function (ledger) {
    return {
      ledgerId: ledger.id,
      transactionAt: ledger.transactionAt,
      amount: Number(ledger.amount || 0),
      counterparty: ledger.counterparty || '',
      description: ledger.description || '',
      matchDetail: '미연결 원장 · 금액/방향 일치'
    };
  });
  return { items: items.slice(0, 10) };
}

function normalizeReconciliationMatchText_(value) {
  return String(value || '').replace(/\s+/g, '').toLowerCase();
}

function reconciliationDateDistanceDays_(left, right) {
  // Sheet date cells are Date objects; format them before extracting the local day.
  var leftTime = Date.parse(String(formatDateValue_(left) || '').slice(0, 10) + 'T00:00:00Z');
  var rightTime = Date.parse(String(formatDateValue_(right) || '').slice(0, 10) + 'T00:00:00Z');
  if (!isFinite(leftTime) || !isFinite(rightTime)) return 999999;
  return Math.round(Math.abs(leftTime - rightTime) / 86400000);
}

function buildEventPaymentReconciliationCandidates_(request) {
  request = request || {};
  var claimedPaymentIds = {};
  buildLedgerAccountingFacts_().forEach(function (ledger) {
    if (String(ledger.recordStatus || '활성') === '무효') return;
    if (String(ledger.businessType || '') !== 'EVENT_PAYMENT') return;
    var businessId = String(ledger.businessId || '').trim();
    if (businessId) claimedPaymentIds[businessId] = true;
  });

  var facts = buildEventPaymentAccountingFacts_().filter(function (fact) {
    return fact.paymentId && !claimedPaymentIds[String(fact.paymentId)] && String(fact.moneyStatus || '') !== '무효';
  });
  var banks = listBankTransactionRows_().filter(function (bank) {
    if (String(bank.recordStatus || '정상') === '무효') return false;
    if (Number(bank.amount || 0) <= 0) return false;
    if (request.startDate && String(bank.transactionAt || '') < String(request.startDate)) return false;
    if (request.endDate && String(bank.transactionAt || '') > String(request.endDate) + 'T23:59:59') return false;
    return true;
  });

  var candidates = [];
  banks.forEach(function (bank) {
    facts.forEach(function (fact) {
      var bankAmount = Math.abs(Number(bank.amount || 0));
      var paidAmount = Number(fact.paidAmount || 0);
      var amountMatches = bankAmount === paidAmount;
      if (!amountMatches) return;
      var dateDistanceDays = reconciliationDateDistanceDays_(bank.transactionAt, fact.paymentDate);
      var bankText = normalizeReconciliationMatchText_(bank.counterparty || bank.description || '');
      var depositorText = normalizeReconciliationMatchText_(fact.depositorName || '');
      var depositorMatches = !!depositorText && !!bankText && (bankText.indexOf(depositorText) >= 0 || depositorText.indexOf(bankText) >= 0);
      var score = 60;
      if (dateDistanceDays === 0) score += 25;
      else if (dateDistanceDays <= 3) score += 10;
      if (depositorMatches) score += 15;
      candidates.push({
        bankTransactionId: String(bank.id || ''),
        eventPaymentId: String(fact.paymentId || ''),
        eventId: String(fact.eventId || ''),
        applicationId: String(fact.applicationId || ''),
        bankAmount: bankAmount,
        paidAmount: paidAmount,
        amountMatches: amountMatches,
        dateDistanceDays: dateDistanceDays,
        depositorMatches: depositorMatches,
        score: score,
        result: '정상'
      });
    });
  });

  var byBank = {};
  candidates.forEach(function (candidate) {
    if (!byBank[candidate.bankTransactionId]) byBank[candidate.bankTransactionId] = [];
    byBank[candidate.bankTransactionId].push(candidate);
  });
  Object.keys(byBank).forEach(function (bankId) {
    var rows = byBank[bankId];
    var maxScore = rows.reduce(function (max, row) { return Math.max(max, row.score); }, -1);
    var tied = rows.filter(function (row) { return row.score === maxScore; });
    if (tied.length > 1) tied.forEach(function (row) { row.result = '정상'; });
  });
  return candidates.sort(function (a, b) { return b.score - a.score; });
}
