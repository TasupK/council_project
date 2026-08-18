/** 전체 결산 snapshot service */
function createSettlementReportData_(request, context) {
  request = request || {};
  if (!request.startDate || !request.endDate) throw new Error('startDate와 endDate가 필요합니다.');
  if (request.startDate > request.endDate) throw new Error('결산 시작일이 종료일보다 늦을 수 없습니다.');
  var summary = getSettlementSummaryData_({ startDate: request.startDate, endDate: request.endDate });
  var row = { id: generateAccountingId_('SET'), startDate: request.startDate, endDate: request.endDate, totalIncome: summary.totalIncome, totalExpense: summary.totalExpense, balance: summary.balance, incomeCount: summary.incomeCount, expenseCount: summary.expenseCount, evidenceCount: summary.evidenceCount, status: '생성완료', managerId: resolveAccountingActorEmail_(context), createdAt: getCurrentIsoDateTime_() };
  insertSettlementReportRow_(row);
  writeAccountingAudit_(row.managerId, 'SETTLEMENT', 'SETTLEMENT_REPORT', row.id, '', JSON.stringify(row), '전체 결산 스냅샷 생성');
  return row;
}
