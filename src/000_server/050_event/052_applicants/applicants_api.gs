// 1. 행사 신청자 조회
function api_getApplicantList(input) {
  return apiHandler_({
    operation: 'getApplicantList',
    input: input,
    requireLogin: true,
    parse: parseEventRequest_,
    service: function (parsed) { return getApplicantListData_(parsed.request); }
  });
}

function api_getApplicantDetail(input) {
  return apiHandler_({
    operation: 'getApplicantDetail',
    input: input,
    requireLogin: true,
    parse: parseEventRequest_,
    service: function (parsed) { return getApplicantDetailData_(parsed.request); }
  });
}

// 2. 행사 신청자 처리
function api_processApplicant(input) {
  return apiHandler_({
    operation: 'processApplicant',
    input: input,
    requireLogin: true,
    parse: parseEventRequest_,
    service: function (parsed) { return processApplicantData_(parsed.request); }
  });
}

// TODO(행사 연동): Google Forms 원본 ID와 응답 열 매핑 확정 후 동기화 함수를 구현한다.
