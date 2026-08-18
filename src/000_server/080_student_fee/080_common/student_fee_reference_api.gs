// 1. 학생회비 화면용 기준정보 조회 API
function api_getStudentFeeReferenceData(input) {
  return apiHandler_({
    operation: 'getStudentFeeReferenceData', input: input, requireLogin: true,
    access: { domain: 'student_fee', action: 'view' },
    parse: parseStudentFeeRequest_,
    service: function () { return getStudentFeeReferenceData_(); }
  });
}
