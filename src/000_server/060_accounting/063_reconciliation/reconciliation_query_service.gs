/** 계좌-원장 대조 read-only query/matching */

function normalizeReconciliationText_(value) {
  var stopWords = ['주식회사', '유한회사', '체크카드', '신용카드', '카드', '출금', '결제', '이체', '송금', '입금', '승인', '취소', '페이', '원'];
  var text = String(value || '').toLowerCase().replace(/\(주\)|㈜/g, ' ').replace(/[^0-9a-z가-힣]+/g, ' ');
  stopWords.forEach(function (word) { text = text.replace(new RegExp('(^|\\s)' + word + '(?=\\s|$)', 'g'), ' '); });
  return text.replace(/\s+/g, ' ').trim();
}

function buildReconciliationTokens_(value) { return normalizeReconciliationText_(value).split(' ').filter(function (token) { return token.length >= 2; }); }

function calculateReconciliationDateDifference_(left, right) {
  var a = String(left || '').slice(0, 10).split('-').map(Number), b = String(right || '').slice(0, 10).split('-').map(Number);
  if (a.length !== 3 || b.length !== 3 || a.some(isNaN) || b.some(isNaN)) return 999;
  return Math.abs(Math.round((Date.UTC(a[0], a[1] - 1, a[2]) - Date.UTC(b[0], b[1] - 1, b[2])) / 86400000));
}

function scoreReconciliationCandidate_(bank, ledger) {
  var bankExpense = isTruthyValue_(bank.expense);
  var ledgerExpense = ledger.transaction_type ? ledger.transaction_type === '지출' : isTruthyValue_(ledger.expense);
  if (bankExpense !== ledgerExpense) return null;
  if (Math.abs(Number(bank.amount || 0)) !== Math.abs(Number(ledger.amount || 0))) return null;
  var ledgerDate = ledger.transaction_date || ledger.transactionAt;
  var dateDifference = calculateReconciliationDateDifference_(bank.transactionAt, ledgerDate);
  if (dateDifference > 1) return null;
  var score = dateDifference === 0 ? 40 : 25;
  var bankCounterparty = normalizeReconciliationText_(bank.counterparty), ledgerCounterparty = normalizeReconciliationText_(ledger.counterparty);
  var exact = bankCounterparty.length >= 2 && bankCounterparty === ledgerCounterparty;
  var includes = !exact && bankCounterparty.length >= 2 && ledgerCounterparty.length >= 2 && (bankCounterparty.indexOf(ledgerCounterparty) > -1 || ledgerCounterparty.indexOf(bankCounterparty) > -1);
  if (exact) score += 40; else if (includes) score += 30;
  var bankTokens = buildReconciliationTokens_([bank.counterparty, bank.description].join(' '));
  var ledgerTokens = buildReconciliationTokens_([ledger.counterparty, ledger.description].join(' '));
  var common = bankTokens.filter(function (token) { return ledgerTokens.indexOf(token) > -1; });
  if (common.length) score += 15;
  return {
    ledgerId: ledger.transaction_id || ledger.id, transactionAt: ledgerDate, expense: ledgerExpense,
    amount: Number(ledger.amount || 0), counterparty: ledger.counterparty || '', description: ledger.description || '',
    score: score, dateDifference: dateDifference, textMatched: exact || includes || common.length > 0,
    matchDetail: exact ? '거래상대명 일치' : includes ? '거래상대명 일부 일치' : common.length ? '적요 공통어 일치' : '문자열 일치 없음'
  };
}

function buildReconciliationLedgerCandidates_(filter) {
  filter = filter || {};
  return getLedgerEntriesData_().filter(function (item) {
    return item.record_status === 'ACTIVE' && isAccountingDateInRange_(item.transaction_date, filter.startDate, filter.endDate);
  });
}

function calculateReconciliationCandidateScores_(bank, ledgers) {
  return (ledgers || []).map(function (ledger) { return scoreReconciliationCandidate_(bank, ledger); }).filter(Boolean).sort(function (a, b) {
    return b.score - a.score || a.dateDifference - b.dateDifference || String(a.ledgerId).localeCompare(String(b.ledgerId));
  });
}

