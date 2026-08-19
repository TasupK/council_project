/** 전체 결산 read-only query */

function buildSettlementSnapshotMetrics_(priorRows, periodRows, evidenceRows) {
  function active_(rows) {
    return (rows || []).filter(function (row) { return String(row.recordStatus || '활성') !== '무효'; });
  }
  function signedTotal_(rows) {
    return active_(rows).reduce(function (sum, row) {
      return sum + (row.transactionType === '수입' ? Number(row.amount || 0) : -Number(row.amount || 0));
    }, 0);
  }

  var prior = active_(priorRows);
  var period = active_(periodRows);
  var evidenceByTransaction = (evidenceRows || []).reduce(function (index, row) {
    index[String(row.transactionId || '')] = true;
    return index;
  }, {});
  var openingBalance = signedTotal_(prior);
  var totalIncome = period.reduce(function (sum, row) { return sum + (row.transactionType === '수입' ? Number(row.amount || 0) : 0); }, 0);
  var totalExpense = period.reduce(function (sum, row) { return sum + (row.transactionType === '지출' ? Number(row.amount || 0) : 0); }, 0);
  return {
    openingBalance: openingBalance,
    totalIncome: totalIncome,
    totalExpense: totalExpense,
    closingBalance: openingBalance + totalIncome - totalExpense,
    incomeCount: period.filter(function (row) { return row.transactionType === '수입'; }).length,
    expenseCount: period.filter(function (row) { return row.transactionType === '지출'; }).length,
    unreconciledCount: period.filter(function (row) { return !row.bankTransactionId || row.matchStatus !== '정상'; }).length,
    missingEvidenceCount: period.filter(function (row) { return !evidenceByTransaction[String(row.id || '')]; }).length
  };
}

function getSettlementSourceRows_(filter) {
  filter = filter || {};
  var all = listLedgerRows_().filter(function (row) { return String(row.recordStatus || '활성') !== '무효'; });
  return {
    prior: all.filter(function (row) { return String(row.transactionAt || '').slice(0, 10) < String(filter.startDate || ''); }),
    period: all.filter(function (row) { return isAccountingDateInRange_(row.transactionAt, filter.startDate, filter.endDate); })
  };
}

function getSettlementSummaryData_(filter) {
  filter = filter || {};
  var source = getSettlementSourceRows_(filter);
  return buildSettlementSnapshotMetrics_(source.prior, source.period, listLedgerEvidenceRows_());
}

function getSettlementReportListData_(filter) {
  filter = filter || {};
  var items = listSettlementReportRows_().filter(function (row) {
    if (filter.startDate && String(row.endDate || '') < filter.startDate) return false;
    if (filter.endDate && String(row.startDate || '') > filter.endDate) return false;
    return true;
  }).sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
  return { items: items, totalCount: items.length };
}

function getSettlementReportData_(reportId) { return findSettlementReportRowById_(reportId); }

function exportSettlementReport_(request) {
  request = request || {};
  var report = findSettlementReportRowById_(request.reportId);
  if (!report) throw new Error('결산 보고서를 찾을 수 없습니다.');
  return {
    fileName: '결산보고서_' + report.startDate + '_' + report.endDate,
    report: report
  };
}
