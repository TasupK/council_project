/** 감사대사 mutation/business service */

function runReconciliation_(request, context) {
  request = request || {};
  if (!request.startDate || !request.endDate) throw new Error('startDate와 endDate가 필요합니다.');
  if (request.startDate > request.endDate) throw new Error('감사 시작일이 종료일보다 늦을 수 없습니다.');
  var banks = listBankTransactionRows_().filter(function (row) { return inAccountingDateRange_(row.transactionAt, request.startDate, request.endDate); });
  var ledgers = getReconciliationLedgerCandidates_({ startDate: request.startDate, endDate: request.endDate });
  var results = buildReconciliationResults_(banks, ledgers);
  var claimed = {};
  results.forEach(function (item) { if (item.status === '정상' && item.ledgerId) claimed[item.ledgerId] = true; });
  var evidenceByTransaction = groupBy_(listLedgerEvidenceRows_(), 'transactionId');
  var now = getCurrentIsoDateTime_();
  var id = makeId_('REC');
  var header = {
    id: id, auditStartDate: request.startDate, auditEndDate: request.endDate,
    accountOpeningBalance: '', ledgerOpeningBalance: '', accountClosingBalance: '', ledgerClosingBalance: '',
    accountTransactionCount: banks.length, ledgerTransactionCount: ledgers.length,
    missingCount: results.filter(function (item) { return item.status === '원장누락의심'; }).length,
    excessCount: ledgers.filter(function (item) { return !claimed[item.transaction_id]; }).length,
    mismatchCount: results.filter(function (item) { return item.status === '확인필요'; }).length,
    missingEvidenceCount: results.filter(function (item) { return item.status === '정상' && item.ledgerId && !(evidenceByTransaction[item.ledgerId] || []).length; }).length,
    status: results.some(function (item) { return item.status !== '정상'; }) ? '확인필요' : '정상',
    managerId: getAccountingActorEmail_(context), confirmedAt: now,
    confirmation: '계좌-원장 자동 대사 실행'
  };
  insertReconciliationRow_(header);
  results.forEach(function (result) {
    insertReconciliationItemRow_({ id: makeId_('RCI'), reconciliationId: id, bankTransactionId: result.bankTransactionId, ledgerId: result.ledgerId || '', status: result.status, differenceAmount: Number(result.differenceAmount || 0), matchMethod: result.matchMethod || '', note: result.note || '', createdAt: now, updatedAt: now });
  });
  writeAccountingAudit_(header.managerId, 'RECONCILE', 'RECONCILIATION', id, '', JSON.stringify(header), '공식 감사대사 실행');
  return getReconciliationDetail_(id);
}

function linkReconciliation_(request, context) {
  request = request || {};
  if (!request.reconciliationItemId || !request.ledgerId) throw new Error('대사상세ID와 원장ID가 필요합니다.');
  var item = findReconciliationItemRowById_(request.reconciliationItemId);
  if (!item) throw new Error('대사 상세를 찾을 수 없습니다.');
  var bank = findBankTransactionRowById_(item.bankTransactionId);
  var ledger = findLedgerEntryDtoById_(request.ledgerId);
  if (!bank || !ledger) throw new Error('계좌 거래 또는 원장을 찾을 수 없습니다.');
  if (isTruthyValue_(bank.expense) !== (ledger.transaction_type === '지출')) throw new Error('수입/지출 방향이 일치하지 않습니다.');
  if (Math.abs(Number(bank.amount || 0)) !== Math.abs(Number(ledger.amount || 0))) throw new Error('거래금액이 일치하지 않습니다.');
  var claimed = listReconciliationItemRows_().some(function (row) { return String(row.reconciliationId) === String(item.reconciliationId) && String(row.id) !== String(item.id) && row.status === '정상' && String(row.ledgerId || '') === String(request.ledgerId); });
  if (claimed) throw new Error('같은 대사에서 이미 연결된 원장입니다.');
  var changes = { ledgerId: request.ledgerId, status: '정상', differenceAmount: 0, matchMethod: 'manual', note: request.note || '수동 연결', updatedAt: getCurrentIsoDateTime_() };
  updateReconciliationItemRowById_(item.id, changes);
  writeAccountingAudit_(getAccountingActorEmail_(context), 'LINK', 'RECONCILIATION_ITEM', item.id, JSON.stringify(item), JSON.stringify(changes), changes.note);
  return getReconciliationDetail_(item.reconciliationId);
}

function createLedgerFromReconciliation_(request, context) {
  request = request || {};
  var item = findReconciliationItemRowById_(request.reconciliationItemId);
  if (!item) throw new Error('대사 상세를 찾을 수 없습니다.');
  var bank = findBankTransactionRowById_(item.bankTransactionId);
  if (!bank) throw new Error('계좌 거래를 찾을 수 없습니다.');
  var saved = saveLedgerEntry_({
    transaction_type: isTruthyValue_(bank.expense) ? '지출' : '수입',
    transaction_date: String(bank.transactionAt || '').slice(0, 10), amount: Number(bank.amount || 0),
    counterparty: request.counterparty || bank.counterparty || '', description: request.description || bank.description || '',
    event_id: request.event_id || '', source: '계좌대사', match_status: '정상', business_type: '대사생성', business_id: item.id
  }, context, 'ACTIVE');
  var changes = { ledgerId: saved.item.transaction_id, status: '정상', differenceAmount: 0, matchMethod: 'created', note: request.note || '계좌 거래에서 원장 생성 후 연결', updatedAt: getCurrentIsoDateTime_() };
  updateReconciliationItemRowById_(item.id, changes);
  writeAccountingAudit_(getAccountingActorEmail_(context), 'CREATE_AND_LINK', 'RECONCILIATION_ITEM', item.id, JSON.stringify(item), JSON.stringify(changes), changes.note);
  return getReconciliationDetail_(item.reconciliationId);
}
