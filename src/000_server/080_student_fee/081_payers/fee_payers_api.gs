// 1. 회비납부자 조회 API
function api_getFeePayerList(input) {
  return apiHandler_({
    operation: 'getFeePayerList', input: input, requireLogin: true,
    access: studentFeeApiAccess_('view'),
    parse: parseStudentFeeRequest_,
    service: function (parsed) { return getFeePayerListData_(parsed.request); }
  });
}

function api_getFeePayerDetail(input) {
  return apiHandler_({
    operation: 'getFeePayerDetail', input: input, requireLogin: true,
    access: studentFeeApiAccess_('view'),
    parse: parseStudentFeeRequest_,
    service: function (parsed) { return getFeePayerDetailData_(parsed.request); }
  });
}

// 2. 회비납부자 생성/수정 API
function api_createFeePayer(input) {
  return apiHandler_({
    operation: 'createFeePayer', input: input, requireLogin: true,
    access: studentFeeApiAccess_('edit'),
    parse: parseStudentFeeRequest_,
    service: function (parsed, context) { return createFeePayerData_(parsed.request, context); }
  });
}

function api_updateFeePayer(input) {
  return apiHandler_({
    operation: 'updateFeePayer', input: input, requireLogin: true,
    access: studentFeeApiAccess_('edit'),
    parse: parseStudentFeeRequest_,
    service: function (parsed, context) { return updateFeePayerData_(parsed.request, context); }
  });
}
