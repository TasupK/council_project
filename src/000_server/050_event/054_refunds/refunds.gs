// 1. 행사 환불 대상 조회
function api_getEventRefundList(input) {
  requireLoginContext_();
  return getEventRefundListData_(parseEventRequest_(input).request);
}

// TODO(행사 환불): 대상 선정, 계좌, 이체 결과 규칙 확정 후 처리 함수를 구현한다.
