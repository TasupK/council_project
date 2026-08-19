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

  var banks = listBankTransactionRows_().filter(function (row) {
    return String(row.recordStatus || '정상') !== '무효' &&
      isAccountingDateInRange_(row.transactionAt, request.startDate, request.endDate);
  });
  var ledgers = buildReconciliationLedgerCandidates_({ startDate: request.startDate, endDate: request.endDate });
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
    unverifiedBankCount: results.filter(function (item) { return item.result === '계좌미확인'; }).length,
    reviewRequiredCount: results.filter(function (item) { return item.result === '확인필요'; }).length,
    status: results.some(function (item) { return item.result !== '정상'; }) ? '확인필요' : '정상',
    managerId: actor,
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
  writeAccountingAudit_(actor, 'RECONCILE', 'RECONCILIATION', id, '', JSON.stringify(header), '감사대사 snapshot 생성');
  return getReconciliationDetailData_(id);
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
