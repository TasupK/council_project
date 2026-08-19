// 1. 학생회비 요약 API
function api_getStudentFeeSummary(input) {
  return apiHandler_({
    operation: 'getStudentFeeSummary', input: input, requireLogin: true,
    access: studentFeeApiAccess_('view'),
    parse: parseStudentFeeRequest_,
    service: function () { return getStudentFeeSummaryData_(); }
  });
}

// 2. 납부신청 조회 API
function api_getStudentFeeApplications(input) {
  return apiHandler_({
    operation: 'getFeeApplicationList', input: input, requireLogin: true,
    access: studentFeeApiAccess_('view'),
    parse: parseStudentFeeRequest_,
    service: function (parsed) { return getFeeApplicationListData_(parsed.request); }
  });
}

function api_getStudentFeeApplication(input) {
  return apiHandler_({
    operation: 'getFeeApplicationDetail', input: input, requireLogin: true,
    access: studentFeeApiAccess_('view'),
    parse: parseStudentFeeRequest_,
    service: function (parsed) { return getFeeApplicationDetailData_(parsed.request); }
  });
}

// 3. 납부 처리 API
function api_processStudentFeeApplications(input) {
  return apiHandler_({
    operation: 'processFeeApplications', input: input, requireLogin: true,
    access: studentFeeApiAccess_('approve'),
    parse: parseStudentFeeRequest_,
    service: function (parsed, context) { return processFeeApplicationsData_(parsed.request, context); }
  });
}

function api_calculateStudentFeeAmount(input) {
  return apiHandler_({
    operation: 'calculateFeeAmount', input: input, requireLogin: true,
    access: studentFeeApiAccess_('view'),
    parse: parseStudentFeeRequest_,
    service: function (parsed) { return calculateFeeAmountData_(parsed.request); }
  });
}

function api_confirmStudentFeePayment(input) {
  return apiHandler_({
    operation: 'confirmFeePayment', input: input, requireLogin: true,
    access: studentFeeApiAccess_('approve'),
    parse: parseStudentFeeRequest_,
    service: function (parsed, context) { return confirmFeePaymentData_(parsed.request, context); }
  });
}
