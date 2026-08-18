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

// 3. Google Forms 응답 동기화
function api_syncApplicantsFromForms(input) {
  return apiHandler_({
    operation: 'syncApplicantsFromForms',
    input: input,
    requireLogin: true,
    parse: parseEventRequest_,
    service: function (parsed, context) {
      requireEventEditContext_(context);
      return syncApplicantsFromFormsData_(parsed.request, context);
    }
  });
}
