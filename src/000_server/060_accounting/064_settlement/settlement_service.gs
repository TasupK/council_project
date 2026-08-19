/** 전체 결산 snapshot service */
function createSettlementReportData_(request, context) {
  request = request || {};
  if (!request.startDate || !request.endDate) throw new Error('startDate와 endDate가 필요합니다.');
  if (request.startDate > request.endDate) throw new Error('결산 시작일이 종료일보다 늦을 수 없습니다.');
  var summary = getSettlementSummaryData_({ startDate: request.startDate, endDate: request.endDate });
  var row = {
    id: generateAccountingId_('SET'),
    name: request.name || (request.startDate + ' ~ ' + request.endDate + ' 결산'),
    startDate: request.startDate,
    endDate: request.endDate,
    openingBalance: summary.openingBalance,
    totalIncome: summary.totalIncome,
    totalExpense: summary.totalExpense,
    closingBalance: summary.closingBalance,
    incomeCount: summary.incomeCount,
    expenseCount: summary.expenseCount,
    unreconciledCount: summary.unreconciledCount,
    missingEvidenceCount: summary.missingEvidenceCount,
    status: '작성중',
    reportDriveFileId: '',
    managerId: resolveAccountingActorEmail_(context),
    createdAt: getCurrentIsoDateTime_(),
    confirmedAt: '',
    note: request.note || ''
  };
  insertSettlementReportRow_(row);
  writeAccountingAudit_(row.managerId, 'SETTLEMENT', 'SETTLEMENT_REPORT', row.id, '', JSON.stringify(row), '결산 snapshot 작성');
  return row;
}

function confirmSettlementReportData_(request, context) {
  request = request || {};
  if (!request.reportId) throw new Error('reportId가 필요합니다.');
  var before = findSettlementReportRowById_(request.reportId);
  if (!before) throw new Error('결산 보고서를 찾을 수 없습니다.');
  if (before.status === '확정') return before;
  var changes = {
    status: '확정',
    confirmedAt: getCurrentIsoDateTime_(),
    reportDriveFileId: request.reportDriveFileId || before.reportDriveFileId || '',
    note: request.note == null ? (before.note || '') : request.note
  };
  updateSettlementReportRowById_(request.reportId, changes);
  writeAccountingAudit_(resolveAccountingActorEmail_(context), 'CONFIRM', 'SETTLEMENT_REPORT', request.reportId, JSON.stringify(before), JSON.stringify(changes), '결산 확정');
  return Object.assign({}, before, changes);
}
