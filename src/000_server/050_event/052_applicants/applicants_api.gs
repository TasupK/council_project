// 1. 행사 신청자 조회
function api_getEventApplicants(input) {
  return apiHandler_({
    operation: 'getApplicantList', input: input, requireLogin: true,
    access: eventApiAccess_('view'),
    parse: parseEventRequest_,
    service: function (parsed) { return getApplicantListData_(parsed.request); }
  });
}

function api_getEventApplicant(input) {
  return apiHandler_({
    operation: 'getApplicantDetail', input: input, requireLogin: true,
    access: eventApiAccess_('view'),
    parse: parseEventRequest_,
    service: function (parsed) { return getApplicantDetailData_(parsed.request); }
  });
}

// 2. 행사 신청자 처리
function api_processEventApplicant(input) {
  return apiHandler_({
    operation: 'processApplicant', input: input, requireLogin: true,
    access: eventApiAccess_('approve'),
    parse: parseEventRequest_,
    service: function (parsed, context) { return processApplicantData_(parsed.request, context); }
  });
}

// 3. Google Forms 응답 동기화
function api_syncEventApplicantsFromForms(input) {
  return apiHandler_({
    operation: 'syncApplicantsFromForms', input: input, requireLogin: true,
    access: eventApiAccess_('edit'),
    parse: parseEventRequest_,
    service: function (parsed, context) { return applyApplicantFormSyncData_(parsed.request, context); }
  });
}
