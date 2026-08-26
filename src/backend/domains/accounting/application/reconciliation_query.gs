/** 계좌-원장 대조 read-only query/snapshot */

function buildReconciliationSnapshotItems_(banks, ledgers) {
  var ledgerByBankId = {};
  var usedLedgerIds = {};
  (ledgers || []).forEach(function (ledger) {
    if (String(ledger.recordStatus || '활성') === '무효' || !ledger.bankTransactionId) return;
    ledgerByBankId[String(ledger.bankTransactionId)] = ledger;
  });

  var items = (banks || []).filter(function (bank) {
    return String(bank.recordStatus || '정상') !== '무효';
  }).map(function (bank) {
    var ledger = ledgerByBankId[String(bank.id || '')];
    if (!ledger) ledger = findUploadedBankLedgerCandidate_(bank, ledgers, usedLedgerIds);
    if (!ledger) {
      return {
        bankTransactionId: bank.id || '', ledgerId: '', result: '원장누락',
        differenceAmount: Math.abs(Number(bank.amount || 0)),
        validationNote: '계좌거래에 연결된 활성 원장이 없습니다.'
      };
    }
    usedLedgerIds[String(ledger.id || '')] = true;
    var expectedType = Number(bank.amount || 0) < 0 ? '지출' : '수입';
    var typeMatches = String(ledger.transactionType || '') === expectedType;
    var amountDifference = Math.abs(Math.abs(Number(bank.amount || 0)) - Number(ledger.amount || 0));
    var dateDistance = reconciliationDateDistanceDays_(bank.transactionAt, ledger.transactionAt);
    var exactCandidateCount = countExactUploadedBankLedgerCandidates_(bank, ledgers, usedLedgerIds, ledger.id);
    var result = typeMatches && amountDifference === 0 && dateDistance === 0 && exactCandidateCount <= 1 ? '정상' : '확인필요';
    return {
      bankTransactionId: bank.id || '', ledgerId: ledger.id || '', result: result,
      differenceAmount: amountDifference,
      validationNote: result === '정상'
        ? '현재 업로드 거래와 승인 장부의 날짜/금액/방향이 일치합니다.'
        : '현재 업로드 거래와 가장 가까운 승인 장부 후보를 확인해야 합니다.'
    };
  });
  return items;
}

function isUploadedBankLedgerAmountTypeMatch_(bank, ledger) {
  var expectedType = Number(bank.amount || 0) < 0 ? '지출' : '수입';
  return String(ledger.transactionType || '') === expectedType &&
    Math.abs(Number(bank.amount || 0)) === Number(ledger.amount || 0);
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
  var candidates = (ledgers || []).filter(function (ledger) {
    if (String(ledger.recordStatus || '활성') === '무효') return false;
    if (usedLedgerIds[String(ledger.id || '')]) return false;
    if (ledger.bankTransactionId && String(ledger.bankTransactionId) !== String(bank.id || '')) return false;
    return isUploadedBankLedgerAmountTypeMatch_(bank, ledger) &&
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
  return buildApprovedLedgerAccountingFacts_().filter(function (row) {
    return isAccountingDateInRange_(row.transactionAt, filter.startDate, filter.endDate);
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
  var bankById = listBankTransactionRows_().reduce(function (index, row) { index[row.id] = row; return index; }, {});
  var ledgerById = buildLedgerAccountingFacts_().reduce(function (index, row) { index[row.id] = row; return index; }, {});
  var items = listReconciliationItemRows_().filter(function (row) {
    return String(row.reconciliationId) === String(reconciliationId);
  }).map(function (row) {
    return {
      id: row.id,
      reconciliationId: row.reconciliationId,
      bankTransactionId: row.bankTransactionId || '',
      ledgerId: row.ledgerId || '',
      status: row.result,
      result: row.result,
      differenceAmount: Number(row.differenceAmount || 0),
      note: row.validationNote || '',
      validationNote: row.validationNote || '',
      createdAt: formatDateTimeValue_(row.createdAt),
      bank: row.bankTransactionId ? (bankById[row.bankTransactionId] || null) : null,
      ledger: row.ledgerId ? (ledgerById[row.ledgerId] || null) : null
    };
  });
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
  var leftTime = Date.parse(String(left || '').slice(0, 10) + 'T00:00:00Z');
  var rightTime = Date.parse(String(right || '').slice(0, 10) + 'T00:00:00Z');
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
        result: dateDistanceDays === 0 && depositorMatches ? '정상' : '확인필요'
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
    if (tied.length > 1) tied.forEach(function (row) { row.result = '확인필요'; });
  });
  return candidates.sort(function (a, b) { return b.score - a.score; });
}
