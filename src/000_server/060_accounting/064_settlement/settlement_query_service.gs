/** 전체 결산 read-only query */

function getSettlementEligibleItems_(filter) {
  filter = filter || {};
  return getLedgerEntries_().filter(function (item) {
    return isSettlementEligibleLedgerEntry_(item) && inAccountingDateRange_(item.transaction_date, filter.startDate, filter.endDate);
  });
}

function getSettlementSummary_(filter) {
  var items = getSettlementEligibleItems_(filter || {});
  var ids = items.reduce(function (index, item) { index[item.transaction_id] = true; return index; }, {});
  var evidenceCount = findAllLedgerEvidenceRows_().filter(function (row) { return ids[row.transactionId]; }).length;
  var totalIncome = items.reduce(function (sum, item) { return sum + (item.transaction_type === '수입' ? Number(item.amount || 0) : 0); }, 0);
  var totalExpense = items.reduce(function (sum, item) { return sum + (item.transaction_type === '지출' ? Number(item.amount || 0) : 0); }, 0);
  return { totalIncome: totalIncome, totalExpense: totalExpense, balance: totalIncome - totalExpense, incomeCount: items.filter(function (item) { return item.transaction_type === '수입'; }).length, expenseCount: items.filter(function (item) { return item.transaction_type === '지출'; }).length, evidenceCount: evidenceCount };
}

function getSettlementReportList_(filter) {
  filter = filter || {};
  var items = findAllSettlementReportRows_().filter(function (row) {
    if (filter.startDate && String(row.endDate || '') < filter.startDate) return false;
    if (filter.endDate && String(row.startDate || '') > filter.endDate) return false;
    return true;
  }).sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
  return { items: items, totalCount: items.length };
}

function getSettlementReport_(reportId) { return findSettlementReportRowById_(reportId); }

function exportSettlementReport_(request) {
  request = request || {};
  var report = findSettlementReportRowById_(request.reportId);
  if (!report) throw new Error('결산 보고서를 찾을 수 없습니다.');
  return { fileName: '결산보고서_' + report.startDate + '_' + report.endDate, report: report, ledgerItems: getSettlementEligibleItems_({ startDate: report.startDate, endDate: report.endDate }) };
}
