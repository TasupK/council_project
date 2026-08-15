// 1. 결산 화면용 장부 집계
function api_getSettlementSummary(filter) {
  return apiHandler_({
    operation: 'getSettlementSummary',
    input: filter,
    requireLogin: true,
    service: function (request) {
      var items = filterLedgerEntries_(getLedgerEntries_(), request || {});
      var income = items.reduce(function (sum, item) {
        return sum + (item.transaction_type === '수입' ? Number(item.amount) : 0);
      }, 0);
      var expense = items.reduce(function (sum, item) {
        return sum + (item.transaction_type === '지출' ? Number(item.amount) : 0);
      }, 0);
      return {
        totalIncome: income,
        totalExpense: expense,
        balance: income - expense,
        eventCount: findAllAccountingEventRows_().length,
        evidenceCount: findAllLedgerEvidenceRows_().length
      };
    }
  });
}

// TODO(결산 보고서): 저장 대상과 출력 형식 확정 후 생성·조회·내보내기 함수를 구현한다.
