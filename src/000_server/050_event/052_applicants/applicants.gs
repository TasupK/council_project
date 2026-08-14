// 1. 행사 신청자 조회
function api_getApplicantList(input) {
  requireLoginContext_();
  return getApplicantListData_(parseEventRequest_(input).request);
}

function api_getApplicantDetail(input) {
  requireLoginContext_();
  return getApplicantDetailData_(parseEventRequest_(input).request);
}

// 2. 행사 신청자 처리
function api_processApplicant(input) {
  requireLoginContext_();
  return processApplicantData_(parseEventRequest_(input).request);
}

// TODO(행사 연동): Google Forms 원본 ID와 응답 열 매핑 확정 후 동기화 함수를 구현한다.
