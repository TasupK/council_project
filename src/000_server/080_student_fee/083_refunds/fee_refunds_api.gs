// 1. 환불신청 조회 API
function api_getStudentFeeRefundRequests(input) {
  return apiHandler_({
    operation: 'getFeeRefundRequestList', input: input, requireLogin: true,
    access: studentFeeApiAccess_('view'),
    parse: parseStudentFeeRequest_,
    service: function (parsed) { return getFeeRefundRequestListData_(parsed.request); }
  });
}

function api_getStudentFeeRefundRequest(input) {
  return apiHandler_({
    operation: 'getFeeRefundRequestDetail', input: input, requireLogin: true,
    access: studentFeeApiAccess_('view'),
    parse: parseStudentFeeRequest_,
    service: function (parsed) { return getFeeRefundRequestDetailData_(parsed.request); }
  });
}

// 2. 환불 처리 API
function api_processStudentFeeRefundRequests(input) {
  return apiHandler_({
    operation: 'processFeeRefundRequests', input: input, requireLogin: true,
    access: studentFeeApiAccess_('approve'),
    parse: parseStudentFeeRequest_,
    service: function (parsed, context) { return processFeeRefundRequestsData_(parsed.request, context); }
  });
}

function api_calculateStudentFeeRefund(input) {
  return apiHandler_({
    operation: 'calculateFeeRefund', input: input, requireLogin: true,
    access: studentFeeApiAccess_('view'),
    parse: parseStudentFeeRequest_,
    service: function (parsed) { return calculateFeeRefundData_(parsed.request); }
  });
}

function api_confirmStudentFeeRefund(input) {
  return apiHandler_({
    operation: 'confirmFeeRefund', input: input, requireLogin: true,
    access: studentFeeApiAccess_('approve'),
    parse: parseStudentFeeRequest_,
    service: function (parsed, context) { return confirmFeeRefundData_(parsed.request, context); }
  });
}
