// 1. 행사 환불 대상 조회
function api_getEventRefundList(input) {
  return apiHandler_({
    operation: 'getEventRefundList', input: input, requireLogin: true,
    access: { domain: 'event', action: 'view' },
    parse: parseEventRequest_,
    service: function (parsed) { return getEventRefundListData_(parsed.request); }
  });
}

// TODO(행사 환불): 대상 선정, 계좌, 이체 결과 규칙 확정 후 처리 함수를 구현한다.
