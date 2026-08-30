// 1. 학생회비 화면용 기준정보 조회 API
function api_getStudentFeeReference(input) {
  return apiHandler_({
    operation: 'getStudentFeeReferenceData', input: input, requireLogin: true,
    access: studentFeeApiAccess_('view'),
    parse: parseStudentFeeRequest_,
    service: function () { return getStudentFeeReferenceData_(); }
  });
}