function buildReconciliationResults_(banks, ledgers) {
  var claimed = {};
  var results = (banks || []).map(function (bank) {
    var candidates = calculateReconciliationCandidateScores_(bank, ledgers);
    if (!candidates.length) return { bankTransactionId: bank.id || '', status: '원장누락의심', ledgerId: '', differenceAmount: Number(bank.amount || 0), matchMethod: '', note: '동일 방향·금액·거래일 조건의 원장 후보가 없습니다.', candidates: [] };
    var best = candidates[0], unique = candidates.length === 1 || best.score > candidates[1].score;
    if (!best.textMatched || !unique) return { bankTransactionId: bank.id || '', status: '확인필요', ledgerId: '', differenceAmount: 0, matchMethod: '', note: !best.textMatched ? '금액과 날짜는 일치하지만 거래상대/적요 확인이 필요합니다.' : '동점 후보가 여러 개입니다.', candidates: candidates.slice(0, 5) };
    return { bankTransactionId: bank.id || '', status: '정상', ledgerId: best.ledgerId, differenceAmount: Math.abs(Number(bank.amount || 0) - Number(best.amount || 0)), matchMethod: 'auto', note: '자동 대조 조건이 충족되었습니다.', candidates: candidates.slice(0, 5) };
  });
  results.forEach(function (result) {
    if (result.status !== '정상') return;
    if (!claimed[result.ledgerId]) claimed[result.ledgerId] = [];
    claimed[result.ledgerId].push(result);
  });
  Object.keys(claimed).forEach(function (ledgerId) {
    if (claimed[ledgerId].length < 2) return;
    claimed[ledgerId].forEach(function (result) { result.status = '확인필요'; result.ledgerId = ''; result.matchMethod = ''; result.note = '여러 계좌 거래가 같은 원장을 최우선 후보로 선택했습니다.'; });
  });
  return results;
}

function getReconciliationListData_(filter) {
  filter = filter || {};
  var items = listReconciliationRows_().filter(function (row) {
    if (filter.startDate && String(row.auditEndDate || '') < filter.startDate) return false;
    if (filter.endDate && String(row.auditStartDate || '') > filter.endDate) return false;
    return true;
  }).sort(function (a, b) { return String(b.confirmedAt || '').localeCompare(String(a.confirmedAt || '')); });
  return { items: items, totalCount: items.length };
}

function getReconciliationDetailData_(reconciliationId) {
  var header = findReconciliationRowById_(reconciliationId);
  if (!header) return null;
  var bankById = listBankTransactionRows_().reduce(function (index, row) { index[row.id] = row; return index; }, {});
  var ledgerById = getLedgerEntriesData_().reduce(function (index, row) { index[row.transaction_id] = row; return index; }, {});
  var items = listReconciliationItemRows_().filter(function (row) { return String(row.reconciliationId) === String(reconciliationId); }).map(function (row) {
    return { id: row.id, reconciliationId: row.reconciliationId, bankTransactionId: row.bankTransactionId, ledgerId: row.ledgerId || '', status: row.status, differenceAmount: Number(row.differenceAmount || 0), matchMethod: row.matchMethod || '', note: row.note || '', createdAt: formatDateTimeValue_(row.createdAt), updatedAt: formatDateTimeValue_(row.updatedAt), bank: bankById[row.bankTransactionId] || null, ledger: row.ledgerId ? (ledgerById[row.ledgerId] || null) : null };
  });
  return { header: header, items: items };
}

function getReconciliationCandidatesData_(request) {
  request = request || {};
  var item = request.reconciliationItemId ? findReconciliationItemRowById_(request.reconciliationItemId) : null;
  var bank = item ? findBankTransactionRowById_(item.bankTransactionId) : (request.bankTransactionId ? findBankTransactionRowById_(request.bankTransactionId) : null);
  if (!bank) throw new Error('계좌 거래를 찾을 수 없습니다.');
  return { items: calculateReconciliationCandidateScores_(bank, buildReconciliationLedgerCandidates_({ startDate: request.startDate, endDate: request.endDate })).slice(0, 10) };
}
